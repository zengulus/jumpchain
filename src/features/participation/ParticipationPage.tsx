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

function SummaryPanel(props: { title: string; items: SummaryToken[]; emptyMessage: string; previewLimit?: number }) {
  const previewLimit = props.previewLimit ?? 10;
  const visibleItems = props.items.slice(0, previewLimit);
  const hiddenCount = Math.max(0, props.items.length - visibleItems.length);

  return (
    <article className="summary-panel stack stack--compact">
      <div className="section-heading">
        <h5>{props.title}</h5>
        <span className="pill">{props.items.length}</span>
      </div>
      {props.items.length === 0 ? (
        <p className="summary-panel__empty">{props.emptyMessage}</p>
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
    </article>
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

                    <div className="summary-grid">
                      <SummaryPanel
                        title="Purchases"
                        items={participation.purchases.map(getSelectionToken)}
                        emptyMessage="No purchases recorded for this jumper in the current jump."
                      />
                      <SummaryPanel
                        title="Drawbacks"
                        items={participation.drawbacks.map(getSelectionToken)}
                        emptyMessage="No drawbacks recorded for this jumper in the current jump."
                      />
                      <SummaryPanel
                        title="Retained drawbacks"
                        items={participation.retainedDrawbacks.map(getSelectionToken)}
                        emptyMessage="No retained drawbacks recorded."
                      />
                      <SummaryPanel
                        title="Origins and backgrounds"
                        items={getOriginTokens(participation.origins)}
                        emptyMessage="No origin or background selections were imported."
                      />
                      <SummaryPanel
                        title="Budgets and stipends"
                        items={[...getBudgetTokens(participation.budgets), ...getStipendTokens(participation.stipends)]}
                        emptyMessage="No budgets or stipends are defined for this participation."
                      />
                      <SummaryPanel
                        title="Structured imported blocks"
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
                        Imported selections stay readable above, while the raw structures remain editable here for
                        cleanup, migration work, and edge-case preservation.
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
