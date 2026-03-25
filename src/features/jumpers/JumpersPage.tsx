import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { createBlankJumper, saveChainRecord } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function JumpersPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJumperId = searchParams.get('jumper') ?? workspace.jumpers[0]?.id ?? null;
  const selectedJumper = workspace.jumpers.find((jumper) => jumper.id === selectedJumperId) ?? workspace.jumpers[0] ?? null;
  const jumperAutosave = useAutosaveRecord(selectedJumper, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumpers, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save jumper changes.'),
  });
  const draftJumper = jumperAutosave.draft ?? selectedJumper;

  async function handleAddJumper() {
    if (!workspace.activeBranch) {
      return;
    }

    const jumper = createBlankJumper(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.jumpers, jumper);
      setSearchParams({ jumper: jumper.id });
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
        description="Simple identity editing up front, source metadata and deep structure in advanced sections."
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
            <div className="selection-list">
              {workspace.jumpers.map((jumper) => (
                <button
                  key={jumper.id}
                  className={`selection-list__item${selectedJumper?.id === jumper.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSearchParams({ jumper: jumper.id })}
                >
                  <strong>{jumper.name}</strong>
                  <span>{jumper.isPrimary ? 'Primary jumper' : 'Secondary jumper'}</span>
                </button>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {draftJumper ? (
              <>
                <div className="section-heading">
                  <h3>{draftJumper.name}</h3>
                  <Link className="button button--secondary" to={`/chains/${chainId}/bodymod?jumper=${draftJumper.id}`}>
                    Open Iconic
                  </Link>
                </div>

                <section className="stack stack--compact">
                  <h4>Simple</h4>
                  <div className="field-grid field-grid--two">
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
                </section>

                <section className="stack stack--compact">
                  <h4>Advanced</h4>
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
              </>
            ) : null}
          </article>
        </section>
      )}
    </div>
  );
}
