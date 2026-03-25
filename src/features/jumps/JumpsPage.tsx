import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { jumpStatuses, jumpTypes } from '../../domain/common';
import { db } from '../../db/database';
import { switchActiveJump } from '../../db/persistence';
import { createBlankJump, saveChainRecord, syncJumpParticipantMembership } from '../workspace/records';
import {
  AdvancedJsonDetails,
  EmptyWorkspaceCard,
  JsonEditorField,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function JumpsPage() {
  const navigate = useNavigate();
  const { jumpId } = useParams();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJump = workspace.jumps.find((jump) => jump.id === jumpId) ?? workspace.jumps[0] ?? null;

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

      navigate(`/chains/${chainId}/jumps/${jump.id}`);
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

  async function saveSelectedJump(nextValue: typeof selectedJump) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.jumps, nextValue);
      setNotice({
        tone: 'success',
        message: 'Jump changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save jump changes.',
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
        description="Ordered jump records with thin editors for status, type, duration, and participant membership."
        badge={`${workspace.jumps.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleAddJump()}>
            Add Jump
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />

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
            <div className="selection-list">
              {workspace.jumps.map((jump) => (
                <Link
                  key={jump.id}
                  className={`selection-list__item${selectedJump?.id === jump.id ? ' is-active' : ''}`}
                  to={`/chains/${chainId}/jumps/${jump.id}`}
                >
                  <strong>
                    {jump.orderIndex + 1}. {jump.title}
                  </strong>
                  <span>
                    {jump.status} | {jump.jumpType}
                  </span>
                </Link>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {selectedJump ? (
              <>
                <div className="section-heading">
                  <h3>{selectedJump.title}</h3>
                  <div className="actions">
                    <button className="button button--secondary" type="button" onClick={() => void handleMakeCurrentJump()}>
                      Make Current Jump
                    </button>
                    <Link className="button button--secondary" to={`/chains/${chainId}/participation/${selectedJump.id}`}>
                      Open Participation
                    </Link>
                  </div>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={selectedJump.title}
                      onChange={(event) =>
                        void saveSelectedJump({
                          ...selectedJump,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Order index</span>
                    <input
                      type="number"
                      value={selectedJump.orderIndex}
                      onChange={(event) =>
                        void saveSelectedJump({
                          ...selectedJump,
                          orderIndex: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={selectedJump.status}
                      onChange={(event) =>
                        void saveSelectedJump({
                          ...selectedJump,
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
                      value={selectedJump.jumpType}
                      onChange={(event) =>
                        void saveSelectedJump({
                          ...selectedJump,
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

                <section className="stack stack--compact">
                  <h4>Duration</h4>
                  <div className="field-grid field-grid--three">
                    <label className="field">
                      <span>Years</span>
                      <input
                        type="number"
                        value={selectedJump.duration.years}
                        onChange={(event) =>
                          void saveSelectedJump({
                            ...selectedJump,
                            duration: {
                              ...selectedJump.duration,
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
                        value={selectedJump.duration.months}
                        onChange={(event) =>
                          void saveSelectedJump({
                            ...selectedJump,
                            duration: {
                              ...selectedJump.duration,
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
                        value={selectedJump.duration.days}
                        onChange={(event) =>
                          void saveSelectedJump({
                            ...selectedJump,
                            duration: {
                              ...selectedJump.duration,
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
                        const checked = selectedJump.participantJumperIds.includes(jumper.id);

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

                <AdvancedJsonDetails
                  summary="Advanced JSON"
                  badge="import metadata"
                  hint="Preserved jump import data stays tucked away here unless you need raw cleanup."
                >
                  <JsonEditorField
                    label="Import source metadata"
                    value={selectedJump.importSourceMetadata}
                    onValidChange={(value) =>
                      saveSelectedJump({
                        ...selectedJump,
                        importSourceMetadata:
                          typeof value === 'object' && value !== null && !Array.isArray(value)
                            ? (value as Record<string, unknown>)
                            : {},
                      })
                    }
                  />
                </AdvancedJsonDetails>
              </>
            ) : null}
          </article>
        </section>
      )}
    </div>
  );
}
