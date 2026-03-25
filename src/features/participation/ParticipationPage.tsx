import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { participationStatuses } from '../../domain/common';
import { db } from '../../db/database';
import { createBlankParticipation, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

interface SummaryToken {
  label: string;
  detail?: string;
  muted?: boolean;
}

interface PurchaseTokenGroups {
  perks: SummaryToken[];
  items: SummaryToken[];
  others: SummaryToken[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatNumericValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getSelectionToken(value: unknown): SummaryToken {
  const record = asRecord(value);
  const label =
    typeof record.name === 'string' && record.name.trim().length > 0
      ? record.name
      : typeof record.summary === 'string' && record.summary.trim().length > 0
        ? record.summary
        : typeof record.sourcePurchaseId === 'number'
          ? `Selection ${record.sourcePurchaseId}`
          : typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : 'Unresolved selection';
  const detailParts: string[] = [];
  const tags = getStringList(record.tags).slice(0, 3);

  if (tags.length > 0) {
    detailParts.push(tags.join(', '));
  }

  if (typeof record.value === 'number') {
    detailParts.push(`${record.value > 0 ? '+' : ''}${formatNumericValue(record.value)} value`);
  }

  if (record.unresolved === true) {
    detailParts.push('Preserved unresolved reference');
  }

  return {
    label,
    detail: detailParts.length > 0 ? detailParts.join(' - ') : undefined,
  };
}

function getPurchaseTokenGroups(purchases: unknown[]): PurchaseTokenGroups {
  return purchases.reduce<PurchaseTokenGroups>(
    (groups, purchase) => {
      const token = getSelectionToken(purchase);
      const record = asRecord(purchase);
      const purchaseType = getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);

      if (purchaseType === 0) {
        groups.perks.push(token);
      } else if (purchaseType === 1) {
        groups.items.push(token);
      } else {
        groups.others.push(token);
      }

      return groups;
    },
    {
      perks: [],
      items: [],
      others: [],
    },
  );
}

function getOriginTokens(origins: Record<string, unknown>): SummaryToken[] {
  return Object.values(origins).map((value, index) => {
    const record = asRecord(value);
    const summary =
      typeof record.summary === 'string' && record.summary.trim().length > 0
        ? record.summary
        : `Origin ${index + 1}`;
    const detail =
      typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description
        : undefined;

    return {
      label: summary,
      detail,
    };
  });
}

function getBudgetTokens(budgets: Record<string, number>): SummaryToken[] {
  return Object.entries(budgets).map(([currencyKey, amount]) => ({
    label: `Currency ${currencyKey}: ${formatNumericValue(amount)}`,
    detail: 'Budget',
  }));
}

function getStipendTokens(stipends: Record<string, Record<string, number>>): SummaryToken[] {
  return Object.entries(stipends).flatMap(([currencyKey, subtypeEntries]) =>
    Object.entries(subtypeEntries).map(([subtypeKey, amount]) => ({
      label: `${formatNumericValue(amount)} stipend`,
      detail: `Currency ${currencyKey}, subtype ${subtypeKey}`,
    })),
  );
}

function getStructuredImportTokens(participation: {
  altForms: unknown[];
  currencyExchanges: unknown[];
  supplementPurchases: Record<string, unknown>;
  supplementInvestments: Record<string, unknown>;
  drawbackOverrides: Record<string, unknown>;
  importSourceMetadata: Record<string, unknown>;
}): SummaryToken[] {
  const tokens: SummaryToken[] = [];

  if (participation.altForms.length > 0) {
    tokens.push({ label: formatCountLabel(participation.altForms.length, 'alt form') });
  }

  if (participation.currencyExchanges.length > 0) {
    tokens.push({ label: formatCountLabel(participation.currencyExchanges.length, 'currency exchange') });
  }

  const supplementPurchaseCount = Object.keys(participation.supplementPurchases).length;

  if (supplementPurchaseCount > 0) {
    tokens.push({ label: formatCountLabel(supplementPurchaseCount, 'supplement purchase') });
  }

  const supplementInvestmentCount = Object.keys(participation.supplementInvestments).length;

  if (supplementInvestmentCount > 0) {
    tokens.push({ label: formatCountLabel(supplementInvestmentCount, 'supplement investment') });
  }

  const drawbackOverrideCount = Object.keys(participation.drawbackOverrides).length;

  if (drawbackOverrideCount > 0) {
    tokens.push({ label: formatCountLabel(drawbackOverrideCount, 'drawback override') });
  }

  const importMetadataKeys = Object.keys(participation.importSourceMetadata).length;

  if (importMetadataKeys > 0) {
    tokens.push({
      label: formatCountLabel(importMetadataKeys, 'preserved import block'),
      detail: 'Additional source-only metadata is still available in the advanced editor.',
      muted: true,
    });
  }

  return tokens;
}

function SummarySection(props: {
  title: string;
  items: SummaryToken[];
  emptyMessage: string;
  previewLimit?: number;
  description?: string;
}) {
  const previewLimit = props.previewLimit ?? 10;
  const visibleItems = props.items.slice(0, previewLimit);
  const hiddenCount = Math.max(0, props.items.length - visibleItems.length);

  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <div className="stack stack--compact">
          <h4>{props.title}</h4>
          {props.description ? <p className="editor-section__copy">{props.description}</p> : null}
        </div>
        <span className="pill">{props.items.length}</span>
      </div>
      {props.items.length === 0 ? (
        <p className="editor-section__empty">{props.emptyMessage}</p>
      ) : (
        <div className="token-list">
          {visibleItems.map((item, index) => (
            <span
              key={`${props.title}-${item.label}-${index}`}
              className={`token${item.muted ? ' token--muted' : ''}`}
              title={item.detail}
            >
              {item.label}
            </span>
          ))}
          {hiddenCount > 0 ? <span className="token token--muted">+{hiddenCount} more</span> : null}
        </div>
      )}
    </section>
  );
}

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
        description="Per-jumper, per-jump editing for perks, items, drawbacks, currencies, narratives, and preserved imported blocks."
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
          const purchaseGroups = participation ? getPurchaseTokenGroups(participation.purchases) : null;
          const purchaseGuidance = purchaseGroups
            ? `${formatCountLabel(purchaseGroups.perks.length, 'perk')}, ${formatCountLabel(
                purchaseGroups.items.length,
                'item',
              )}, and ${formatCountLabel(
                purchaseGroups.others.length,
                'other purchase',
                'other purchases',
              )} are grouped below. Raw imported structures stay editable in Advanced JSON editors.`
            : null;

          return (
            <article className="card editor-sheet stack" key={jumper.id}>
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
                  <section className="stack">
                    <div className="guidance-strip guidance-strip--accent">
                      <strong>Perks and items already live here.</strong>
                      <p>
                        Imported ChainMaker selections are stored in this participation record under purchases. The
                        editor now groups them into perks, items, and other purchases so you do not have to hunt
                        through raw JSON just to find them.
                      </p>
                    </div>

                    <div className="editor-section">
                      <div className="editor-section__header">
                        <div className="stack stack--compact">
                          <h4>Core Participation</h4>
                          <p className="editor-section__copy">
                            Fast fields for status, deposit, notes, and narrative beats for this jumper in the current
                            jump.
                          </p>
                        </div>
                      </div>

                      <div className="stack stack--compact">
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
                      </div>
                    </div>

                    <div className="editor-section-list">
                      <SummarySection
                        title="Perks"
                        description={purchaseGuidance ?? 'Imported and manual perk purchases are grouped here.'}
                        items={purchaseGroups?.perks ?? []}
                        emptyMessage="No perk purchases are recorded for this jumper in the current jump."
                      />
                      <SummarySection
                        title="Items"
                        description="Imported item purchases are grouped separately so physical acquisitions are easier to scan."
                        items={purchaseGroups?.items ?? []}
                        emptyMessage="No item purchases are recorded for this jumper in the current jump."
                      />
                      <SummarySection
                        title="Other purchases"
                        description="Unclassified purchases, companion-like selections, and anything without a perk or item type stay here."
                        items={purchaseGroups?.others ?? []}
                        emptyMessage="No uncategorized purchases are recorded for this participation."
                      />
                      <SummarySection
                        title="Drawbacks"
                        description="Active drawbacks attached to this jumper for this jump."
                        items={participation.drawbacks.map(getSelectionToken)}
                        emptyMessage="No drawbacks recorded for this jumper in the current jump."
                      />
                      <SummarySection
                        title="Retained drawbacks"
                        description="Carry-forward drawback selections that remain relevant past their original jump."
                        items={participation.retainedDrawbacks.map(getSelectionToken)}
                        emptyMessage="No retained drawbacks recorded."
                      />
                      <SummarySection
                        title="Origins and backgrounds"
                        description="Imported origin picks and background selections for this jumper."
                        items={getOriginTokens(participation.origins)}
                        emptyMessage="No origin or background selections were imported."
                      />
                      <SummarySection
                        title="Budgets and stipends"
                        description="Currency budgets and stipend allocations for the current jump."
                        items={[...getBudgetTokens(participation.budgets), ...getStipendTokens(participation.stipends)]}
                        emptyMessage="No budgets or stipends are defined for this participation."
                      />
                      <SummarySection
                        title="Structured imported blocks"
                        description="Source-only structured data that still belongs to this participation but does not have a first-class editor yet."
                        items={getStructuredImportTokens(participation)}
                        emptyMessage="No additional imported structured blocks are present."
                      />
                    </div>
                  </section>

                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Advanced JSON editors</span>
                      <span className="pill">manual cleanup and preserved source blocks</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <p className="field-hint">
                        The grouped sections above are the primary view. Use these JSON editors for cleanup,
                        migration work, and edge-case preservation when the structured surface is not enough.
                      </p>
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
                    </div>
                  </details>
                </>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
