import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getEffectiveParticipationBudgetState } from '../../domain/chain/selectors';
import { participationStatuses } from '../../domain/common';
import { db } from '../../db/database';
import { createBlankParticipation, saveChainRecord } from '../workspace/records';
import {
  AssistiveHint,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
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

interface SelectionEditorSectionProps {
  title: string;
  description: string;
  items: unknown[];
  emptyMessage: string;
  addLabel: string;
  onChange: (nextItems: unknown[]) => void;
  createItem: () => unknown;
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

function createBlankSelection(title: string, extraFields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: title,
    summary: title,
    description: '',
    tags: [],
    ...extraFields,
  };
}

function normalizeSelectionForEdit(value: unknown, fallbackTitle: string): Record<string, unknown> {
  const record = asRecord(value);

  if (Object.keys(record).length > 0) {
    return { ...record };
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return {
      summary: String(value),
      description: '',
      tags: [],
    };
  }

  return createBlankSelection(fallbackTitle);
}

function getSelectionTitleValue(record: Record<string, unknown>, fallbackTitle: string) {
  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    return record.name;
  }

  if (typeof record.summary === 'string' && record.summary.trim().length > 0) {
    return record.summary;
  }

  return fallbackTitle;
}

function setSelectionTitleValue(record: Record<string, unknown>, nextTitle: string) {
  return {
    ...record,
    name: nextTitle,
    summary: nextTitle,
  };
}

function getSelectionDescriptionValue(record: Record<string, unknown>) {
  return typeof record.description === 'string' ? record.description : '';
}

function getSelectionTagList(record: Record<string, unknown>) {
  return getStringList(record.tags);
}

function setOptionalNumericField(record: Record<string, unknown>, key: string, nextValue: string) {
  const nextRecord = { ...record };

  if (nextValue.trim().length === 0) {
    delete nextRecord[key];
    return nextRecord;
  }

  nextRecord[key] = Number(nextValue);
  return nextRecord;
}

function updateSelectionItems(
  items: unknown[],
  index: number,
  updater: (record: Record<string, unknown>) => Record<string, unknown>,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? updater(normalizeSelectionForEdit(item, `Selection ${index + 1}`)) : item,
  );
}

function getSelectionMetadata(record: Record<string, unknown>) {
  const metadata: string[] = [];
  const sourcePurchaseId = getOptionalNumber(record.sourcePurchaseId);
  const value = getOptionalNumber(record.value);
  const purchaseType = getOptionalNumber(record.purchaseType);

  if (sourcePurchaseId !== null) {
    metadata.push(`Source #${sourcePurchaseId}`);
  }

  if (value !== null) {
    metadata.push(`${value > 0 ? '+' : ''}${formatNumericValue(value)} value`);
  }

  if (purchaseType === 0) {
    metadata.push('Perk');
  } else if (purchaseType === 1) {
    metadata.push('Item');
  }

  if (record.unresolved === true) {
    metadata.push('Unresolved import');
  }

  return metadata;
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

function getCurrencyDefinitions(value: unknown) {
  return asRecord(value);
}

function formatCurrencyLabel(currencyKey: string, definitions: Record<string, unknown>) {
  const definition = asRecord(definitions[currencyKey]);
  const name =
    typeof definition.name === 'string' && definition.name.trim().length > 0 ? definition.name : `Currency ${currencyKey}`;
  const abbreviation =
    typeof definition.abbrev === 'string' && definition.abbrev.trim().length > 0 ? definition.abbrev : null;

  return abbreviation ? `${name} (${abbreviation})` : name;
}

function getBudgetTokens(
  effectiveBudgets: Record<string, number>,
  baseBudgets: Record<string, number>,
  chainDrawbackBudgetGrants: Record<string, number>,
  currencyDefinitions: Record<string, unknown>,
): SummaryToken[] {
  return Object.entries(effectiveBudgets).map(([currencyKey, amount]) => {
    const baseAmount = baseBudgets[currencyKey] ?? 0;
    const chainDrawbackGrant = chainDrawbackBudgetGrants[currencyKey] ?? 0;
    const detailParts = [`${formatNumericValue(baseAmount)} base`];

    if (chainDrawbackGrant !== 0) {
      detailParts.push(`${chainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(chainDrawbackGrant)} from chain drawbacks`);
    }

    return {
      label: `${formatCurrencyLabel(currencyKey, currencyDefinitions)}: ${formatNumericValue(amount)}`,
      detail: detailParts.join(' - '),
    };
  });
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

function SelectionEditorSection(props: SelectionEditorSectionProps) {
  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <div className="stack stack--compact">
          <h4>{props.title}</h4>
          <p className="editor-section__copy">{props.description}</p>
        </div>
        <span className="pill">{props.items.length}</span>
      </div>

      {props.items.length === 0 ? (
        <p className="editor-section__empty">{props.emptyMessage}</p>
      ) : (
        <div className="selection-editor-list">
          {props.items.map((item, index) => {
            const fallbackTitle = `${props.title.slice(0, -1) || props.title} ${index + 1}`;
            const record = normalizeSelectionForEdit(item, fallbackTitle);
            const metadata = getSelectionMetadata(record);

            return (
              <div className="selection-editor" key={`${props.title}-${index}-${getSelectionToken(item).label}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{getSelectionTitleValue(record, fallbackTitle)}</strong>
                    {metadata.length > 0 ? (
                      <div className="inline-meta">
                        {metadata.map((entry) => (
                          <span className="pill" key={`${props.title}-${index}-${entry}`}>
                            {entry}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove
                  </button>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={getSelectionTitleValue(record, fallbackTitle)}
                      onChange={(event) =>
                        props.onChange(
                          updateSelectionItems(props.items, index, (current) =>
                            setSelectionTitleValue(current, event.target.value),
                          ),
                        )
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Tags</span>
                    <input
                      value={getSelectionTagList(record).join(', ')}
                      onChange={(event) =>
                        props.onChange(
                          updateSelectionItems(props.items, index, (current) => ({
                            ...current,
                            tags: event.target.value
                              .split(',')
                              .map((entry) => entry.trim())
                              .filter((entry) => entry.length > 0),
                          })),
                        )
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Value</span>
                    <input
                      type="number"
                      value={getOptionalNumber(record.value) ?? ''}
                      onChange={(event) =>
                        props.onChange(
                          updateSelectionItems(props.items, index, (current) =>
                            setOptionalNumericField(current, 'value', event.target.value),
                          ),
                        )
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={getSelectionDescriptionValue(record)}
                    onChange={(event) =>
                      props.onChange(
                        updateSelectionItems(props.items, index, (current) => ({
                          ...current,
                          description: event.target.value,
                        })),
                      )
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      <div className="actions">
        <button className="button button--secondary" type="button" onClick={() => props.onChange([...props.items, props.createItem()])}>
          {props.addLabel}
        </button>
      </div>
    </section>
  );
}

function ParticipationEditorCard(props: {
  jumper: ReturnType<typeof useChainWorkspace>['workspace']['jumpers'][number];
  jump: ReturnType<typeof useChainWorkspace>['workspace']['jumps'][number];
  participation: ReturnType<typeof useChainWorkspace>['workspace']['participations'][number];
  workspace: ReturnType<typeof useChainWorkspace>['workspace'];
}) {
  const participationAutosave = useAutosaveRecord(props.participation, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.participations, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save participation changes.'),
  });
  const draftParticipation = participationAutosave.draft ?? props.participation;
  const purchaseGroups = getPurchaseTokenGroups(draftParticipation.purchases);
  const effectiveBudgetState = getEffectiveParticipationBudgetState(props.workspace, draftParticipation);
  const currencyDefinitions = getCurrencyDefinitions(asRecord(draftParticipation.importSourceMetadata).currencies);
  const purchaseGuidance = `${formatCountLabel(purchaseGroups.perks.length, 'perk')}, ${formatCountLabel(
    purchaseGroups.items.length,
    'item',
  )}, and ${formatCountLabel(
    purchaseGroups.others.length,
    'other purchase',
    'other purchases',
  )} are grouped below. Raw imported structures stay editable in Advanced JSON editors.`;

  function updateParticipation(
    updater:
      | typeof draftParticipation
      | ((current: typeof draftParticipation) => typeof draftParticipation),
  ) {
    participationAutosave.updateDraft((current) => {
      const resolvedCurrent = current ?? draftParticipation;

      return typeof updater === 'function'
        ? (updater as (value: typeof draftParticipation) => typeof draftParticipation)(resolvedCurrent)
        : updater;
    });
  }

  return (
    <article className="card editor-sheet stack" key={props.jumper.id}>
      <div className="section-heading">
        <h3>{props.jumper.name}</h3>
        <span className="pill">{draftParticipation.status}</span>
      </div>

      <AutosaveStatusIndicator status={participationAutosave.status} />

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
                  value={draftParticipation.status}
                  onChange={(event) =>
                    updateParticipation((current) => ({
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
                  value={draftParticipation.bankDeposit}
                  onChange={(event) =>
                    updateParticipation((current) => ({
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
                value={draftParticipation.notes}
                onChange={(event) =>
                  updateParticipation((current) => ({
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
                  value={draftParticipation.narratives.accomplishments}
                  onChange={(event) =>
                    updateParticipation((current) => ({
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
                  value={draftParticipation.narratives.challenges}
                  onChange={(event) =>
                    updateParticipation((current) => ({
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
                  value={draftParticipation.narratives.goals}
                  onChange={(event) =>
                    updateParticipation((current) => ({
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
          <SelectionEditorSection
            title="Perks"
            description={purchaseGuidance}
            items={draftParticipation.purchases.filter(
              (purchase) =>
                (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) === 0,
            )}
            emptyMessage="No perk purchases are recorded for this jumper in the current jump."
            addLabel="Add Perk"
            createItem={() => createBlankSelection('New Perk', { purchaseType: 0, selectionKind: 'purchase' })}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                purchases: [
                  ...nextItems,
                  ...current.purchases.filter(
                    (purchase) =>
                      (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) !== 0,
                  ),
                ],
              }))
            }
          />
          <SelectionEditorSection
            title="Items"
            description="Imported item purchases are grouped separately so physical acquisitions are easier to scan."
            items={draftParticipation.purchases.filter(
              (purchase) =>
                (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) === 1,
            )}
            emptyMessage="No item purchases are recorded for this jumper in the current jump."
            addLabel="Add Item"
            createItem={() => createBlankSelection('New Item', { purchaseType: 1, selectionKind: 'purchase' })}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                purchases: [
                  ...current.purchases.filter(
                    (purchase) =>
                      (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) === 0,
                  ),
                  ...nextItems,
                  ...current.purchases.filter((purchase) => {
                    const purchaseType =
                      getOptionalNumber(asRecord(purchase).purchaseType) ??
                      getOptionalNumber(asRecord(purchase)._type);

                    return purchaseType !== 0 && purchaseType !== 1;
                  }),
                ],
              }))
            }
          />
          <SelectionEditorSection
            title="Other purchases"
            description="Unclassified purchases, companion-like selections, and anything without a perk or item type stay here."
            items={draftParticipation.purchases.filter((purchase) => {
              const purchaseType =
                getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type);

              return purchaseType !== 0 && purchaseType !== 1;
            })}
            emptyMessage="No uncategorized purchases are recorded for this participation."
            addLabel="Add Other Purchase"
            createItem={() => createBlankSelection('New Purchase', { selectionKind: 'purchase' })}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                purchases: [
                  ...current.purchases.filter(
                    (purchase) =>
                      (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) === 0,
                  ),
                  ...current.purchases.filter(
                    (purchase) =>
                      (getOptionalNumber(asRecord(purchase).purchaseType) ?? getOptionalNumber(asRecord(purchase)._type)) === 1,
                  ),
                  ...nextItems,
                ],
              }))
            }
          />
          <SelectionEditorSection
            title="Drawbacks"
            description="Active drawbacks attached to this jumper for this jump."
            items={draftParticipation.drawbacks}
            emptyMessage="No drawbacks recorded for this jumper in the current jump."
            addLabel="Add Drawback"
            createItem={() => createBlankSelection('New Drawback', { selectionKind: 'drawback' })}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                drawbacks: nextItems,
              }))
            }
          />
          <SelectionEditorSection
            title="Retained drawbacks"
            description="Carry-forward drawback selections that remain relevant past their original jump."
            items={draftParticipation.retainedDrawbacks}
            emptyMessage="No retained drawbacks recorded."
            addLabel="Add Retained Drawback"
            createItem={() => createBlankSelection('New Retained Drawback', { selectionKind: 'retained-drawback' })}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                retainedDrawbacks: nextItems,
              }))
            }
          />
          <SummarySection
            title="Origins and backgrounds"
            description="Imported origin picks and background selections for this jumper."
            items={getOriginTokens(draftParticipation.origins)}
            emptyMessage="No origin or background selections were imported."
          />
          <SummarySection
            title="Budgets and stipends"
            description={
              effectiveBudgetState.contributingChainDrawbacks.length > 0
                ? 'Currency budgets, stipend allocations, and active chain drawback rewards for this jump.'
                : 'Currency budgets and stipend allocations for the current jump.'
            }
            items={[
              ...getBudgetTokens(
                effectiveBudgetState.effectiveBudgets,
                effectiveBudgetState.baseBudgets,
                effectiveBudgetState.chainDrawbackBudgetGrants,
                currencyDefinitions,
              ),
              ...getStipendTokens(draftParticipation.stipends),
            ]}
            emptyMessage="No budgets or stipends are defined for this participation."
          />
          <SummarySection
            title="Structured imported blocks"
            description="Source-only structured data that still belongs to this participation but does not have a first-class editor yet."
            items={getStructuredImportTokens(draftParticipation)}
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
          <AssistiveHint
            as="p"
            text="The grouped sections above are the primary view. Use these JSON editors for cleanup, migration work, and edge-case preservation when the structured surface is not enough."
            triggerLabel="Explain advanced JSON editors"
          />
          <div className="field-grid field-grid--two">
            <JsonEditorField
              label="Purchases"
              value={draftParticipation.purchases}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  purchases: Array.isArray(value) ? value : [],
                }))
              }
            />
            <JsonEditorField
              label="Drawbacks"
              value={draftParticipation.drawbacks}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  drawbacks: Array.isArray(value) ? value : [],
                }))
              }
            />
            <JsonEditorField
              label="Retained drawbacks"
              value={draftParticipation.retainedDrawbacks}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  retainedDrawbacks: Array.isArray(value) ? value : [],
                }))
              }
            />
            <JsonEditorField
              label="Origins / backgrounds"
              value={draftParticipation.origins}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.budgets}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.stipends}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.altForms}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  altForms: Array.isArray(value) ? value : [],
                }))
              }
            />
            <JsonEditorField
              label="Currency exchanges"
              value={draftParticipation.currencyExchanges}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  currencyExchanges: Array.isArray(value) ? value : [],
                }))
              }
            />
            <JsonEditorField
              label="Supplement purchases"
              value={draftParticipation.supplementPurchases}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.supplementInvestments}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.drawbackOverrides}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
              value={draftParticipation.importSourceMetadata}
              onValidChange={(value) =>
                updateParticipation((current) => ({
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
    </article>
  );
}

export function ParticipationPage() {
  const { jumpId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const jump = workspace.jumps.find((entry) => entry.id === jumpId) ?? null;
  const focusedJumperId = searchParams.get('jumper');
  const visibleJumpers =
    focusedJumperId && workspace.jumpers.some((jumper) => jumper.id === focusedJumperId)
      ? workspace.jumpers.filter((jumper) => jumper.id === focusedJumperId)
      : workspace.jumpers;

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
        actions={
          focusedJumperId && workspace.jumpers.length > 1 ? (
            <button className="button button--secondary" type="button" onClick={() => setSearchParams({})}>
              Show All Jumpers
            </button>
          ) : undefined
        }
      />

      <StatusNoticeBanner notice={notice} />

      {workspace.jumpers.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumpers available"
          body="Add a jumper before editing participation for this jump."
        />
      ) : (
        visibleJumpers.map((jumper) => {
          const participation = workspace.participations.find(
            (entry) => entry.jumpId === jump.id && entry.jumperId === jumper.id,
          );

          return (
            <div key={jumper.id}>
              {!participation ? (
                <article className="card editor-sheet stack">
                  <div className="section-heading">
                    <h3>{jumper.name}</h3>
                    <span className="pill">not participating yet</span>
                  </div>

                  <div className="actions">
                    <button className="button" type="button" onClick={() => void ensureParticipation(jumper.id)}>
                      Add Participation Record
                    </button>
                  </div>
                </article>
              ) : (
                <ParticipationEditorCard
                  jump={jump}
                  jumper={jumper}
                  participation={participation}
                  workspace={workspace}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
