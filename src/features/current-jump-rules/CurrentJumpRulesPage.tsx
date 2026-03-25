import { useState } from 'react';
import { accessModes } from '../../domain/common';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import {
  applyRulesModulePreset,
  builtInRulesModulePresets,
  diffRulesModuleSettings,
  getRulesModulePresetById,
  markRulesModuleSettingOverride,
  rulesAccessKeys,
  rulesCustomizationLabels,
  rulesDefaultLabels,
  rulesModuleCustomizationKeys,
  type RulesAccessKey,
  type RulesDefaultKey,
  type RulesModuleCustomizationKey,
  type RulesModuleSettings,
} from '../../domain/rules/customization';
import type { JsonMap } from '../../domain/common';
import { db } from '../../db/database';
import type { HouseRuleProfile, JumpRulesContext } from '../../domain/rules/types';
import { createBlankHouseRuleProfile, createBlankJumpRulesContext, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

const rulesSourceLabels = {
  'jump-context': 'Jump context',
  'branch-defaults': 'Branch defaults',
  'chain-defaults': 'Chain defaults',
} as const;

const rulesCustomizationDescriptions: Record<RulesModuleCustomizationKey, string> = {
  showEffectSources: 'Include scope and owner details when rule effects contribute to the effective summary.',
  showAdvancedMetadata: 'Keep the raw metadata editor visible for deep inspection and migration-safe manual edits.',
  showPresetDiff: 'Show a field-by-field diff before applying a built-in rules preset.',
  showFallbackSourceBadges: 'Surface whether the active jump is using jump overrides, branch defaults, or chain defaults.',
  highlightRuleOverrides: 'Call out the jump-context fields that diverge from the active branch defaults.',
};

function formatRulesSource(source: keyof typeof rulesSourceLabels) {
  return rulesSourceLabels[source];
}

function getContextOverrideEntries(currentRulesContext: JumpRulesContext, settings: RulesModuleSettings) {
  const entries: Array<{ path: string; label: string; value: string }> = [];

  for (const key of ['gauntlet', ...rulesAccessKeys] as const) {
    if (currentRulesContext[key] !== settings.defaults[key]) {
      entries.push({
        path: `defaults.${key}`,
        label: rulesDefaultLabels[key],
        value: typeof currentRulesContext[key] === 'boolean' ? (currentRulesContext[key] ? 'enabled' : 'disabled') : currentRulesContext[key],
      });
    }
  }

  return entries;
}

export function CurrentJumpRulesPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(builtInRulesModulePresets[0]?.id ?? 'manual-blank');
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const currentJump = effectiveState.currentJump;
  const currentRulesContext = effectiveState.currentRulesContext;
  const rulesProfile = effectiveState.branchRulesProfile;
  const rulesSettings = effectiveState.branchRulesSettings;
  const currentRulesSourceLabel = formatRulesSource(effectiveState.currentRulesSource);
  const selectedPreset =
    builtInRulesModulePresets.find((preset) => preset.id === selectedPresetId) ?? builtInRulesModulePresets[0] ?? null;
  const presetPreview = selectedPreset ? applyRulesModulePreset(rulesSettings, selectedPreset) : rulesSettings;
  const presetDiff = selectedPreset ? diffRulesModuleSettings(rulesSettings, presetPreview) : [];
  const appliedPreset = rulesSettings.appliedPresetId ? getRulesModulePresetById(rulesSettings.appliedPresetId) : null;
  const contextOverrides = currentRulesContext ? getContextOverrideEntries(currentRulesContext, rulesSettings) : [];

  async function saveRulesProfileRecord(nextProfile: HouseRuleProfile, successMessage: string) {
    try {
      await saveChainRecord(db.houseRuleProfiles, nextProfile);
      setNotice({
        tone: 'success',
        message: successMessage,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save branch rules profile.',
      });
    }
  }

  function getDraftRulesProfile() {
    if (!workspace.activeBranch) {
      return null;
    }

    return (
      rulesProfile ??
      createBlankHouseRuleProfile(chainId, workspace.activeBranch.id, workspace.chain.chainSettings.altForms)
    );
  }

  async function saveRulesProfileSettings(nextSettings: RulesModuleSettings, successMessage: string) {
    const profile = getDraftRulesProfile();

    if (!profile) {
      return;
    }

    await saveRulesProfileRecord(
      {
        ...profile,
        settings: nextSettings as unknown as JsonMap,
      },
      successMessage,
    );
  }

  async function handleCreateProfile() {
    const profile = getDraftRulesProfile();

    if (!profile || rulesProfile) {
      return;
    }

    await saveRulesProfileRecord(profile, 'Created a branch rules profile for this module.');
  }

  async function updateRulesProfileField(key: 'title' | 'description', value: string) {
    if (!rulesProfile) {
      return;
    }

    await saveRulesProfileRecord(
      {
        ...rulesProfile,
        [key]: value,
      },
      'Saved branch rules profile details.',
    );
  }

  async function updateRuleDefault(key: RulesDefaultKey, value: JumpRulesContext[RulesDefaultKey]) {
    const nextSettings = markRulesModuleSettingOverride(
      {
        ...rulesSettings,
        defaults: {
          ...rulesSettings.defaults,
          [key]: value,
        },
      },
      `defaults.${key}`,
    );

    await saveRulesProfileSettings(nextSettings, 'Saved branch rules defaults.');
  }

  async function updateModuleCustomization(key: RulesModuleCustomizationKey, value: boolean) {
    const nextSettings = markRulesModuleSettingOverride(
      {
        ...rulesSettings,
        moduleCustomization: {
          ...rulesSettings.moduleCustomization,
          [key]: value,
        },
      },
      `moduleCustomization.${key}`,
    );

    await saveRulesProfileSettings(nextSettings, 'Saved rules module customization.');
  }

  async function handleApplyPreset() {
    if (!selectedPreset) {
      return;
    }

    await saveRulesProfileSettings(
      applyRulesModulePreset(rulesSettings, selectedPreset),
      `Applied the "${selectedPreset.name}" preset to the branch rules profile.`,
    );
  }

  async function handleCreateContext() {
    if (!workspace.activeBranch || !currentJump) {
      return;
    }

    try {
      await saveChainRecord(
        db.jumpRulesContexts,
        createBlankJumpRulesContext(chainId, workspace.activeBranch.id, currentJump.id, rulesSettings.defaults),
      );
      setNotice({
        tone: 'success',
        message: `Created a jump rules context from the active ${currentRulesSourceLabel.toLowerCase()}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create jump rules context.',
      });
    }
  }

  async function saveRulesContext(nextValue: JumpRulesContext | null) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.jumpRulesContexts, nextValue);
      setNotice({
        tone: 'success',
        message: 'Current-jump rules autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save current-jump rules.',
      });
    }
  }

  if (!currentJump) {
    return (
      <EmptyWorkspaceCard
        title="No current jump selected"
        body="Set an active jump from Overview or the Jumps module before editing current-jump rules."
      />
    );
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Current Jump Rules"
        description="Branch defaults, preset-driven module customization, and per-jump overrides all live together here."
        badge={currentJump.title}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Effective State</h3>
            <span className="pill">{effectiveState.gauntlet ? 'gauntlet' : 'standard'}</span>
          </div>
          <div className="inline-meta">
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.warehouseAccess}</strong>
              Warehouse
            </span>
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.powerAccess}</strong>
              Powers
            </span>
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.itemAccess}</strong>
              Items
            </span>
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.altFormAccess}</strong>
              Alt forms
            </span>
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.supplementAccess}</strong>
              Supplements
            </span>
          </div>

          {rulesSettings.moduleCustomization.showFallbackSourceBadges ? (
            <div className="inline-meta">
              <span className="pill">{currentRulesSourceLabel}</span>
              {rulesProfile ? <span className="pill">{rulesProfile.title}</span> : null}
              {appliedPreset ? <span className="pill">{appliedPreset.name}</span> : null}
            </div>
          ) : null}

          <p>
            {effectiveState.contributingEffects.length} active effects are contributing to the rule summary for this jump.
          </p>

          {effectiveState.contributingEffects.length > 0 && rulesSettings.moduleCustomization.showEffectSources ? (
            <ul className="list">
              {effectiveState.contributingEffects.map((effect) => (
                <li key={effect.id}>
                  <strong>{effect.title}</strong> ({effect.category}, {effect.state}) - {effect.scopeType} scope on{' '}
                  {effect.ownerEntityType}
                </li>
              ))}
            </ul>
          ) : effectiveState.contributingEffects.length > 0 ? (
            <p>Effect source details are hidden by the current module customization.</p>
          ) : (
            <p>No active scoped effects are currently influencing the rules summary.</p>
          )}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Branch Rules Profile</h3>
            <span className="pill">{rulesProfile ? 'active' : 'not created yet'}</span>
          </div>

          {!rulesProfile ? (
            <>
              <p>
                This branch is still using chain-level fallback defaults. Create a dedicated rules profile when you want
                reusable branch rules, module customization, and preset application.
              </p>
              <div className="actions">
                <button className="button" type="button" onClick={() => void handleCreateProfile()}>
                  Create Branch Rules Profile
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>Profile title</span>
                <input
                  value={rulesProfile.title}
                  onChange={(event) => void updateRulesProfileField('title', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={rulesProfile.description}
                  onChange={(event) => void updateRulesProfileField('description', event.target.value)}
                />
              </label>

              <div className="inline-meta">
                {appliedPreset ? <span className="pill">Preset: {appliedPreset.name}</span> : <span className="pill">Preset: custom</span>}
                <span className="pill">{rulesSettings.manualOverridePaths.length} manual overrides</span>
              </div>

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={rulesSettings.defaults.gauntlet}
                  onChange={(event) => void updateRuleDefault('gauntlet', event.target.checked)}
                />
                <span>{rulesDefaultLabels.gauntlet}</span>
              </label>

              <div className="field-grid field-grid--two">
                {rulesAccessKeys.map((key) => (
                  <label className="field" key={key}>
                    <span>{rulesDefaultLabels[key]}</span>
                    <select
                      value={rulesSettings.defaults[key]}
                      onChange={(event) =>
                        void updateRuleDefault(key, event.target.value as JumpRulesContext[RulesAccessKey])
                      }
                    >
                      {accessModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
        </article>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Module Customization</h3>
            <span className="pill">rules workspace</span>
          </div>
          <p>
            These switches control how much rule provenance and advanced editing the current-jump rules module exposes
            for the active branch.
          </p>

          {rulesModuleCustomizationKeys.map((key) => (
            <label className="field field--checkbox" key={key}>
              <input
                type="checkbox"
                checked={rulesSettings.moduleCustomization[key]}
                onChange={(event) => void updateModuleCustomization(key, event.target.checked)}
              />
              <span>{rulesCustomizationLabels[key]}</span>
              <small className="field-hint">{rulesCustomizationDescriptions[key]}</small>
            </label>
          ))}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Built-in Presets</h3>
            <span className="pill">{selectedPreset?.name ?? 'No preset'}</span>
          </div>

          <label className="field">
            <span>Preset</span>
            <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
              {builtInRulesModulePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>

          <p>{selectedPreset?.description ?? 'Choose a preset to preview and apply branch-level rules defaults.'}</p>

          {rulesSettings.moduleCustomization.showPresetDiff ? (
            presetDiff.length > 0 ? (
              <ul className="list">
                {presetDiff.map((entry) => (
                  <li key={entry.path}>
                    <strong>{entry.label}</strong>: {entry.before} {'->'} {entry.after}
                  </li>
                ))}
              </ul>
            ) : (
              <p>This preset matches the current branch settings already.</p>
            )
          ) : (
            <p>Preset diff preview is currently hidden by module customization.</p>
          )}

          <div className="actions">
            <button className="button" type="button" onClick={() => void handleApplyPreset()} disabled={!selectedPreset}>
              Apply Preset to Branch Defaults
            </button>
          </div>
        </article>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Rules Context</h3>
            <span className="pill">{currentRulesContext ? 'editable' : 'not created yet'}</span>
          </div>

          {!currentRulesContext ? (
            <>
              <p>
                This jump is currently inheriting {currentRulesSourceLabel.toLowerCase()}. Create a dedicated rules
                context when this jump needs explicit overrides.
              </p>
              <div className="actions">
                <button className="button" type="button" onClick={() => void handleCreateContext()}>
                  Create Rules Context from {currentRulesSourceLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              {rulesSettings.moduleCustomization.highlightRuleOverrides ? (
                contextOverrides.length > 0 ? (
                  <section className="stack stack--compact">
                    <h4>Jump Overrides</h4>
                    <ul className="list">
                      {contextOverrides.map((entry) => (
                        <li key={entry.path}>
                          <strong>{entry.label}</strong>: {entry.value}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p>This jump context currently matches the active branch defaults.</p>
                )
              ) : null}

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={currentRulesContext.gauntlet}
                  onChange={(event) =>
                    void saveRulesContext({
                      ...currentRulesContext,
                      gauntlet: event.target.checked,
                    })
                  }
                />
                <span>Gauntlet state</span>
              </label>

              <div className="field-grid field-grid--two">
                {rulesAccessKeys.map((key) => (
                  <label className="field" key={key}>
                    <span>{rulesDefaultLabels[key]}</span>
                    <select
                      value={currentRulesContext[key]}
                      onChange={(event) =>
                        void saveRulesContext({
                          ...currentRulesContext,
                          [key]: event.target.value as JumpRulesContext[RulesAccessKey],
                        })
                      }
                    >
                      {accessModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <label className="field">
                <span>Notes</span>
                <textarea
                  rows={6}
                  value={currentRulesContext.notes}
                  onChange={(event) =>
                    void saveRulesContext({
                      ...currentRulesContext,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              {rulesSettings.moduleCustomization.showAdvancedMetadata ? (
                <JsonEditorField
                  label="Import source metadata"
                  value={currentRulesContext.importSourceMetadata}
                  onValidChange={(value) =>
                    saveRulesContext({
                      ...currentRulesContext,
                      importSourceMetadata:
                        typeof value === 'object' && value !== null && !Array.isArray(value)
                          ? (value as Record<string, unknown>)
                          : {},
                    })
                  }
                />
              ) : (
                <p>Advanced metadata editing is hidden by the current module customization.</p>
              )}
            </>
          )}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Fallback Summary</h3>
            <span className="pill">{currentRulesSourceLabel}</span>
          </div>
          <p>
            These are the branch-visible defaults the current jump will inherit until you create or edit a dedicated
            jump context.
          </p>
          <div className="inline-meta">
            <span className="metric">
              <strong>{rulesSettings.defaults.gauntlet ? 'enabled' : 'disabled'}</strong>
              Gauntlet
            </span>
            {rulesAccessKeys.map((key) => (
              <span className="metric" key={key}>
                <strong>{rulesSettings.defaults[key]}</strong>
                {rulesDefaultLabels[key]}
              </span>
            ))}
          </div>
          {rulesSettings.manualOverridePaths.length > 0 ? (
            <p>{rulesSettings.manualOverridePaths.length} fields have been manually adjusted after preset application.</p>
          ) : (
            <p>No manual branch overrides are recorded yet.</p>
          )}
        </article>
      </section>
    </div>
  );
}
