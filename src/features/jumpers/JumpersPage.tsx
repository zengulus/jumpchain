import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { db } from '../../db/database';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { createBlankJumper, saveChainRecord } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  PlainLanguageHint,
  SimpleModeGuideFrame,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  createBranchGuideScopeKey,
  createSimpleModePageGuideState,
  getFirstIncompleteGuideStep,
  isJumperGuideStepComplete,
  markGuideStepAcknowledged,
  readGuideRequested,
  setGuideCurrentStep,
  setGuideDismissed,
  updateGuideSearchParams,
  type JumperGuideStepId,
} from '../workspace/simpleModeGuides';

export function JumpersPage() {
  const { simpleMode, getBranchGuideState, updateBranchGuideState, updateOverviewGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const filteredJumpers = workspace.jumpers.filter((jumper) =>
    matchesSearchQuery(
      searchQuery,
      jumper.name,
      jumper.gender,
      jumper.notes,
      jumper.personality,
      jumper.background,
      jumper.importSourceMetadata,
    ),
  );
  const selectedJumperId = searchParams.get('jumper') ?? filteredJumpers[0]?.id ?? null;
  const selectedJumper = filteredJumpers.find((jumper) => jumper.id === selectedJumperId) ?? filteredJumpers[0] ?? null;
  const jumperAutosave = useAutosaveRecord(selectedJumper, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumpers, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save jumper changes.'),
  });
  const draftJumper = jumperAutosave.draft ?? selectedJumper;
  const branchGuideScopeKey = workspace.activeBranch ? createBranchGuideScopeKey(chainId, workspace.activeBranch.id) : null;
  const guideRequested = simpleMode && readGuideRequested(searchParams);
  const jumperGuideSteps = [
    {
      id: 'identity',
      label: 'Identity',
      description: 'Set the jumper name and a short concept note first. That is enough to anchor the rest of the chain.',
    },
    {
      id: 'details',
      label: 'Details',
      description: 'Review the extra identity details when they matter. This step stays lightweight in simple mode.',
    },
  ] as const;
  const selectedJumperGuideState =
    branchGuideScopeKey && selectedJumper
      ? getBranchGuideState(branchGuideScopeKey, 'jumpers', selectedJumper.id)
      : createSimpleModePageGuideState('identity');
  const currentGuideStepId = draftJumper
    ? (getFirstIncompleteGuideStep(
        jumperGuideSteps.map((step) => step.id),
        selectedJumperGuideState,
        (stepId) => isJumperGuideStepComplete(draftJumper, selectedJumperGuideState, stepId as JumperGuideStepId),
      ) as JumperGuideStepId | null)
    : null;

  function updateSelectedJumperGuideState(
    updater: (current: ReturnType<typeof getBranchGuideState>) => ReturnType<typeof getBranchGuideState>,
  ) {
    if (!branchGuideScopeKey || !selectedJumper) {
      return;
    }

    updateBranchGuideState(branchGuideScopeKey, 'jumpers', selectedJumper.id, updater);
  }

  function setGuideRequested(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  function handleGuideStepChange(stepId: JumperGuideStepId) {
    updateSelectedJumperGuideState((current) => setGuideCurrentStep(current, stepId));
  }

  function handleGuideDismiss() {
    updateSelectedJumperGuideState((current) => setGuideDismissed(current, true));
    setGuideRequested(false);
  }

  function handleReopenGuide() {
    if (!currentGuideStepId) {
      return;
    }

    updateSelectedJumperGuideState((current) => setGuideCurrentStep(setGuideDismissed(current, false), currentGuideStepId));
    setGuideRequested(true);
  }

  function markOverviewStepComplete(stepId: 'jumper' | 'jump' | 'participation', nextStepId: 'jump' | 'participation' | null) {
    if (!branchGuideScopeKey) {
      return;
    }

    updateOverviewGuideState(branchGuideScopeKey, (current) =>
      setGuideCurrentStep(markGuideStepAcknowledged(setGuideDismissed(current, false), stepId), nextStepId),
    );
  }

  function handleIdentityGuideContinue() {
    updateSelectedJumperGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'identity'), 'details'));
  }

  function handleJumperGuideFinish() {
    updateSelectedJumperGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'details'), 'details'));
    markOverviewStepComplete('jumper', 'jump');
    setGuideRequested(false);
  }

  async function handleAddJumper() {
    if (!workspace.activeBranch) {
      return;
    }

    const jumper = createBlankJumper(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.jumpers, jumper);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('jumper', jumper.id);
        if (simpleMode) {
          nextParams.set('guide', '1');
        }
        return nextParams;
      });
      if (simpleMode && branchGuideScopeKey) {
        updateBranchGuideState(branchGuideScopeKey, 'jumpers', jumper.id, () => createSimpleModePageGuideState('identity'));
      }
      setNotice({
        tone: 'success',
        message: 'Created a new jumper record in IndexedDB.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jumper.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before editing jumpers." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Jumpers"
        description={
          simpleMode
            ? 'Pick a jumper, fill in the basics, and open Optional only when you want the deeper profile.'
            : 'Keep identity front and center, with profile details and source metadata grouped just behind it.'
        }
        badge={`${workspace.jumpers.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleAddJumper()}>
            Add Jumper
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={jumperAutosave.status} />

      {workspace.jumpers.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumpers yet"
          body="Create the first jumper for this branch. Iconic, participation, and note modules will then have someone to target."
          action={
            <button className="button" type="button" onClick={() => void handleAddJumper()}>
              Create First Jumper
            </button>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Roster</h3>
              <span className="pill">{workspace.activeBranch.title}</span>
            </div>
            {simpleMode ? (
              <>
                <p>Choose who you want to work on, then start with name, age, and notes.</p>
                <PlainLanguageHint term="Jumper" meaning="the character record this chain follows." />
              </>
            ) : null}
            <label className="field">
              <span>Search roster</span>
              <input
                value={searchQuery}
                placeholder="name, notes, personality, background..."
                onChange={(event) =>
                  setSearchParams((currentParams) => {
                    const nextParams = new URLSearchParams(currentParams);

                    if (event.target.value.trim()) {
                      nextParams.set('search', event.target.value);
                    } else {
                      nextParams.delete('search');
                    }

                    return nextParams;
                  })
                }
              />
            </label>
            <div className="selection-list">
              {filteredJumpers.map((jumper) => (
                <button
                  key={jumper.id}
                  className={`selection-list__item${selectedJumper?.id === jumper.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() =>
                    setSearchParams((currentParams) => {
                      const nextParams = new URLSearchParams(currentParams);
                      nextParams.set('jumper', jumper.id);
                      return nextParams;
                    })
                  }
                >
                  <strong>
                    <SearchHighlight text={jumper.name} query={searchQuery} />
                  </strong>
                  <span>
                    <SearchHighlight
                        text={
                          simpleMode
                            ? jumper.isPrimary
                              ? 'Primary jumper'
                              : jumper.gender.trim() || 'Jumper record'
                          : jumper.isPrimary
                            ? 'Primary jumper'
                            : jumper.gender.trim() || 'Jumper record'
                        }
                      query={searchQuery}
                    />
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {draftJumper ? (
              <>
                <div className="section-heading">
                  <h3>
                    <SearchHighlight text={draftJumper.name} query={searchQuery} />
                  </h3>
                  <div className="actions">
                    {simpleMode ? (
                      <button className="button button--secondary" type="button" onClick={handleReopenGuide}>
                        {guideRequested ? 'Guide Open' : 'Reopen Setup'}
                      </button>
                    ) : null}
                    <Link className="button button--secondary" to={withSearchParams(`/chains/${chainId}/bodymod`, { jumper: draftJumper.id, search: searchQuery })}>
                      {simpleMode ? 'Open Iconic (optional)' : 'Open Iconic'}
                    </Link>
                  </div>
                </div>
                {simpleMode ? <p>Start with identity and notes. Optional holds personality, background, and import cleanup.</p> : null}

                {simpleMode && guideRequested && currentGuideStepId ? (
                  <SimpleModeGuideFrame
                    title={`${draftJumper.name} setup`}
                    steps={[...jumperGuideSteps]}
                    currentStepId={currentGuideStepId}
                    acknowledgedStepIds={selectedJumperGuideState.acknowledgedStepIds}
                    onStepChange={(stepId) => handleGuideStepChange(stepId as JumperGuideStepId)}
                    onDismiss={handleGuideDismiss}
                  >
                    <div className="actions">
                      {currentGuideStepId === 'details' ? (
                        <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('identity')}>
                          Back to Identity
                        </button>
                      ) : null}
                      {currentGuideStepId === 'identity' ? (
                        <button className="button" type="button" onClick={handleIdentityGuideContinue}>
                          Continue to Details
                        </button>
                      ) : (
                        <button className="button" type="button" onClick={handleJumperGuideFinish}>
                          Finish Setup
                        </button>
                      )}
                    </div>
                  </SimpleModeGuideFrame>
                ) : null}

                <section className="stack stack--compact">
                  <h4>Identity</h4>
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={draftJumper.name}
                      onChange={(event) =>
                        jumperAutosave.updateDraft({
                          ...draftJumper,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={5}
                      value={draftJumper.notes}
                      onChange={(event) =>
                        jumperAutosave.updateDraft({
                          ...draftJumper,
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>

                  {simpleMode ? (
                    <details className="details-panel" open={guideRequested && currentGuideStepId === 'details' ? true : undefined}>
                      <summary className="details-panel__summary">
                        <span>Identity details</span>
                        <span className="pill">Optional</span>
                      </summary>
                      <div className="details-panel__body">
                        <div className="field-grid field-grid--two">
                          <label className="field">
                            <span>Gender</span>
                            <input
                              value={draftJumper.gender}
                              onChange={(event) =>
                                jumperAutosave.updateDraft({
                                  ...draftJumper,
                                  gender: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Original age</span>
                            <input
                              type="number"
                              value={draftJumper.originalAge ?? ''}
                              onChange={(event) =>
                                jumperAutosave.updateDraft({
                                  ...draftJumper,
                                  originalAge: event.target.value === '' ? null : Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="field field--checkbox">
                            <input
                              type="checkbox"
                              checked={draftJumper.isPrimary}
                              onChange={(event) =>
                                jumperAutosave.updateDraft({
                                  ...draftJumper,
                                  isPrimary: event.target.checked,
                                })
                              }
                            />
                            <span>Primary jumper</span>
                          </label>
                        </div>
                      </div>
                    </details>
                  ) : (
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Gender</span>
                        <input
                          value={draftJumper.gender}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              gender: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Original age</span>
                        <input
                          type="number"
                          value={draftJumper.originalAge ?? ''}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              originalAge: event.target.value === '' ? null : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="field field--checkbox">
                        <input
                          type="checkbox"
                          checked={draftJumper.isPrimary}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              isPrimary: event.target.checked,
                            })
                          }
                        />
                        <span>Primary jumper</span>
                      </label>
                    </div>
                  )}
                </section>

                {simpleMode ? (
                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Background and advanced details</span>
                      <span className="pill">Optional</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Personality</span>
                          <textarea
                            rows={4}
                            value={draftJumper.personality.personality}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                personality: {
                                  ...draftJumper.personality,
                                  personality: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Motivation</span>
                          <textarea
                            rows={4}
                            value={draftJumper.personality.motivation}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                personality: {
                                  ...draftJumper.personality,
                                  motivation: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Likes</span>
                          <textarea
                            rows={3}
                            value={draftJumper.personality.likes}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                personality: {
                                  ...draftJumper.personality,
                                  likes: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Dislikes</span>
                          <textarea
                            rows={3}
                            value={draftJumper.personality.dislikes}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                personality: {
                                  ...draftJumper.personality,
                                  dislikes: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Quirks</span>
                          <textarea
                            rows={3}
                            value={draftJumper.personality.quirks}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                personality: {
                                  ...draftJumper.personality,
                                  quirks: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Background summary</span>
                          <textarea
                            rows={3}
                            value={draftJumper.background.summary}
                            onChange={(event) =>
                              jumperAutosave.updateDraft({
                                ...draftJumper,
                                background: {
                                  ...draftJumper.background,
                                  summary: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </div>

                      <label className="field">
                        <span>Background description</span>
                        <textarea
                          rows={6}
                          value={draftJumper.background.description}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              background: {
                                ...draftJumper.background,
                                description: event.target.value,
                              },
                            })
                          }
                        />
                      </label>

                      <AdvancedJsonDetails
                        summary="Advanced JSON"
                        badge="import metadata"
                        hint="Raw preserved import fields are available here if you need them for cleanup."
                      >
                        <JsonEditorField
                          label="Import source metadata"
                          value={draftJumper.importSourceMetadata}
                          onValidChange={(value) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              importSourceMetadata:
                                typeof value === 'object' && value !== null && !Array.isArray(value)
                                  ? (value as Record<string, unknown>)
                                  : {},
                            })
                          }
                        />
                      </AdvancedJsonDetails>
                    </div>
                  </details>
                ) : (
                  <section className="stack stack--compact">
                    <h4>Profile and metadata</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Personality</span>
                        <textarea
                          rows={4}
                          value={draftJumper.personality.personality}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              personality: {
                                ...draftJumper.personality,
                                personality: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Motivation</span>
                        <textarea
                          rows={4}
                          value={draftJumper.personality.motivation}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              personality: {
                                ...draftJumper.personality,
                                motivation: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Likes</span>
                        <textarea
                          rows={3}
                          value={draftJumper.personality.likes}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              personality: {
                                ...draftJumper.personality,
                                likes: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Dislikes</span>
                        <textarea
                          rows={3}
                          value={draftJumper.personality.dislikes}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              personality: {
                                ...draftJumper.personality,
                                dislikes: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Quirks</span>
                        <textarea
                          rows={3}
                          value={draftJumper.personality.quirks}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              personality: {
                                ...draftJumper.personality,
                                quirks: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Background summary</span>
                        <textarea
                          rows={3}
                          value={draftJumper.background.summary}
                          onChange={(event) =>
                            jumperAutosave.updateDraft({
                              ...draftJumper,
                              background: {
                                ...draftJumper.background,
                                summary: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Background description</span>
                      <textarea
                        rows={6}
                        value={draftJumper.background.description}
                        onChange={(event) =>
                          jumperAutosave.updateDraft({
                            ...draftJumper,
                            background: {
                              ...draftJumper.background,
                              description: event.target.value,
                            },
                          })
                        }
                      />
                    </label>

                    <AdvancedJsonDetails
                      summary="Advanced JSON"
                      badge="import metadata"
                      hint="Raw preserved import fields are available here if you need them for cleanup."
                    >
                      <JsonEditorField
                        label="Import source metadata"
                        value={draftJumper.importSourceMetadata}
                        onValidChange={(value) =>
                          jumperAutosave.updateDraft({
                            ...draftJumper,
                            importSourceMetadata:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          })
                        }
                      />
                    </AdvancedJsonDetails>
                  </section>
                )}
              </>
            ) : (
              <p>No jumpers match the current search.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
