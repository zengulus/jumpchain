import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { participationStatuses } from '../../domain/common';
import { db } from '../../db/database';
import { createBlankParticipation, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function ParticipationPage() {
  const { jumpId } = useParams();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const jump = workspace.jumps.find((entry) => entry.id === jumpId) ?? null;

  async function ensureParticipation(jumperId: string) {
    if (!workspace.activeBranch || !jump) {
      return;
    }

    const existing = workspace.participations.find(
      (participation) => participation.jumpId === jump.id && participation.jumperId === jumperId,
    );

    if (existing) {
      return;
    }

    try {
      await saveChainRecord(db.participations, createBlankParticipation(chainId, workspace.activeBranch.id, jump.id, jumperId));

      if (!jump.participantJumperIds.includes(jumperId)) {
        await saveChainRecord(db.jumps, {
          ...jump,
          participantJumperIds: [...jump.participantJumperIds, jumperId],
        });
      }

      setNotice({
        tone: 'success',
        message: 'Created a participation record for this jumper.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create participation.',
      });
    }
  }

  async function saveParticipation(participationId: string, updater: (value: typeof workspace.participations[number]) => typeof workspace.participations[number]) {
    const participation = workspace.participations.find((entry) => entry.id === participationId);

    if (!participation) {
      return;
    }

    try {
      await saveChainRecord(db.participations, updater(participation));
      setNotice({
        tone: 'success',
        message: 'Participation changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save participation changes.',
      });
    }
  }

  if (!jump) {
    return (
      <EmptyWorkspaceCard
        title="Jump not found"
        body="Open a jump from the Jumps module first, then edit per-jumper participation from there."
      />
    );
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Participation"
        description="Per-jumper, per-jump editing for selections, currencies, narratives, and preserved imported blocks."
        badge={jump.title}
      />

      <StatusNoticeBanner notice={notice} />

      {workspace.jumpers.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumpers available"
          body="Add a jumper before editing participation for this jump."
        />
      ) : (
        workspace.jumpers.map((jumper) => {
          const participation = workspace.participations.find(
            (entry) => entry.jumpId === jump.id && entry.jumperId === jumper.id,
          );

          return (
            <article className="card stack" key={jumper.id}>
              <div className="section-heading">
                <h3>{jumper.name}</h3>
                <span className="pill">{participation ? participation.status : 'not participating yet'}</span>
              </div>

              {!participation ? (
                <div className="actions">
                  <button className="button" type="button" onClick={() => void ensureParticipation(jumper.id)}>
                    Add Participation Record
                  </button>
                </div>
              ) : (
                <>
                  <section className="stack stack--compact">
                    <h4>Simple</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Status</span>
                        <select
                          value={participation.status}
                          onChange={(event) =>
                            void saveParticipation(participation.id, (current) => ({
                              ...current,
                              status: event.target.value as (typeof participationStatuses)[number],
                            }))
                          }
                        >
                          {participationStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Bank deposit</span>
                        <input
                          type="number"
                          value={participation.bankDeposit}
                          onChange={(event) =>
                            void saveParticipation(participation.id, (current) => ({
                              ...current,
                              bankDeposit: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Notes</span>
                      <textarea
                        rows={5}
                        value={participation.notes}
                        onChange={(event) =>
                          void saveParticipation(participation.id, (current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <div className="field-grid field-grid--three">
                      <label className="field">
                        <span>Accomplishments</span>
                        <textarea
                          rows={4}
                          value={participation.narratives.accomplishments}
                          onChange={(event) =>
                            void saveParticipation(participation.id, (current) => ({
                              ...current,
                              narratives: {
                                ...current.narratives,
                                accomplishments: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Challenges</span>
                        <textarea
                          rows={4}
                          value={participation.narratives.challenges}
                          onChange={(event) =>
                            void saveParticipation(participation.id, (current) => ({
                              ...current,
                              narratives: {
                                ...current.narratives,
                                challenges: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Goals</span>
                        <textarea
                          rows={4}
                          value={participation.narratives.goals}
                          onChange={(event) =>
                            void saveParticipation(participation.id, (current) => ({
                              ...current,
                              narratives: {
                                ...current.narratives,
                                goals: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="stack stack--compact">
                    <h4>Advanced</h4>
                    <div className="field-grid field-grid--two">
                      <JsonEditorField
                        label="Purchases"
                        value={participation.purchases}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            purchases: Array.isArray(value) ? value : [],
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Drawbacks"
                        value={participation.drawbacks}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            drawbacks: Array.isArray(value) ? value : [],
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Retained drawbacks"
                        value={participation.retainedDrawbacks}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            retainedDrawbacks: Array.isArray(value) ? value : [],
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Origins / backgrounds"
                        value={participation.origins}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            origins:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Budgets"
                        value={participation.budgets}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            budgets:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? Object.fromEntries(
                                    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, Number(entry)]),
                                  )
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Stipends"
                        value={participation.stipends}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            stipends:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, Record<string, number>>)
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Alt forms"
                        value={participation.altForms}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            altForms: Array.isArray(value) ? value : [],
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Currency exchanges"
                        value={participation.currencyExchanges}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            currencyExchanges: Array.isArray(value) ? value : [],
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Supplement purchases"
                        value={participation.supplementPurchases}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            supplementPurchases:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Supplement investments"
                        value={participation.supplementInvestments}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            supplementInvestments:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Drawback overrides"
                        value={participation.drawbackOverrides}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            drawbackOverrides:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          }))
                        }
                      />
                      <JsonEditorField
                        label="Import source metadata"
                        value={participation.importSourceMetadata}
                        onValidChange={(value) =>
                          saveParticipation(participation.id, (current) => ({
                            ...current,
                            importSourceMetadata:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          }))
                        }
                      />
                    </div>
                  </section>
                </>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
