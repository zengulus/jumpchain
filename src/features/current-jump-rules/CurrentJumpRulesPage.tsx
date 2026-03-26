import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { accessModes } from '../../domain/common';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import {
  applyRulesModulePreset,
  builtInRulesModulePresets,
  diffRulesModuleSettings,
  getRulesModulePresetById,
  markRulesModuleSettingOverride,
  parseRulesModuleSettings,
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
import {
  AdvancedJsonDetails,
  AssistiveHint,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { mergeAutosaveStatuses, useAutosaveRecord } from '../workspace/useAutosaveRecord';
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
        value:
          typeof currentRulesContext[key] === 'boolean'
            ? currentRulesContext[key]
              ? 'enabled'
              : 'disabled'
            : currentRulesContext[key],
      });
    }
  }

  return entries;
}

export function CurrentJumpRulesPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState(builtInRulesModulePresets[0]?.id ?? 'manual-blank');
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const currentJump = effectiveState.currentJump;
  const rulesProfile = effectiveState.branchRulesProfile;
  const currentRulesContext = effectiveState.currentRulesContext;
  const profileAutosave = useAutosaveRecord(rulesProfile, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.houseRuleProfiles, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save branch rules profile.'),
  });
  const contextAutosave = useAutosaveRecord(currentRulesContext, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumpRulesContexts, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save current-jump rules.'),
  });
  const autosaveStatus = mergeAutosaveStatuses([profileAutosave.status, contextAutosave.status]);
  const draftRulesProfile = profileAutosave.draft ?? rulesProfile;
  const draftRulesSettings = draftRulesProfile
    ? parseRulesModuleSettings(draftRulesProfile.settings, workspace.chain.chainSettings.altForms)
    : effectiveState.branchRulesSettings;
  const draftRulesContext = contextAutosave.draft ?? currentRulesContext;
  const currentRulesSourceLabel = formatRulesSource(effectiveState.currentRulesSource);
  const selectedPreset =
    builtInRulesModulePresets.find((preset) => preset.id === selectedPresetId) ?? builtInRulesModulePresets[0] ?? null;
  const presetPreview = selectedPreset ? applyRulesModulePreset(draftRulesSettings, selectedPreset) : draftRulesSettings;
  const presetDiff = selectedPreset ? diffRulesModuleSettings(draftRulesSettings, presetPreview) : [];
  const appliedPreset = draftRulesSettings.appliedPresetId ? getRulesModulePresetById(draftRulesSettings.appliedPresetId) : null;
  const contextOverrides = draftRulesContext ? getContextOverrideEntries(draftRulesContext, draftRulesSettings) : [];

  function getDraftRulesProfile() {
    if (!workspace.activeBranch) {
      return null;
    }

    return (
      draftRulesProfile ??
      createBlankHouseRuleProfile(chainId, workspace.activeBranch.id, workspace.chain.chainSettings.altForms)
    );
  }

  function updateRulesProfileDraft(updater: (profile: HouseRuleProfile) => HouseRuleProfile) {
    const profile = getDraftRulesProfile();

    if (!profile) {
      return;
    }

    profileAutosave.updateDraft(updater(profile));
  }

  function updateRulesProfileField(key: 'title' | 'description', value: string) {
    updateRulesProfileDraft((profile) => ({
      ...profile,
      [key]: value,
    }));
  }

  function updateRulesProfileSettings(nextSettings: RulesModuleSettings) {
    updateRulesProfileDraft((profile) => ({
      ...profile,
      settings: nextSettings as unknown as JsonMap,
    }));
  }

  function updateRuleDefault(key: RulesDefaultKey, value: JumpRulesContext[RulesDefaultKey]) {
    updateRulesProfileSettings(
      markRulesModuleSettingOverride(
        {
          ...draftRulesSettings,
          defaults: {
            ...draftRulesSettings.defaults,
            [key]: value,
          },
        },
        `defaults.${key}`,
      ),
    );
  }

  function updateModuleCustomization(key: RulesModuleCustomizationKey, value: boolean) {
    updateRulesProfileSettings(
      markRulesModuleSettingOverride(
        {
          ...draftRulesSettings,
          moduleCustomization: {
            ...draftRulesSettings.moduleCustomization,
            [key]: value,
          },
        },
        `moduleCustomization.${key}`,
      ),
    );
  }

  function updateRulesContext(nextValue: JumpRulesContext | null) {
    if (!nextValue) {
      return;
    }

    contextAutosave.updateDraft(nextValue);
  }

  async function handleCreateProfile() {
    const profile = getDraftRulesProfile();

    if (!profile || rulesProfile) {
      return;
    }

    try {
      await saveChainRecord(db.houseRuleProfiles, profile);
      setNotice({
        tone: 'success',
        message: 'Created a branch rules profile for this module.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save branch rules profile.',
      });
    }
  }

  function handleApplyPreset() {
    if (!selectedPreset) {
      return;
    }

    updateRulesProfileSettings(applyRulesModulePreset(draftRulesSettings, selectedPreset));
  }

  async function handleCreateContext() {
    if (!workspace.activeBranch || !currentJump) {
      return;
    }

    try {
      await saveChainRecord(
        db.jumpRulesContexts,
        createBlankJumpRulesContext(chainId, workspace.activeBranch.id, currentJump.id, draftRulesSettings.defaults),
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
        description={
          simpleMode
            ? 'Review the live rule state first, then set branch defaults or jump-specific overrides only where you need them.'
            : 'Branch defaults and per-jump overrides live here. Chainwide drawbacks and chain-owned rule effects live in Chainwide Rules.'
        }
        badge={currentJump.title}
        actions={
          <Link className="button button--secondary" to={`/chains/${chainId}/rules`}>
            Open Chainwide Rules
          </Link>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={autosaveStatus} />

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

          {draftRulesSettings.moduleCustomization.showFallbackSourceBadges ? (
            <div className="inline-meta">
              <span className="pill">{currentRulesSourceLabel}</span>
              {draftRulesProfile ? <span className="pill">{draftRulesProfile.title}</span> : null}
              {appliedPreset ? <span className="pill">{appliedPreset.name}</span> : null}
            </div>
          ) : null}

          <p>
            {effectiveState.contributingEffects.length} active effects are contributing to the rule summary for this jump.
          </p>

          {effectiveState.contributingEffects.length > 0 && draftRulesSettings.moduleCustomization.showEffectSources ? (
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
            <span className="pill">{draftRulesProfile ? 'active' : 'not created yet'}</span>
          </div>

          {!draftRulesProfile ? (
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
                  value={draftRulesProfile.title}
                  onChange={(event) => updateRulesProfileField('title', event.target.value)}
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={draftRulesProfile.description}
                  onChange={(event) => updateRulesProfileField('description', event.target.value)}
                />
              </label>

              <div className="inline-meta">
                {appliedPreset ? <span className="pill">Preset: {appliedPreset.name}</span> : <span className="pill">Preset: custom</span>}
                <span className="pill">{draftRulesSettings.manualOverridePaths.length} manual overrides</span>
              </div>

              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={draftRulesSettings.defaults.gauntlet}
                  onChange={(event) => updateRuleDefault('gauntlet', event.target.checked)}
                />
                <span>{rulesDefaultLabels.gauntlet}</span>
              </label>

              <div className="field-grid field-grid--two">
                {rulesAccessKeys.map((key) => (
                  <label className="field" key={key}>
                    <span>{rulesDefaultLabels[key]}</span>
                    <select
                      value={draftRulesSettings.defaults[key]}
                      onChange={(event) =>
                        updateRuleDefault(key, event.target.value as JumpRulesContext[RulesAccessKey])
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

      {simpleMode ? (
        <details className="details-panel">
          <summary className="details-panel__summary">
            <span>Reference and tools</span>
            <span className="pill">Optional</span>
          </summary>
          <div className="details-panel__body">
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
                      checked={draftRulesSettings.moduleCustomization[key]}
                      onChange={(event) => updateModuleCustomization(key, event.target.checked)}
                    />
                    <span className="field-label-row">
                      <span>{rulesCustomizationLabels[key]}</span>
                      <AssistiveHint text={rulesCustomizationDescriptions[key]} triggerLabel={`Explain ${rulesCustomizationLabels[key]}`} />
                    </span>
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

                {draftRulesSettings.moduleCustomization.showPresetDiff ? (
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
                  <button className="button" type="button" onClick={handleApplyPreset} disabled={!selectedPreset || !draftRulesProfile}>
                    Apply Preset to Branch Defaults
                  </button>
                </div>
              </article>
            </section>
          </div>
        </details>
      ) : (
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
                  checked={draftRulesSettings.moduleCustomization[key]}
                  onChange={(event) => updateModuleCustomization(key, event.target.checked)}
                />
                <span className="field-label-row">
                  <span>{rulesCustomizationLabels[key]}</span>
                  <AssistiveHint text={rulesCustomizationDescriptions[key]} triggerLabel={`Explain ${rulesCustomizationLabels[key]}`} />
                </span>
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

            {draftRulesSettings.moduleCustomization.showPresetDiff ? (
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
              <button className="button" type="button" onClick={handleApplyPreset} disabled={!selectedPreset || !draftRulesProfile}>
                Apply Preset to Branch Defaults
              </button>
            </div>
          </article>
        </section>
      )}

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Rules Context</h3>
            <span className="pill">{draftRulesContext ? 'editable' : 'not created yet'}</span>
          </div>

          {!draftRulesContext ? (
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
              {draftRulesSettings.moduleCustomization.highlightRuleOverrides ? (
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
                  checked={draftRulesContext.gauntlet}
                  onChange={(event) =>
                    updateRulesContext({
                      ...draftRulesContext,
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
                      value={draftRulesContext[key]}
                      onChange={(event) =>
                        updateRulesContext({
                          ...draftRulesContext,
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
                  value={draftRulesContext.notes}
                  onChange={(event) =>
                    updateRulesContext({
                      ...draftRulesContext,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              {draftRulesSettings.moduleCustomization.showAdvancedMetadata ? (
                <AdvancedJsonDetails
                  summary="Advanced JSON"
                  badge="import metadata"
                  hint="The raw imported rules payload stays tucked away unless you need to inspect or repair it."
                >
                  <JsonEditorField
                    label="Import source metadata"
                    value={draftRulesContext.importSourceMetadata}
                    onValidChange={(value) =>
                      updateRulesContext({
                        ...draftRulesContext,
                        importSourceMetadata:
                          typeof value === 'object' && value !== null && !Array.isArray(value)
                            ? (value as Record<string, unknown>)
                            : {},
                      })
                    }
                  />
                </AdvancedJsonDetails>
              ) : (
                <p>Advanced metadata editing is hidden by the current module customization.</p>
              )}
            </>
          )}
        </article>

        {simpleMode ? (
          <details className="details-panel">
            <summary className="details-panel__summary">
              <span>Fallback summary</span>
              <span className="pill">{currentRulesSourceLabel}</span>
            </summary>
            <div className="details-panel__body">
              <article className="card stack">
                <p>
                  These are the branch-visible defaults the current jump will inherit until you create or edit a dedicated
                  jump context.
                </p>
                <div className="inline-meta">
                  <span className="metric">
                    <strong>{draftRulesSettings.defaults.gauntlet ? 'enabled' : 'disabled'}</strong>
                    Gauntlet
                  </span>
                  {rulesAccessKeys.map((key) => (
                    <span className="metric" key={key}>
                      <strong>{draftRulesSettings.defaults[key]}</strong>
                      {rulesDefaultLabels[key]}
                    </span>
                  ))}
                </div>
                {draftRulesSettings.manualOverridePaths.length > 0 ? (
                  <p>{draftRulesSettings.manualOverridePaths.length} fields have been manually adjusted after preset application.</p>
                ) : (
                  <p>No manual branch overrides are recorded yet.</p>
                )}
              </article>
            </div>
          </details>
        ) : (
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
                <strong>{draftRulesSettings.defaults.gauntlet ? 'enabled' : 'disabled'}</strong>
                Gauntlet
              </span>
              {rulesAccessKeys.map((key) => (
                <span className="metric" key={key}>
                  <strong>{draftRulesSettings.defaults[key]}</strong>
                  {rulesDefaultLabels[key]}
                </span>
              ))}
            </div>
            {draftRulesSettings.manualOverridePaths.length > 0 ? (
              <p>{draftRulesSettings.manualOverridePaths.length} fields have been manually adjusted after preset application.</p>
            ) : (
              <p>No manual branch overrides are recorded yet.</p>
            )}
          </article>
        )}
      </section>
    </div>
  );
}
