import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { jumpStatuses, jumpTypes } from '../../domain/common';
import { db } from '../../db/database';
import { switchActiveJump } from '../../db/persistence';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { createBlankJump, saveChainRecord, syncJumpParticipantMembership } from '../workspace/records';
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

export function JumpsPage() {
  const { simpleMode } = useUiPreferences();
  const navigate = useNavigate();
  const { jumpId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const filteredJumps = workspace.jumps.filter((jump) =>
    matchesSearchQuery(searchQuery, jump.title, jump.status, jump.jumpType, jump.duration, jump.importSourceMetadata),
  );
  const selectedJump = filteredJumps.find((jump) => jump.id === jumpId) ?? filteredJumps[0] ?? null;
  const jumpAutosave = useAutosaveRecord(selectedJump, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumps, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save jump changes.'),
  });
  const draftJump = jumpAutosave.draft ?? selectedJump;

  async function handleAddJump() {
    if (!workspace.activeBranch) {
      return;
    }

    const jump = createBlankJump(chainId, workspace.activeBranch.id, workspace.jumps.length);

    try {
      await saveChainRecord(db.jumps, jump);

      if (!workspace.currentJump) {
        await switchActiveJump(chainId, jump.id);
      }

      navigate(withSearchParams(`/chains/${chainId}/jumps/${jump.id}`, { search: searchQuery }));
      setNotice({
        tone: 'success',
        message: 'Created a new jump record.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jump.',
      });
    }
  }

  async function handleMakeCurrentJump() {
    if (!selectedJump) {
      return;
    }

    try {
      await switchActiveJump(chainId, selectedJump.id);
      setNotice({
        tone: 'success',
        message: 'Current jump updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch the current jump.',
      });
    }
  }

  async function toggleParticipant(jumperId: string) {
    if (!selectedJump) {
      return;
    }

    const alreadyParticipating = selectedJump.participantJumperIds.includes(jumperId);

    try {
      await syncJumpParticipantMembership(chainId, selectedJump, jumperId, !alreadyParticipating);
      setNotice({
        tone: 'success',
        message: alreadyParticipating ? 'Removed jumper from this jump and cleaned up participation data.' : 'Updated jump participants.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to update jump participants.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing jumps." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Jumps"
        description={
          simpleMode
            ? 'Pick a jump, set the basics first, and open Optional when you want duration, ordering, or participant details.'
            : 'Ordered jump records with thin editors for status, type, duration, and participant membership.'
        }
        badge={`${workspace.jumps.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleAddJump()}>
            Add Jump
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={jumpAutosave.status} />

      {workspace.jumps.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumps yet"
          body="Add the first jump for this branch. Once a jump exists, participation, rules, and timeline views will light up."
          action={
            <button className="button" type="button" onClick={() => void handleAddJump()}>
              Create First Jump
            </button>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Ordered jump list</h3>
              <span className="pill">{workspace.activeBranch.title}</span>
            </div>
            {simpleMode ? <p>Choose a jump, then start with title, status, and type. Ordering and participants stay tucked below.</p> : null}
            <label className="field">
              <span>Search jumps</span>
              <input
                value={searchQuery}
                placeholder="title, status, jump type..."
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
              {filteredJumps.map((jump) => (
                <Link
                  key={jump.id}
                  className={`selection-list__item${selectedJump?.id === jump.id ? ' is-active' : ''}`}
                  to={withSearchParams(`/chains/${chainId}/jumps/${jump.id}`, { search: searchQuery })}
                >
                  <strong>
                    {jump.orderIndex + 1}. <SearchHighlight text={jump.title} query={searchQuery} />
                  </strong>
                  <span>
                    <SearchHighlight
                      text={
                        simpleMode
                          ? jump.id === workspace.currentJump?.id
                            ? 'Current jump'
                            : jump.status
                          : `${jump.status} | ${jump.jumpType}`
                      }
                      query={searchQuery}
                    />
                  </span>
                </Link>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {draftJump ? (
              <>
                <div className="section-heading">
                  <h3>
                    <SearchHighlight text={draftJump.title} query={searchQuery} />
                  </h3>
                  <div className="actions">
                    {workspace.currentJump?.id === draftJump.id ? (
                      <span className="pill">Current jump</span>
                    ) : (
                      <button className="button button--secondary" type="button" onClick={() => void handleMakeCurrentJump()}>
                        Make Current Jump
                      </button>
                    )}
                    <Link className="button button--secondary" to={withSearchParams(`/chains/${chainId}/participation/${draftJump.id}`, { search: searchQuery })}>
                      Open Participation
                    </Link>
                  </div>
                </div>
                {simpleMode ? <p>Start with the jump basics here. Optional holds manual ordering, duration, and who is taking part.</p> : null}

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={draftJump.title}
                      onChange={(event) =>
                        jumpAutosave.updateDraft({
                          ...draftJump,
                          title: event.target.value,
                        })
                        }
                      />
                    </label>
                  {simpleMode ? null : (
                    <label className="field">
                      <span>Order index</span>
                      <input
                        type="number"
                        value={draftJump.orderIndex}
                        onChange={(event) =>
                          jumpAutosave.updateDraft({
                            ...draftJump,
                            orderIndex: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={draftJump.status}
                      onChange={(event) =>
                        jumpAutosave.updateDraft({
                          ...draftJump,
                          status: event.target.value as (typeof jumpStatuses)[number],
                        })
                      }
                    >
                      {jumpStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Jump type</span>
                    <select
                      value={draftJump.jumpType}
                      onChange={(event) =>
                        jumpAutosave.updateDraft({
                          ...draftJump,
                          jumpType: event.target.value as (typeof jumpTypes)[number],
                        })
                      }
                    >
                      {jumpTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {simpleMode ? (
                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Ordering, duration, and participants</span>
                      <span className="pill">Optional</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <label className="field">
                        <span>Order index</span>
                        <input
                          type="number"
                          value={draftJump.orderIndex}
                          onChange={(event) =>
                            jumpAutosave.updateDraft({
                              ...draftJump,
                              orderIndex: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="field-grid field-grid--three">
                        <label className="field">
                          <span>Years</span>
                          <input
                            type="number"
                            value={draftJump.duration.years}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  years: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Months</span>
                          <input
                            type="number"
                            value={draftJump.duration.months}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  months: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Days</span>
                          <input
                            type="number"
                            value={draftJump.duration.days}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  days: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="chip-grid">
                        {workspace.jumpers.length === 0 ? (
                          <p>No jumpers exist yet. Add a jumper first.</p>
                        ) : (
                          workspace.jumpers.map((jumper) => {
                            const checked = draftJump.participantJumperIds.includes(jumper.id);

                            return (
                              <label className="choice-chip" key={jumper.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => void toggleParticipant(jumper.id)}
                                />
                                <span>{jumper.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </details>
                ) : (
                  <>
                    <section className="stack stack--compact">
                      <h4>Duration</h4>
                      <div className="field-grid field-grid--three">
                        <label className="field">
                          <span>Years</span>
                          <input
                            type="number"
                            value={draftJump.duration.years}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  years: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Months</span>
                          <input
                            type="number"
                            value={draftJump.duration.months}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  months: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Days</span>
                          <input
                            type="number"
                            value={draftJump.duration.days}
                            onChange={(event) =>
                              jumpAutosave.updateDraft({
                                ...draftJump,
                                duration: {
                                  ...draftJump.duration,
                                  days: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <section className="stack stack--compact">
                      <h4>Participant Summary</h4>
                      <div className="chip-grid">
                        {workspace.jumpers.length === 0 ? (
                          <p>No jumpers exist yet. Add a jumper first.</p>
                        ) : (
                          workspace.jumpers.map((jumper) => {
                            const checked = draftJump.participantJumperIds.includes(jumper.id);

                            return (
                              <label className="choice-chip" key={jumper.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => void toggleParticipant(jumper.id)}
                                />
                                <span>{jumper.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </section>
                  </>
                )}

                <AdvancedJsonDetails
                  summary="Advanced JSON"
                  badge="import metadata"
                  hint="Preserved jump import data stays tucked away here unless you need raw cleanup."
                >
                  <JsonEditorField
                    label="Import source metadata"
                    value={draftJump.importSourceMetadata}
                    onValidChange={(value) =>
                      jumpAutosave.updateDraft({
                        ...draftJump,
                        importSourceMetadata:
                          typeof value === 'object' && value !== null && !Array.isArray(value)
                            ? (value as Record<string, unknown>)
                            : {},
                      })
                    }
                  />
                </AdvancedJsonDetails>
              </>
            ) : (
              <p>No jumps match the current search.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
