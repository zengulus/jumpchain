import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/database';
import { createBlankJumper, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function JumpersPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJumperId = searchParams.get('jumper') ?? workspace.jumpers[0]?.id ?? null;
  const selectedJumper = workspace.jumpers.find((jumper) => jumper.id === selectedJumperId) ?? workspace.jumpers[0] ?? null;

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

  async function saveSelectedJumper(nextValue: typeof selectedJumper) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.jumpers, nextValue);
      setNotice({
        tone: 'success',
        message: 'Jumper changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save jumper changes.',
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

      {workspace.jumpers.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumpers yet"
          body="Create the first jumper for this branch. Bodymod, participation, and note modules will then have someone to target."
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
            {selectedJumper ? (
              <>
                <div className="section-heading">
                  <h3>{selectedJumper.name}</h3>
                  <Link className="button button--secondary" to={`/chains/${chainId}/bodymod?jumper=${selectedJumper.id}`}>
                    Open Bodymod
                  </Link>
                </div>

                <section className="stack stack--compact">
                  <h4>Simple</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={selectedJumper.name}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Gender</span>
                      <input
                        value={selectedJumper.gender}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            gender: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Original age</span>
                      <input
                        type="number"
                        value={selectedJumper.originalAge ?? ''}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            originalAge: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="field field--checkbox">
                      <input
                        type="checkbox"
                        checked={selectedJumper.isPrimary}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
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
                      value={selectedJumper.notes}
                      onChange={(event) =>
                        void saveSelectedJumper({
                          ...selectedJumper,
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
                        value={selectedJumper.personality.personality}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            personality: {
                              ...selectedJumper.personality,
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
                        value={selectedJumper.personality.motivation}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            personality: {
                              ...selectedJumper.personality,
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
                        value={selectedJumper.personality.likes}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            personality: {
                              ...selectedJumper.personality,
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
                        value={selectedJumper.personality.dislikes}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            personality: {
                              ...selectedJumper.personality,
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
                        value={selectedJumper.personality.quirks}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            personality: {
                              ...selectedJumper.personality,
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
                        value={selectedJumper.background.summary}
                        onChange={(event) =>
                          void saveSelectedJumper({
                            ...selectedJumper,
                            background: {
                              ...selectedJumper.background,
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
                      value={selectedJumper.background.description}
                      onChange={(event) =>
                        void saveSelectedJumper({
                          ...selectedJumper,
                          background: {
                            ...selectedJumper.background,
                            description: event.target.value,
                          },
                        })
                      }
                    />
                  </label>

                  <JsonEditorField
                    label="Import source metadata"
                    value={selectedJumper.importSourceMetadata}
                    onValidChange={(value) =>
                      saveSelectedJumper({
                        ...selectedJumper,
                        importSourceMetadata:
                          typeof value === 'object' && value !== null && !Array.isArray(value)
                            ? (value as Record<string, unknown>)
                            : {},
                      })
                    }
                  />
                </section>
              </>
            ) : null}
          </article>
        </section>
      )}
    </div>
  );
}
