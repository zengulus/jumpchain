import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { iconicBodymodModes, type BodymodMode, type IconicBodymodMode } from '../../domain/common';
import { iconicSelectionKinds, type BodymodProfile, type IconicSelection } from '../../domain/bodymod/types';
import { db } from '../../db/database';
import { createBlankBodymodProfile, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

interface IconicSlotTemplate {
  label: string;
  defaultKind: IconicSelection['kind'];
  hint: string;
}

interface IconicTierConfig {
  title: string;
  description: string;
  startingLevel: string;
  progression: string;
  slots: IconicSlotTemplate[];
}

const ICONIC_TIER_CONFIGS: Record<IconicBodymodMode, IconicTierConfig> = {
  'central-gimmick': {
    title: 'Central Gimmick',
    description: 'One defining impossible thing stays substantially itself across the chain.',
    startingLevel: 'Starts at full intended power and usually stays there, even under heavy restriction.',
    progression: 'Stability tier. The point is preserving the conceit, not staged growth.',
    slots: [
      {
        label: 'Defining purchase',
        defaultKind: 'power',
        hint: 'The one purchase that the character stops feeling like themselves without.',
      },
    ],
  },
  suite: {
    title: 'The Suite',
    description: 'A compact signature package: three core abilities and one key item.',
    startingLevel: 'Starts at the setting Core benchmark and stays recognisable in gauntlets.',
    progression: 'Can naturally grow up to Peak through training, upgrades, practice, and the chain itself.',
    slots: [
      {
        label: 'Core ability 1',
        defaultKind: 'perk',
        hint: 'A foundational perk or power that should always stay online.',
      },
      {
        label: 'Core ability 2',
        defaultKind: 'power',
        hint: 'Another part of the recognisable package.',
      },
      {
        label: 'Core ability 3',
        defaultKind: 'perk',
        hint: 'The last signature ability slot for this tier.',
      },
      {
        label: 'Signature item',
        defaultKind: 'item',
        hint: 'The external piece of gear or artefact that belongs in the package.',
      },
    ],
  },
  baseline: {
    title: 'The Baseline',
    description: 'A broader foundation of perks and items that starts modestly and grows with the chain.',
    startingLevel: 'Starts at the setting Floor benchmark and stays available even when stripped down.',
    progression: 'Grows through actual in-chain development, usually up to Peak.',
    slots: [
      {
        label: 'Foundation perk 1',
        defaultKind: 'perk',
        hint: 'A core trait that should always be part of the character.',
      },
      {
        label: 'Foundation perk 2',
        defaultKind: 'perk',
        hint: 'Another stable piece of the character foundation.',
      },
      {
        label: 'Foundation perk 3',
        defaultKind: 'perk',
        hint: 'A third baseline capability or trait.',
      },
      {
        label: 'Foundation perk 4',
        defaultKind: 'perk',
        hint: 'Use this for a broad stabilising trait rather than a singular gimmick.',
      },
      {
        label: 'Foundation perk 5',
        defaultKind: 'perk',
        hint: 'The last perk slot in the broader baseline.',
      },
      {
        label: 'Key item 1',
        defaultKind: 'item',
        hint: 'An important tool, possession, or artefact that supports the concept.',
      },
      {
        label: 'Key item 2',
        defaultKind: 'item',
        hint: 'Another item that belongs in the character foundation.',
      },
      {
        label: 'Key item 3',
        defaultKind: 'item',
        hint: 'The last item slot for the stable foundation tier.',
      },
    ],
  },
};

function isIconicTier(mode: BodymodMode): mode is IconicBodymodMode {
  return iconicBodymodModes.includes(mode as IconicBodymodMode);
}

function normalizeIconicTier(mode: BodymodMode): IconicBodymodMode {
  if (isIconicTier(mode)) {
    return mode;
  }

  if (mode === 'supplemented') {
    return 'suite';
  }

  return 'baseline';
}

function createBlankIconicSelection(defaultKind: IconicSelection['kind']): IconicSelection {
  return {
    kind: defaultKind,
    title: '',
    source: '',
    summary: '',
  };
}

function getSelectionsForTier(tier: IconicBodymodMode, selections: IconicSelection[]) {
  return ICONIC_TIER_CONFIGS[tier].slots.map((slot, index) => {
    const selection = selections[index];

    return {
      kind: selection?.kind ?? slot.defaultKind,
      title: selection?.title ?? '',
      source: selection?.source ?? '',
      summary: selection?.summary ?? '',
    } satisfies IconicSelection;
  });
}

function countFilledSelections(selections: IconicSelection[]) {
  return selections.filter(
    (selection) =>
      selection.title.trim().length > 0 ||
      selection.source.trim().length > 0 ||
      selection.summary.trim().length > 0,
  ).length;
}

function getProfileStatusLabel(profile: BodymodProfile | null) {
  if (!profile) {
    return 'no iconic profile yet';
  }

  return ICONIC_TIER_CONFIGS[normalizeIconicTier(profile.mode)].title;
}

export function BodymodPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJumperId = searchParams.get('jumper') ?? workspace.jumpers[0]?.id ?? null;
  const selectedJumper = workspace.jumpers.find((jumper) => jumper.id === selectedJumperId) ?? workspace.jumpers[0] ?? null;
  const profile = selectedJumper
    ? workspace.bodymodProfiles.find((entry) => entry.jumperId === selectedJumper.id) ?? null
    : null;
  const activeTier = profile ? normalizeIconicTier(profile.mode) : 'baseline';
  const tierConfig = ICONIC_TIER_CONFIGS[activeTier];
  const tierSelections = profile ? getSelectionsForTier(activeTier, profile.iconicSelections) : [];
  const hasLegacyMode = profile ? !isIconicTier(profile.mode) : false;

  async function handleCreateProfile() {
    if (!workspace.activeBranch || !selectedJumper) {
      return;
    }

    try {
      await saveChainRecord(
        db.bodymodProfiles,
        createBlankBodymodProfile(chainId, workspace.activeBranch.id, selectedJumper.id),
      );
      setNotice({
        tone: 'success',
        message: 'Created an Iconic profile for this jumper.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create Iconic profile.',
      });
    }
  }

  async function saveProfile(nextValue: BodymodProfile | null) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.bodymodProfiles, nextValue);
      setNotice({
        tone: 'success',
        message: 'Iconic changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save Iconic changes.',
      });
    }
  }

  function updateTier(nextTier: IconicBodymodMode) {
    if (!profile) {
      return;
    }

    void saveProfile({
      ...profile,
      mode: nextTier,
      iconicSelections: getSelectionsForTier(nextTier, profile.iconicSelections),
    });
  }

  function updateSelection(index: number, updater: (selection: IconicSelection) => IconicSelection) {
    if (!profile) {
      return;
    }

    const nextSelections = getSelectionsForTier(activeTier, profile.iconicSelections).map((selection, selectionIndex) =>
      selectionIndex === index ? updater(selection) : selection,
    );

    void saveProfile({
      ...profile,
      mode: activeTier,
      iconicSelections: nextSelections,
    });
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing Iconic data." />;
  }

  if (workspace.jumpers.length === 0) {
    return <EmptyWorkspaceCard title="No jumpers available" body="Create a jumper first, then define an Iconic profile." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Iconic"
        description="Structured Iconic bodymod replacer profiles with tier-based packages, concept notes, and preserved imported forms."
        badge={`${workspace.bodymodProfiles.length} profiles`}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="workspace-two-column">
        <aside className="card stack">
          <div className="section-heading">
            <h3>Jumpers</h3>
            <span className="pill">{workspace.activeBranch.title}</span>
          </div>
          <div className="selection-list">
            {workspace.jumpers.map((jumper) => {
              const jumperProfile = workspace.bodymodProfiles.find((entry) => entry.jumperId === jumper.id) ?? null;

              return (
                <button
                  key={jumper.id}
                  className={`selection-list__item${selectedJumper?.id === jumper.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSearchParams({ jumper: jumper.id })}
                >
                  <strong>{jumper.name}</strong>
                  <span>{getProfileStatusLabel(jumperProfile)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="card stack">
          {selectedJumper ? (
            <>
              <div className="section-heading">
                <h3>{selectedJumper.name}</h3>
                {!profile ? (
                  <button className="button" type="button" onClick={() => void handleCreateProfile()}>
                    Create Iconic Profile
                  </button>
                ) : (
                  <span className="pill">{tierConfig.title}</span>
                )}
              </div>

              {!profile ? (
                <p>No Iconic profile exists for this jumper yet.</p>
              ) : (
                <>
                  <div className="guidance-strip guidance-strip--accent">
                    <strong>Preserve the concept, not the austerity.</strong>
                    <p>Iconic is here to keep a character recognisable through gauntlets, stripped-resource drawbacks, and setting changes.</p>
                  </div>

                  {hasLegacyMode ? (
                    <div className="status status--warning">
                      Legacy bodymod mode "{profile.mode}" was normalized to {tierConfig.title}. Pick an Iconic tier to make it explicit.
                    </div>
                  ) : null}

                  <section className="stack">
                    <div className="section-heading">
                      <h4>Tier</h4>
                      <span className="pill">{countFilledSelections(tierSelections)} / {tierConfig.slots.length} filled</span>
                    </div>

                    <div className="summary-grid">
                      {iconicBodymodModes.map((tier) => {
                        const config = ICONIC_TIER_CONFIGS[tier];

                        return (
                          <button
                            key={tier}
                            className={`selection-list__item${activeTier === tier ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => updateTier(tier)}
                          >
                            <strong>{config.title}</strong>
                            <span>{config.description}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="summary-panel stack stack--compact">
                      <h4>{tierConfig.title}</h4>
                      <p>{tierConfig.startingLevel}</p>
                      <p>{tierConfig.progression}</p>
                    </div>
                  </section>

                  <section className="stack">
                    <div className="section-heading">
                      <h4>Concept</h4>
                    </div>

                    <label className="field">
                      <span>Concept summary</span>
                      <input
                        value={profile.summary}
                        onChange={(event) =>
                          void saveProfile({
                            ...profile,
                            summary: event.target.value,
                          })
                        }
                      />
                    </label>

                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Benchmark notes</span>
                        <textarea
                          rows={5}
                          value={profile.benchmarkNotes}
                          onChange={(event) =>
                            void saveProfile({
                              ...profile,
                              benchmarkNotes: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Interpretation notes</span>
                        <textarea
                          rows={5}
                          value={profile.interpretationNotes}
                          onChange={(event) =>
                            void saveProfile({
                              ...profile,
                              interpretationNotes: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="stack">
                    <div className="section-heading">
                      <h4>{tierConfig.title} package</h4>
                      <span className="pill">{tierConfig.slots.length} slots</span>
                    </div>

                    <div className="selection-editor-list">
                      {tierConfig.slots.map((slot, index) => {
                        const selection = tierSelections[index] ?? createBlankIconicSelection(slot.defaultKind);

                        return (
                          <div className="selection-editor" key={`${activeTier}-${slot.label}`}>
                            <div className="selection-editor__header">
                              <div className="stack stack--compact">
                                <strong>{slot.label}</strong>
                                <p className="editor-section__copy">{slot.hint}</p>
                              </div>
                              <span className="pill">{selection.kind}</span>
                            </div>

                            <div className="field-grid field-grid--three">
                              <label className="field">
                                <span>Kind</span>
                                <select
                                  value={selection.kind}
                                  onChange={(event) =>
                                    updateSelection(index, (current) => ({
                                      ...current,
                                      kind: event.target.value as IconicSelection['kind'],
                                    }))
                                  }
                                >
                                  {iconicSelectionKinds.map((kind) => (
                                    <option key={kind} value={kind}>
                                      {kind}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="field">
                                <span>Purchase title</span>
                                <input
                                  value={selection.title}
                                  onChange={(event) =>
                                    updateSelection(index, (current) => ({
                                      ...current,
                                      title: event.target.value,
                                    }))
                                  }
                                />
                              </label>

                              <label className="field">
                                <span>Source</span>
                                <input
                                  value={selection.source}
                                  onChange={(event) =>
                                    updateSelection(index, (current) => ({
                                      ...current,
                                      source: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <label className="field">
                              <span>What this preserves</span>
                              <textarea
                                rows={4}
                                value={selection.summary}
                                onChange={(event) =>
                                  updateSelection(index, (current) => ({
                                    ...current,
                                    summary: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {profile.forms.length > 0 ? (
                    <section className="stack">
                      <div className="section-heading">
                        <h4>Preserved forms</h4>
                        <span className="pill">{profile.forms.length}</span>
                      </div>

                      <div className="selection-editor-list">
                        {profile.forms.map((form, index) => (
                          <div className="selection-editor" key={form.sourceAltformId ?? `${form.name}-${index}`}>
                            <div className="selection-editor__header">
                              <div className="stack stack--compact">
                                <strong>{form.name || `Form ${index + 1}`}</strong>
                                <p className="editor-section__copy">
                                  {[form.species, form.sex].filter((entry) => entry.trim().length > 0).join(' - ') || 'Imported altform'}
                                </p>
                              </div>
                              <span className="pill">imported</span>
                            </div>
                            <p className="editor-section__copy">
                              {form.capabilities || form.physicalDescription || 'No imported form notes were preserved for this altform.'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Advanced JSON editors</span>
                      <span className="pill">legacy data and preserved imports</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <p className="field-hint">
                        The structured Iconic editor above is the main surface. Use these JSON blocks for imported altforms, legacy data, and edge-case cleanup.
                      </p>
                      <div className="field-grid field-grid--two">
                        <JsonEditorField
                          label="Iconic selections"
                          value={profile.iconicSelections}
                          onValidChange={(value) =>
                            saveProfile({
                              ...profile,
                              iconicSelections: Array.isArray(value) ? (value as IconicSelection[]) : [],
                            })
                          }
                        />
                        <JsonEditorField
                          label="Forms"
                          value={profile.forms}
                          onValidChange={(value) =>
                            saveProfile({
                              ...profile,
                              forms: Array.isArray(value) ? (value as typeof profile.forms) : [],
                            })
                          }
                        />
                        <JsonEditorField
                          label="Features"
                          value={profile.features}
                          onValidChange={(value) =>
                            saveProfile({
                              ...profile,
                              features: Array.isArray(value) ? (value as typeof profile.features) : [],
                            })
                          }
                        />
                        <JsonEditorField
                          label="Import source metadata"
                          value={profile.importSourceMetadata}
                          onValidChange={(value) =>
                            saveProfile({
                              ...profile,
                              importSourceMetadata:
                                typeof value === 'object' && value !== null && !Array.isArray(value)
                                  ? (value as Record<string, unknown>)
                                  : {},
                            })
                          }
                        />
                      </div>
                    </div>
                  </details>
                </>
              )}
            </>
          ) : null}
        </article>
      </section>
    </div>
  );
}
