import { useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { getEffectiveParticipationBudgetState } from '../../domain/chain/selectors';
import { participationStatuses } from '../../domain/common';
import { db } from '../../db/database';
import { saveChainRecord } from '../workspace/records';
import {
  AssistiveHint,
  AutosaveStatusIndicator,
  JsonEditorField,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type Workspace = ReturnType<typeof useChainWorkspace>['workspace'];
type WorkspaceJumper = Workspace['jumpers'][number];
type WorkspaceJump = Workspace['jumps'][number];
type WorkspaceParticipation = Workspace['participations'][number];

type ParticipationTab = 'beginnings' | 'perks' | 'subsystems' | 'items' | 'other' | 'drawbacks';
type PurchaseSectionKey = 'perk' | 'subsystem' | 'item' | 'other';
type DiscountLevel = 0 | 1 | 2;

const PRICE_MODES: Array<{ level: DiscountLevel; label: string; factor: number }> = [
  { level: 0, label: 'Full price', factor: 1 },
  { level: 1, label: 'Discounted', factor: 0.5 },
  { level: 2, label: 'Double discounted', factor: 0.25 },
];

interface SummaryToken {
  label: string;
  detail?: string;
  muted?: boolean;
}

interface PurchaseTokenGroups {
  perks: SummaryToken[];
  subsystems: SummaryToken[];
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
  currencyDefinitions: Record<string, CurrencyDefinition>;
  subtypeDefinitions?: Record<string, PurchaseSubtypeDefinition>;
  enablePricing?: boolean;
  showSubtypeSelector?: boolean;
}

interface CurrencyDefinition {
  name: string;
  abbrev: string;
  budget: number | null;
  essential: boolean;
}

interface PurchaseSubtypeDefinition {
  name: string;
  stipend: number | null;
  currencyKey: string;
  type: number | null;
  essential: boolean;
}

interface OriginCategoryDefinition {
  name: string;
  singleLine: boolean;
  defaultValue: string;
}

interface PurchaseClassification {
  perkSubtypeKeys: Set<string>;
  itemSubtypeKeys: Set<string>;
  subsystemSubtypeKeys: Set<string>;
}

interface StipendRow {
  currencyKey: string;
  subtypeKey: string;
  amount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getKeyList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === 'string' || typeof entry === 'number' ? String(entry) : ''))
        .filter((entry) => entry.trim().length > 0)
    : [];
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatNumericValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function getSelectionPurchaseType(value: unknown) {
  const record = asRecord(value);
  return getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);
}

function getSelectionSubtypeKey(value: unknown) {
  const subtypeValue = getOptionalNumber(asRecord(value).subtype);
  return subtypeValue !== null ? String(subtypeValue) : null;
}

function getSelectionCurrencyKey(value: unknown) {
  const currencyValue = getOptionalNumber(asRecord(value).currency);
  return currencyValue !== null ? String(currencyValue) : '0';
}

function getSelectionIsFree(value: unknown) {
  return asRecord(value).free === true;
}

function normalizeDiscountLevel(value: unknown): DiscountLevel {
  const parsedValue = getOptionalNumber(asRecord(value).costModifier);

  if (parsedValue === 1 || parsedValue === 2) {
    return parsedValue;
  }

  return 0;
}

function getPriceMode(level: DiscountLevel) {
  return PRICE_MODES.find((mode) => mode.level === level) ?? PRICE_MODES[0];
}

function getDiscountSource(value: unknown) {
  const discountSource = asRecord(value).discountSource;
  return typeof discountSource === 'string' ? discountSource : '';
}

function getComputedSelectionCost(value: unknown) {
  const record = asRecord(value);
  const baseValue = getOptionalNumber(record.value);

  if (baseValue === null) {
    return null;
  }

  if (getSelectionIsFree(record)) {
    return 0;
  }

  return Number((baseValue * getPriceMode(normalizeDiscountLevel(record)).factor).toFixed(2));
}

function applySelectionPricing(
  record: Record<string, unknown>,
  overrides: Partial<{
    free: boolean;
    discountLevel: DiscountLevel;
    discountSource: string;
  }>,
) {
  const nextRecord = { ...record };
  const nextFree = overrides.free ?? getSelectionIsFree(record);
  const nextDiscountLevel = overrides.discountLevel ?? normalizeDiscountLevel(record);
  const nextDiscountSource = overrides.discountSource ?? getDiscountSource(record);

  nextRecord.free = nextFree;
  nextRecord.costModifier = nextDiscountLevel;

  if (nextDiscountSource.trim().length > 0) {
    nextRecord.discountSource = nextDiscountSource;
  } else {
    delete nextRecord.discountSource;
  }

  const computedCost = getComputedSelectionCost({
    ...nextRecord,
    free: nextFree,
    costModifier: nextDiscountLevel,
  });

  if (computedCost !== null) {
    nextRecord.purchaseValue = computedCost;
  } else {
    delete nextRecord.purchaseValue;
  }

  return nextRecord;
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
  const valueAmount = getOptionalNumber(record.value);
  const computedCost = getComputedSelectionCost(record);

  if (tags.length > 0) {
    detailParts.push(tags.join(', '));
  }

  if (valueAmount !== null) {
    detailParts.push(`${valueAmount > 0 ? '+' : ''}${formatNumericValue(valueAmount)} value`);
  }

  if (record.free === true) {
    detailParts.push('Free');
  } else if (computedCost !== null && valueAmount !== null && computedCost !== valueAmount) {
    detailParts.push(`Pays ${formatNumericValue(computedCost)}`);
  }

  if (record.unresolved === true) {
    detailParts.push('Preserved unresolved reference');
  }

  return {
    label,
    detail: detailParts.length > 0 ? detailParts.join(' - ') : undefined,
  };
}

function getPurchaseClassification(
  subtypeDefinitions: Record<string, PurchaseSubtypeDefinition>,
): PurchaseClassification {
  const perkSubtypeKeys = new Set(
    Object.entries(subtypeDefinitions)
      .filter(([key, definition]) => {
        const lowerName = definition.name.toLowerCase();
        return definition.type === 0 && (key === '0' || lowerName.includes('perk'));
      })
      .map(([key]) => key),
  );
  const itemSubtypeKeys = new Set(
    Object.entries(subtypeDefinitions)
      .filter(([, definition]) => definition.type === 1)
      .map(([key]) => key),
  );
  const subsystemSubtypeKeys = new Set(
    Object.keys(subtypeDefinitions).filter(
      (key) => !perkSubtypeKeys.has(key) && !itemSubtypeKeys.has(key),
    ),
  );

  return {
    perkSubtypeKeys,
    itemSubtypeKeys,
    subsystemSubtypeKeys,
  };
}

function getPurchaseSectionForSelection(
  value: unknown,
  classification: PurchaseClassification,
): PurchaseSectionKey {
  const purchaseType = getSelectionPurchaseType(value);
  const subtypeKey = getSelectionSubtypeKey(value);

  if (purchaseType === 1 || (subtypeKey !== null && classification.itemSubtypeKeys.has(subtypeKey))) {
    return 'item';
  }

  if (purchaseType === 0 && (subtypeKey === null || classification.perkSubtypeKeys.has(subtypeKey))) {
    return 'perk';
  }

  if (
    purchaseType === 2 ||
    (subtypeKey !== null && classification.subsystemSubtypeKeys.has(subtypeKey))
  ) {
    return 'subsystem';
  }

  return 'other';
}

function filterPurchasesBySection(
  purchases: unknown[],
  section: PurchaseSectionKey,
  classification: PurchaseClassification,
) {
  return purchases.filter((purchase) => getPurchaseSectionForSelection(purchase, classification) === section);
}

function getPurchaseTokenGroups(
  purchases: unknown[],
  classification: PurchaseClassification,
): PurchaseTokenGroups {
  return purchases.reduce<PurchaseTokenGroups>(
    (groups, purchase) => {
      const token = getSelectionToken(purchase);
      const section = getPurchaseSectionForSelection(purchase, classification);

      if (section === 'perk') {
        groups.perks.push(token);
      } else if (section === 'subsystem') {
        groups.subsystems.push(token);
      } else if (section === 'item') {
        groups.items.push(token);
      } else {
        groups.others.push(token);
      }

      return groups;
    },
    {
      perks: [],
      subsystems: [],
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
    value: 0,
    currency: 0,
    free: false,
    costModifier: 0,
    purchaseValue: 0,
    ...extraFields,
  };
}

function normalizeSelectionForEdit(value: unknown, fallbackTitle: string): Record<string, unknown> {
  const record = asRecord(value);

  if (Object.keys(record).length > 0) {
    return { ...record };
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return createBlankSelection(String(value));
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
  const selectionKind =
    typeof record.selectionKind === 'string' && record.selectionKind.trim().length > 0
      ? record.selectionKind
      : null;

  if (sourcePurchaseId !== null) {
    metadata.push(`Source #${sourcePurchaseId}`);
  }

  if (value !== null) {
    metadata.push(`${value > 0 ? '+' : ''}${formatNumericValue(value)} value`);
  }

  if (selectionKind !== null) {
    metadata.push(selectionKind);
  }

  if (record.unresolved === true) {
    metadata.push('Unresolved import');
  }

  return metadata;
}

function getCurrencyDefinitions(value: unknown): Record<string, CurrencyDefinition> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, definition]) => {
      const record = asRecord(definition);

      return [
        key,
        {
          name:
            typeof record.name === 'string' && record.name.trim().length > 0
              ? record.name
              : `Currency ${key}`,
          abbrev: typeof record.abbrev === 'string' ? record.abbrev : '',
          budget: getOptionalNumber(record.budget),
          essential: record.essential === true,
        },
      ];
    }),
  );
}

function ensureCurrencyDefinitions(
  definitions: Record<string, CurrencyDefinition>,
  budgetKeys: string[],
): Record<string, CurrencyDefinition> {
  const nextDefinitions = { ...definitions };

  if (Object.keys(nextDefinitions).length === 0) {
    nextDefinitions['0'] = {
      name: 'Choice Points',
      abbrev: 'CP',
      budget: 1000,
      essential: true,
    };
  }

  for (const budgetKey of budgetKeys) {
    if (!(budgetKey in nextDefinitions)) {
      nextDefinitions[budgetKey] =
        budgetKey === '0'
          ? {
              name: 'Choice Points',
              abbrev: 'CP',
              budget: 1000,
              essential: true,
            }
          : {
              name: `Currency ${budgetKey}`,
              abbrev: '',
              budget: null,
              essential: false,
            };
    }
  }

  return nextDefinitions;
}

function getPurchaseSubtypeDefinitions(value: unknown): Record<string, PurchaseSubtypeDefinition> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, definition]) => {
      const record = asRecord(definition);

      return [
        key,
        {
          name:
            typeof record.name === 'string' && record.name.trim().length > 0
              ? record.name
              : `Subtype ${key}`,
          stipend: getOptionalNumber(record.stipend),
          currencyKey: String(getOptionalNumber(record.currency) ?? key),
          type: getOptionalNumber(record.type),
          essential: record.essential === true,
        },
      ];
    }),
  );
}

function getOriginCategoryDefinitions(value: unknown): Record<string, OriginCategoryDefinition> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, definition]) => {
      const record = asRecord(definition);

      return [
        key,
        {
          name:
            typeof record.name === 'string' && record.name.trim().length > 0
              ? record.name
              : `Field ${key}`,
          singleLine: record.singleLine === true,
          defaultValue: typeof record.default === 'string' ? record.default : '',
        },
      ];
    }),
  );
}

function getOrderedOriginCategoryKeys(
  origins: Record<string, unknown>,
  originCategories: Record<string, OriginCategoryDefinition>,
  categoryList: string[],
) {
  const seen = new Set<string>();
  const orderedKeys: string[] = [];

  for (const key of [...categoryList, ...Object.keys(originCategories), ...Object.keys(origins)]) {
    if (key.trim().length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    orderedKeys.push(key);
  }

  return orderedKeys;
}

function formatCurrencyLabel(currencyKey: string, definitions: Record<string, CurrencyDefinition>) {
  const definition = definitions[currencyKey];
  const name = definition?.name ?? `Currency ${currencyKey}`;
  const abbreviation = definition?.abbrev?.trim() ? definition.abbrev : null;

  return abbreviation ? `${name} (${abbreviation})` : name;
}

function formatPurchaseSubtypeLabel(
  subtypeKey: string,
  subtypeDefinitions: Record<string, PurchaseSubtypeDefinition>,
  currencyDefinitions: Record<string, CurrencyDefinition>,
) {
  const definition = subtypeDefinitions[subtypeKey];

  if (!definition) {
    return `Subtype ${subtypeKey}`;
  }

  return `${definition.name} • ${formatCurrencyLabel(definition.currencyKey, currencyDefinitions)}`;
}

function getOriginTokens(
  origins: Record<string, unknown>,
  originCategories: Record<string, OriginCategoryDefinition>,
  orderedOriginKeys: string[],
): SummaryToken[] {
  return orderedOriginKeys.flatMap((originKey) => {
    const record = asRecord(origins[originKey]);

    if (Object.keys(record).length === 0) {
      return [];
    }

    const categoryName = originCategories[originKey]?.name ?? `Field ${originKey}`;
    const summary =
      typeof record.summary === 'string' && record.summary.trim().length > 0
        ? record.summary
        : categoryName;
    const cost = getOptionalNumber(record.cost);
    const detailParts = [
      typeof record.description === 'string' && record.description.trim().length > 0
        ? record.description
        : null,
      cost !== null ? `${cost > 0 ? '+' : ''}${formatNumericValue(cost)} cost` : null,
    ].filter((entry): entry is string => Boolean(entry));

    return [
      {
        label: `${categoryName}: ${summary}`,
        detail: detailParts.length > 0 ? detailParts.join(' - ') : undefined,
      },
    ];
  });
}

function getBudgetTokens(
  effectiveBudgets: Record<string, number>,
  baseBudgets: Record<string, number>,
  chainDrawbackBudgetGrants: Record<string, number>,
  participationDrawbackBudgetGrants: Record<string, number>,
  currencyDefinitions: Record<string, CurrencyDefinition>,
): SummaryToken[] {
  return Object.entries(effectiveBudgets).map(([currencyKey, amount]) => {
    const baseAmount = baseBudgets[currencyKey] ?? 0;
    const chainDrawbackGrant = chainDrawbackBudgetGrants[currencyKey] ?? 0;
    const participationDrawbackGrant = participationDrawbackBudgetGrants[currencyKey] ?? 0;
    const detailParts = [`${formatNumericValue(baseAmount)} base`];

    if (participationDrawbackGrant !== 0) {
      detailParts.push(
        `${participationDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(participationDrawbackGrant)} from jump drawbacks`,
      );
    }

    if (chainDrawbackGrant !== 0) {
      detailParts.push(`${chainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(chainDrawbackGrant)} from chain drawbacks`);
    }

    return {
      label: `${formatCurrencyLabel(currencyKey, currencyDefinitions)}: ${formatNumericValue(amount)}`,
      detail: detailParts.join(' - '),
    };
  });
}

function getStipendTokens(
  stipends: Record<string, Record<string, number>>,
  subtypeDefinitions: Record<string, PurchaseSubtypeDefinition>,
  currencyDefinitions: Record<string, CurrencyDefinition>,
): SummaryToken[] {
  return Object.entries(stipends).flatMap(([currencyKey, subtypeEntries]) =>
    Object.entries(subtypeEntries).map(([subtypeKey, amount]) => ({
      label: `${formatPurchaseSubtypeLabel(subtypeKey, subtypeDefinitions, currencyDefinitions)}: ${formatNumericValue(amount)}`,
      detail: `Stored under ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`,
    })),
  );
}

function getRecordStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getRecordNumberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getOptionalNumber(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getCurrencyExchangeTokens(
  exchanges: unknown[],
  currencyDefinitions: Record<string, CurrencyDefinition>,
): SummaryToken[] {
  return exchanges.map((exchange, index) => {
    const record = asRecord(exchange);
    const fromCurrency =
      getRecordStringValue(record, ['fromCurrency', 'sourceCurrency', 'currencyFrom', 'sourceCurrencyKey', 'from', 'source']) ??
      getRecordStringValue(record, ['currency']);
    const toCurrency = getRecordStringValue(record, [
      'toCurrency',
      'targetCurrency',
      'currencyTo',
      'targetCurrencyKey',
      'to',
      'target',
    ]);
    const fromAmount = getRecordNumberValue(record, ['fromAmount', 'sourceAmount', 'spent', 'amount', 'value']);
    const toAmount = getRecordNumberValue(record, ['toAmount', 'targetAmount', 'receivedAmount', 'convertedAmount', 'received']);
    const notes = getRecordStringValue(record, ['notes', 'summary', 'description']);

    if (fromCurrency || toCurrency || fromAmount !== null || toAmount !== null) {
      const fromLabel = [
        fromAmount !== null ? formatNumericValue(fromAmount) : null,
        fromCurrency ? formatCurrencyLabel(fromCurrency, currencyDefinitions) : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(' ');
      const toLabel = [
        toAmount !== null ? formatNumericValue(toAmount) : null,
        toCurrency ? formatCurrencyLabel(toCurrency, currencyDefinitions) : null,
      ]
        .filter((entry): entry is string => Boolean(entry))
        .join(' ');

      return {
        label: `${fromLabel || 'Source'} -> ${toLabel || 'Target'}`,
        detail: notes ?? 'Stored conversion record.',
      };
    }

    return {
      label: `Exchange ${index + 1}`,
      detail: 'Unstructured exchange data. Use the JSON editor below to inspect or clean it up.',
      muted: true,
    };
  });
}

function getInheritedBaseBudgets(
  rawCurrencyDefinitions: Record<string, CurrencyDefinition>,
  explicitBudgets: Record<string, number>,
) {
  const importedBaseBudgets = Object.fromEntries(
    Object.entries(rawCurrencyDefinitions)
      .flatMap(([currencyKey, definition]) => (definition.budget !== null ? [[currencyKey, definition.budget]] : []))
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );

  if (Object.keys(importedBaseBudgets).length > 0) {
    return importedBaseBudgets;
  }

  return Object.keys(explicitBudgets).length === 0 ? { '0': 1000 } : {};
}

function flattenStipends(stipends: Record<string, Record<string, number>>): StipendRow[] {
  return Object.entries(stipends).flatMap(([currencyKey, subtypeEntries]) =>
    Object.entries(subtypeEntries).map(([subtypeKey, amount]) => ({
      currencyKey,
      subtypeKey,
      amount,
    })),
  );
}

function buildStipendsFromRows(rows: StipendRow[]) {
  return rows.reduce<Record<string, Record<string, number>>>((nextStipends, row) => {
    const currencyKey = row.currencyKey.trim();
    const subtypeKey = row.subtypeKey.trim();

    if (currencyKey.length === 0 || subtypeKey.length === 0) {
      return nextStipends;
    }

    return {
      ...nextStipends,
      [currencyKey]: {
        ...(nextStipends[currencyKey] ?? {}),
        [subtypeKey]: row.amount,
      },
    };
  }, {});
}

function renameRecordKey<T>(record: Record<string, T>, previousKey: string, nextKey: string) {
  const trimmedKey = nextKey.trim();

  if (trimmedKey.length === 0 || trimmedKey === previousKey) {
    return record;
  }

  const nextRecord = { ...record };
  const value = nextRecord[previousKey];
  delete nextRecord[previousKey];

  return {
    ...nextRecord,
    [trimmedKey]: value,
  };
}

function getNextCustomKey(existingKeys: string[], prefix: string) {
  let nextIndex = 1;

  while (existingKeys.includes(`${prefix}-${nextIndex}`)) {
    nextIndex += 1;
  }

  return `${prefix}-${nextIndex}`;
}

function matchesStipendSection(
  row: StipendRow,
  section: 'subsystems' | 'items',
  subtypeDefinitions: Record<string, PurchaseSubtypeDefinition>,
  classification: PurchaseClassification,
) {
  if (section === 'items') {
    return classification.itemSubtypeKeys.has(row.subtypeKey);
  }

  return !classification.itemSubtypeKeys.has(row.subtypeKey);
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
  const subtypeKeys = props.subtypeDefinitions ? Object.keys(props.subtypeDefinitions) : [];

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
            const currencyKey = getSelectionCurrencyKey(record);
            const subtypeKey = getSelectionSubtypeKey(record);
            const discountLevel = normalizeDiscountLevel(record);
            const isFree = getSelectionIsFree(record);
            const computedCost = getComputedSelectionCost(record);
            const discountSource = getDiscountSource(record);
            const availableSubtypeKeys =
              subtypeKey && !subtypeKeys.includes(subtypeKey) ? [subtypeKey, ...subtypeKeys] : subtypeKeys;

            return (
              <div className="selection-editor" key={`${props.title}-${index}-${getSelectionToken(item).label}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{getSelectionTitleValue(record, fallbackTitle)}</strong>
                    <div className="inline-meta">
                      {metadata.map((entry) => (
                        <span className="pill" key={`${props.title}-${index}-${entry}`}>
                          {entry}
                        </span>
                      ))}
                      <span className="pill">{formatCurrencyLabel(currencyKey, props.currencyDefinitions)}</span>
                      {props.enablePricing ? (
                        <span className="pill">{isFree ? 'Free' : getPriceMode(discountLevel).label}</span>
                      ) : null}
                      {props.enablePricing && discountSource.trim().length > 0 ? (
                        <span className="pill">Source: {discountSource}</span>
                      ) : null}
                    </div>
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
                </div>

                <div className="field-grid field-grid--three">
                  <label className="field">
                    <span>Value</span>
                    <input
                      type="number"
                      value={getOptionalNumber(record.value) ?? 0}
                      onChange={(event) =>
                        props.onChange(
                          updateSelectionItems(props.items, index, (current) =>
                            applySelectionPricing(
                              setOptionalNumericField(current, 'value', event.target.value),
                              {},
                            ),
                          ),
                        )
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Currency</span>
                    <select
                      value={currencyKey}
                      onChange={(event) =>
                        props.onChange(
                          updateSelectionItems(props.items, index, (current) => ({
                            ...current,
                            currency: Number(event.target.value),
                          })),
                        )
                      }
                    >
                      {Object.keys(props.currencyDefinitions).map((definitionKey) => (
                        <option key={definitionKey} value={definitionKey}>
                          {formatCurrencyLabel(definitionKey, props.currencyDefinitions)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {props.showSubtypeSelector && props.subtypeDefinitions ? (
                    <label className="field">
                      <span>Subtype</span>
                      <select
                        value={subtypeKey ?? ''}
                        onChange={(event) =>
                          props.onChange(
                            updateSelectionItems(props.items, index, (current) => {
                              if (event.target.value.trim().length === 0) {
                                const nextRecord = { ...current };
                                delete nextRecord.subtype;
                                return nextRecord;
                              }

                              return {
                                ...current,
                                subtype: Number(event.target.value),
                              };
                            }),
                          )
                        }
                      >
                        <option value="">None</option>
                        {availableSubtypeKeys.map((availableSubtypeKey) => (
                          <option key={availableSubtypeKey} value={availableSubtypeKey}>
                            {formatPurchaseSubtypeLabel(
                              availableSubtypeKey,
                              props.subtypeDefinitions ?? {},
                              props.currencyDefinitions,
                            )}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                {props.enablePricing ? (
                  <div className="stack stack--compact">
                    <div className="field-grid field-grid--three">
                      <div className="field">
                        <span>Free</span>
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={isFree}
                            onChange={(event) =>
                              props.onChange(
                                updateSelectionItems(props.items, index, (current) =>
                                  applySelectionPricing(current, {
                                    free: event.target.checked,
                                  }),
                                ),
                              )
                            }
                          />
                          <span>Does not spend budget</span>
                        </label>
                      </div>

                      <div className="field">
                        <span>Price mode</span>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() =>
                            props.onChange(
                              updateSelectionItems(props.items, index, (current) =>
                                applySelectionPricing(current, {
                                  discountLevel: ((normalizeDiscountLevel(current) + 1) % 3) as DiscountLevel,
                                }),
                              ),
                            )
                          }
                        >
                          {getPriceMode(discountLevel).label}
                        </button>
                      </div>

                      <label className="field">
                        <span>Computed spend</span>
                        <input readOnly value={computedCost !== null ? formatNumericValue(computedCost) : ''} />
                      </label>
                    </div>

                    <label className="field">
                      <span>Discount source</span>
                      <input
                        value={discountSource}
                        placeholder="why this is discounted or free"
                        onChange={(event) =>
                          props.onChange(
                            updateSelectionItems(props.items, index, (current) =>
                              applySelectionPricing(current, {
                                discountSource: event.target.value,
                              }),
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                ) : null}

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

function ParticipationEditorTabs(props: {
  tabs: Array<{ id: ParticipationTab; label: string; count?: number }>;
  activeTab: ParticipationTab;
  onChange: (tab: ParticipationTab) => void;
}) {
  return (
    <div className="editor-tab-list" role="tablist" aria-label="Participation sections">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          className={`editor-tab${props.activeTab === tab.id ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={props.activeTab === tab.id}
          onClick={() => props.onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {typeof tab.count === 'number' ? <span className="pill">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function OriginEditorSection(props: {
  origins: Record<string, unknown>;
  orderedOriginKeys: string[];
  originCategories: Record<string, OriginCategoryDefinition>;
  onChange: (nextOrigins: Record<string, unknown>) => void;
}) {
  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <div className="stack stack--compact">
          <h4>Beginnings</h4>
          <p className="editor-section__copy">
            Origin, background, race, age bracket, and similar setup choices live here.
          </p>
        </div>
        <span className="pill">{props.orderedOriginKeys.length}</span>
      </div>

      {props.orderedOriginKeys.length === 0 ? (
        <p className="editor-section__empty">No beginning fields are defined for this participation yet.</p>
      ) : (
        <div className="selection-editor-list">
          {props.orderedOriginKeys.map((originKey) => {
            const definition = props.originCategories[originKey];
            const record = asRecord(props.origins[originKey]);
            const summary = typeof record.summary === 'string' ? record.summary : definition?.defaultValue ?? '';
            const description = typeof record.description === 'string' ? record.description : '';
            const cost = getOptionalNumber(record.cost);
            const editableCategoryOptions = props.orderedOriginKeys.filter(
              (candidateKey) => candidateKey === originKey || !(candidateKey in props.origins),
            );

            return (
              <div className="selection-editor" key={`origin-${originKey}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{definition?.name ?? `Field ${originKey}`}</strong>
                    {definition?.defaultValue ? (
                      <div className="inline-meta">
                        <span className="pill">Default: {definition.defaultValue}</span>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      const nextOrigins = { ...props.origins };
                      delete nextOrigins[originKey];
                      props.onChange(nextOrigins);
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Field</span>
                    <select
                      value={originKey}
                      onChange={(event) => props.onChange(renameRecordKey(props.origins, originKey, event.target.value))}
                    >
                      {editableCategoryOptions.map((candidateKey) => (
                        <option key={candidateKey} value={candidateKey}>
                          {props.originCategories[candidateKey]?.name ?? candidateKey}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Cost</span>
                    <input
                      type="number"
                      value={cost ?? 0}
                      onChange={(event) =>
                        props.onChange({
                          ...props.origins,
                          [originKey]: {
                            ...record,
                            cost: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Selection</span>
                  {definition?.singleLine ? (
                    <input
                      value={summary}
                      onChange={(event) =>
                        props.onChange({
                          ...props.origins,
                          [originKey]: {
                            ...record,
                            summary: event.target.value,
                          },
                        })
                      }
                    />
                  ) : (
                    <textarea
                      rows={3}
                      value={summary}
                      onChange={(event) =>
                        props.onChange({
                          ...props.origins,
                          [originKey]: {
                            ...record,
                            summary: event.target.value,
                          },
                        })
                      }
                    />
                  )}
                </label>

                <label className="field">
                  <span>Notes / description</span>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(event) =>
                      props.onChange({
                        ...props.origins,
                        [originKey]: {
                          ...record,
                          description: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      <div className="actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            const unusedKey = props.orderedOriginKeys.find((originKey) => !(originKey in props.origins));
            const nextKey = unusedKey ?? getNextCustomKey(Object.keys(props.origins), 'origin-field');
            const definition = props.originCategories[nextKey];

            props.onChange({
              ...props.origins,
              [nextKey]: {
                summary: definition?.defaultValue ?? '',
                description: '',
                cost: 0,
              },
            });
          }}
        >
          Add Beginning Field
        </button>
      </div>
    </section>
  );
}

function findPrimaryCpBudget(
  effectiveBudgets: Record<string, number>,
  currencyDefinitions: Record<string, CurrencyDefinition>,
) {
  return Object.entries(effectiveBudgets).find(([currencyKey]) => {
    const definition = currencyDefinitions[currencyKey];
    const name = definition?.name ?? '';
    const abbreviation = definition?.abbrev ?? '';
    const combined = `${currencyKey} ${name} ${abbreviation}`.toLowerCase();

    return combined.includes('choice point') || combined.includes('choice points') || abbreviation.toLowerCase() === 'cp' || combined === 'cp';
  });
}

export function ParticipationEditorCard(props: {
  jumper: WorkspaceJumper;
  jump: WorkspaceJump;
  participation: WorkspaceParticipation;
  workspace: Workspace;
  showBudgetSummary?: boolean;
}) {
  const participationAutosave = useAutosaveRecord(props.participation, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.participations, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save participation changes.'),
  });
  const draftParticipation = participationAutosave.draft ?? props.participation;
  const rawCurrencyDefinitions = getCurrencyDefinitions(asRecord(draftParticipation.importSourceMetadata).currencies);
  const effectiveBudgetState = getEffectiveParticipationBudgetState(props.workspace, draftParticipation);
  const currencyDefinitions = ensureCurrencyDefinitions(
    rawCurrencyDefinitions,
    Array.from(
      new Set([
        ...Object.keys(effectiveBudgetState.baseBudgets),
        ...Object.keys(draftParticipation.budgets),
        ...Object.keys(effectiveBudgetState.participationDrawbackBudgetGrants),
      ]),
    ),
  );
  const purchaseSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(draftParticipation.importSourceMetadata).purchaseSubtypes);
  const purchaseClassification = getPurchaseClassification(purchaseSubtypeDefinitions);
  const purchaseGroups = getPurchaseTokenGroups(draftParticipation.purchases, purchaseClassification);
  const originCategories = getOriginCategoryDefinitions(asRecord(draftParticipation.importSourceMetadata).originCategories);
  const orderedOriginKeys = getOrderedOriginCategoryKeys(
    draftParticipation.origins,
    originCategories,
    getKeyList(asRecord(draftParticipation.importSourceMetadata).originCategoryList),
  );
  const inheritedBaseBudgets = getInheritedBaseBudgets(rawCurrencyDefinitions, draftParticipation.budgets);
  const showBudgetSummary = props.showBudgetSummary ?? true;
  const exchangeTokens = getCurrencyExchangeTokens(draftParticipation.currencyExchanges, currencyDefinitions);
  const cpBudgetEntry = findPrimaryCpBudget(effectiveBudgetState.effectiveBudgets, currencyDefinitions);
  const cpBudgetLabel = cpBudgetEntry ? formatCurrencyLabel(cpBudgetEntry[0], currencyDefinitions) : null;
  const cpBudgetValue = cpBudgetEntry?.[1] ?? null;
  const cpBaseValue = cpBudgetEntry ? effectiveBudgetState.baseBudgets[cpBudgetEntry[0]] ?? 0 : null;
  const cpJumpDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.participationDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;
  const cpChainDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.chainDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;
  const budgetRows = Array.from(
    new Set([...Object.keys(effectiveBudgetState.baseBudgets), ...Object.keys(draftParticipation.budgets)]),
  );
  const stipendRows = flattenStipends(draftParticipation.stipends);
  const subsystemStipendRows = stipendRows.filter((row) =>
    matchesStipendSection(row, 'subsystems', purchaseSubtypeDefinitions, purchaseClassification),
  );
  const itemStipendRows = stipendRows.filter((row) =>
    matchesStipendSection(row, 'items', purchaseSubtypeDefinitions, purchaseClassification),
  );
  const [activeTab, setActiveTab] = useState<ParticipationTab>('beginnings');

  const perkPurchases = filterPurchasesBySection(draftParticipation.purchases, 'perk', purchaseClassification);
  const subsystemPurchases = filterPurchasesBySection(draftParticipation.purchases, 'subsystem', purchaseClassification);
  const itemPurchases = filterPurchasesBySection(draftParticipation.purchases, 'item', purchaseClassification);
  const otherPurchases = filterPurchasesBySection(draftParticipation.purchases, 'other', purchaseClassification);

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

  function replacePurchaseSection(section: PurchaseSectionKey, nextItems: unknown[]) {
    updateParticipation((current) => {
      const otherItems = current.purchases.filter(
        (purchase) => getPurchaseSectionForSelection(purchase, purchaseClassification) !== section,
      );

      return {
        ...current,
        purchases: [...otherItems, ...nextItems],
      };
    });
  }

  function renderBudgetLinesSection() {
    return (
      <section className="editor-section">
        <div className="editor-section__header">
          <div className="stack stack--compact">
            <h4>Starting budget lines</h4>
            <p className="editor-section__copy">
              This is the jump’s visible starting pool before perks, items, conversions, and drawbacks start pushing it around.
            </p>
          </div>
          <span className="pill">{budgetRows.length}</span>
        </div>

        <div className="selection-editor-list">
          {budgetRows.map((currencyKey) => {
            const explicitAmount = draftParticipation.budgets[currencyKey];
            const visibleAmount = explicitAmount ?? effectiveBudgetState.baseBudgets[currencyKey] ?? 0;
            const inheritedAmount =
              currencyKey in inheritedBaseBudgets ? inheritedBaseBudgets[currencyKey] ?? null : null;
            const isCustomCurrency = !(currencyKey in rawCurrencyDefinitions) && currencyKey !== '0';

            return (
              <div className="selection-editor" key={`budget-${currencyKey}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{formatCurrencyLabel(currencyKey, currencyDefinitions)}</strong>
                    <div className="inline-meta">
                      <span className="pill">Key: {currencyKey}</span>
                      {inheritedAmount !== null ? (
                        <span className="pill">Default: {formatNumericValue(inheritedAmount)}</span>
                      ) : null}
                      {explicitAmount !== undefined ? <span className="pill">Custom override</span> : null}
                    </div>
                  </div>
                  {explicitAmount !== undefined ? (
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        updateParticipation((current) => {
                          const nextBudgets = { ...current.budgets };
                          delete nextBudgets[currencyKey];

                          return {
                            ...current,
                            budgets: nextBudgets,
                          };
                        })
                      }
                    >
                      {inheritedAmount !== null ? 'Reset' : 'Remove'}
                    </button>
                  ) : null}
                </div>

                <div className="field-grid field-grid--two">
                  {isCustomCurrency ? (
                    <label className="field">
                      <span>Currency key</span>
                      <input
                        value={currencyKey}
                        onChange={(event) =>
                          updateParticipation((current) => ({
                            ...current,
                            budgets: renameRecordKey(current.budgets, currencyKey, event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span>Currency</span>
                      <input value={formatCurrencyLabel(currencyKey, currencyDefinitions)} readOnly />
                    </label>
                  )}

                  <label className="field">
                    <span>Budget amount</span>
                    <input
                      type="number"
                      value={visibleAmount}
                      onChange={(event) =>
                        updateParticipation((current) => ({
                          ...current,
                          budgets: {
                            ...current.budgets,
                            [currencyKey]: Number(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              updateParticipation((current) => ({
                ...current,
                budgets: {
                  ...current.budgets,
                  [getNextCustomKey(
                    Array.from(new Set([...Object.keys(current.budgets), ...budgetRows])),
                    'custom-currency',
                  )]: 0,
                },
              }))
            }
          >
            Add Budget Line
          </button>
        </div>
      </section>
    );
  }

  function renderStipendSection(
    title: string,
    description: string,
    rows: StipendRow[],
    section: 'subsystems' | 'items',
  ) {
    return (
      <section className="editor-section">
        <div className="editor-section__header">
          <div className="stack stack--compact">
            <h4>{title}</h4>
            <p className="editor-section__copy">{description}</p>
          </div>
          <span className="pill">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <p className="editor-section__empty">No stipend rows are defined for this section yet.</p>
        ) : (
          <div className="selection-editor-list">
            {rows.map((row) => {
              const subtypeDefinition = purchaseSubtypeDefinitions[row.subtypeKey];
              const rowKey = `${row.currencyKey}-${row.subtypeKey}`;

              return (
                <div className="selection-editor" key={`stipend-${rowKey}`}>
                  <div className="selection-editor__header">
                    <div className="stack stack--compact">
                      <strong>{formatPurchaseSubtypeLabel(row.subtypeKey, purchaseSubtypeDefinitions, currencyDefinitions)}</strong>
                      <div className="inline-meta">
                        <span className="pill">Currency key: {row.currencyKey}</span>
                        <span className="pill">Subtype key: {row.subtypeKey}</span>
                        {subtypeDefinition?.stipend !== null && subtypeDefinition?.stipend !== undefined ? (
                          <span className="pill">Default stipend: {formatNumericValue(subtypeDefinition.stipend)}</span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        updateParticipation((current) => ({
                          ...current,
                          stipends: buildStipendsFromRows(
                            flattenStipends(current.stipends).filter(
                              (existingRow) =>
                                !(existingRow.currencyKey === row.currencyKey && existingRow.subtypeKey === row.subtypeKey),
                            ),
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>

                  <div className="field-grid field-grid--three">
                    <label className="field">
                      <span>Currency key</span>
                      <input
                        value={row.currencyKey}
                        onChange={(event) =>
                          updateParticipation((current) => {
                            const nextRows = flattenStipends(current.stipends).map((existingRow) =>
                              existingRow.currencyKey === row.currencyKey && existingRow.subtypeKey === row.subtypeKey
                                ? {
                                    ...existingRow,
                                    currencyKey: event.target.value,
                                  }
                                : existingRow,
                            );

                            return {
                              ...current,
                              stipends: buildStipendsFromRows(nextRows),
                            };
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Subtype key</span>
                      <input
                        value={row.subtypeKey}
                        onChange={(event) =>
                          updateParticipation((current) => {
                            const nextRows = flattenStipends(current.stipends).map((existingRow) =>
                              existingRow.currencyKey === row.currencyKey && existingRow.subtypeKey === row.subtypeKey
                                ? {
                                    ...existingRow,
                                    subtypeKey: event.target.value,
                                  }
                                : existingRow,
                            );

                            return {
                              ...current,
                              stipends: buildStipendsFromRows(nextRows),
                            };
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Stipend amount</span>
                      <input
                        type="number"
                        value={row.amount}
                        onChange={(event) =>
                          updateParticipation((current) => {
                            const nextRows = flattenStipends(current.stipends).map((existingRow) =>
                              existingRow.currencyKey === row.currencyKey && existingRow.subtypeKey === row.subtypeKey
                                ? {
                                    ...existingRow,
                                    amount: Number(event.target.value),
                                  }
                                : existingRow,
                            );

                            return {
                              ...current,
                              stipends: buildStipendsFromRows(nextRows),
                            };
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              updateParticipation((current) => {
                const currentRows = flattenStipends(current.stipends);
                const unusedSubtype = Object.entries(purchaseSubtypeDefinitions).find(
                  ([subtypeKey, definition]) =>
                    matchesStipendSection(
                      {
                        currencyKey: definition.currencyKey,
                        subtypeKey,
                        amount: definition.stipend ?? 0,
                      },
                      section,
                      purchaseSubtypeDefinitions,
                      purchaseClassification,
                    ) && !currentRows.some((row) => row.subtypeKey === subtypeKey),
                );
                const nextSubtypeKey =
                  unusedSubtype?.[0] ??
                  getNextCustomKey(currentRows.map((row) => row.subtypeKey), 'stipend-subtype');
                const nextCurrencyKey = unusedSubtype?.[1].currencyKey ?? '0';

                return {
                  ...current,
                  stipends: buildStipendsFromRows([
                    ...currentRows,
                    {
                      currencyKey: nextCurrencyKey,
                      subtypeKey: nextSubtypeKey,
                      amount: unusedSubtype?.[1].stipend ?? 0,
                    },
                  ]),
                };
              })
            }
          >
            Add Stipend Line
          </button>
        </div>
      </section>
    );
  }

  const tabs: Array<{ id: ParticipationTab; label: string; count?: number }> = [
    { id: 'beginnings', label: 'Beginnings', count: getOriginTokens(draftParticipation.origins, originCategories, orderedOriginKeys).length },
    { id: 'perks', label: 'Perks', count: purchaseGroups.perks.length },
    { id: 'subsystems', label: 'Subsystems', count: purchaseGroups.subsystems.length + subsystemStipendRows.length },
    { id: 'items', label: 'Items', count: purchaseGroups.items.length + itemStipendRows.length },
    { id: 'other', label: 'Other', count: purchaseGroups.others.length + exchangeTokens.length },
    { id: 'drawbacks', label: 'Drawbacks', count: draftParticipation.drawbacks.length + draftParticipation.retainedDrawbacks.length },
  ];

  return (
    <article className="card editor-sheet stack" key={props.jumper.id}>
      <div className="section-heading">
        <div className="stack stack--compact">
          <h3>{props.jumper.name}</h3>
          <p className="editor-section__copy">
            {props.jump.title} participation. This now follows the actual jump-buy flow instead of a raw record dump.
          </p>
        </div>
        <span className="pill">{draftParticipation.status}</span>
      </div>

      <AutosaveStatusIndicator status={participationAutosave.status} />

      <div className="guidance-strip guidance-strip--accent">
        <strong>One jump, one purchase flow.</strong>
        <p>
          Beginnings sets the jumper up, perks and subsystems handle the core buys, items get their own lane, other handles conversions, and drawbacks now feed the budget they are meant to increase.
        </p>
      </div>

      <div className="summary-grid">
        <article className="metric">
          <strong>{cpBaseValue !== null ? formatNumericValue(cpBaseValue) : 'No base CP'}</strong>
          <span>{cpBudgetLabel ? `${cpBudgetLabel} starting pool` : 'Define a primary currency below'}</span>
        </article>
        <article className="metric">
          <strong>
            {cpJumpDrawbackGrant !== null && cpJumpDrawbackGrant !== 0
              ? `${cpJumpDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(cpJumpDrawbackGrant)}`
              : '0'}
          </strong>
          <span>Jump drawback gain</span>
        </article>
        <article className="metric">
          <strong>
            {cpChainDrawbackGrant !== null && cpChainDrawbackGrant !== 0
              ? `${cpChainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(cpChainDrawbackGrant)}`
              : '0'}
          </strong>
          <span>Chain drawback gain</span>
        </article>
        <article className="metric">
          <strong>{cpBudgetValue !== null ? formatNumericValue(cpBudgetValue) : 'No current CP'}</strong>
          <span>Current visible CP pool</span>
        </article>
      </div>

      <ParticipationEditorTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'beginnings' ? (
        <div className="stack stack--compact">
          <div className="editor-section">
            <div className="editor-section__header">
              <div className="stack stack--compact">
                <h4>Core Participation</h4>
                <p className="editor-section__copy">
                  Status, notes, deposit, and narrative beats stay here with the initial setup instead of hiding in a separate overview tab.
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

          <OriginEditorSection
            origins={draftParticipation.origins}
            orderedOriginKeys={orderedOriginKeys}
            originCategories={originCategories}
            onChange={(nextOrigins) =>
              updateParticipation((current) => ({
                ...current,
                origins: nextOrigins,
              }))
            }
          />

          {showBudgetSummary ? (
            <SummarySection
              title="Current budgets"
              description="Base pool plus jump and chain drawback gains."
              items={getBudgetTokens(
                effectiveBudgetState.effectiveBudgets,
                effectiveBudgetState.baseBudgets,
                effectiveBudgetState.chainDrawbackBudgetGrants,
                effectiveBudgetState.participationDrawbackBudgetGrants,
                currencyDefinitions,
              )}
              emptyMessage="No currency budgets are visible for this participation yet."
            />
          ) : null}

          {renderBudgetLinesSection()}
        </div>
      ) : null}

      {activeTab === 'perks' ? (
        <SelectionEditorSection
          title="Perks"
          description="Core perk buys live here. Every entry now has free and discount controls, plus a source field for where the reduction came from."
          items={perkPurchases}
          emptyMessage="No perk purchases are recorded for this jumper in the current jump."
          addLabel="Add Perk"
          createItem={() => createBlankSelection('New Perk', { purchaseType: 0, selectionKind: 'purchase', subtype: 0 })}
          onChange={(nextItems) => replacePurchaseSection('perk', nextItems)}
          currencyDefinitions={currencyDefinitions}
          subtypeDefinitions={purchaseSubtypeDefinitions}
          enablePricing
          showSubtypeSelector
        />
      ) : null}

      {activeTab === 'subsystems' ? (
        <div className="stack stack--compact">
          <SelectionEditorSection
            title="Subsystems"
            description="Powers, companion imports, and other subsystem-flavoured buys sit here instead of getting mixed into general perks."
            items={subsystemPurchases}
            emptyMessage="No subsystem purchases are recorded for this participation."
            addLabel="Add Subsystem Purchase"
            createItem={() => createBlankSelection('New Subsystem Purchase', { purchaseType: 0, selectionKind: 'purchase', subtype: 10 })}
            onChange={(nextItems) => replacePurchaseSection('subsystem', nextItems)}
            currencyDefinitions={currencyDefinitions}
            subtypeDefinitions={purchaseSubtypeDefinitions}
            enablePricing
            showSubtypeSelector
          />

          <SummarySection
            title="Subsystem stipends"
            description="Subsystem-specific stipend pools stay beside the subsystem purchases that use them."
            items={getStipendTokens(
              buildStipendsFromRows(subsystemStipendRows),
              purchaseSubtypeDefinitions,
              currencyDefinitions,
            )}
            emptyMessage="No subsystem stipend rows are defined yet."
          />

          {renderStipendSection(
            'Subsystem stipend lines',
            'Use this for subsystem allowances and non-item stipend pools.',
            subsystemStipendRows,
            'subsystems',
          )}
        </div>
      ) : null}

      {activeTab === 'items' ? (
        <div className="stack stack--compact">
          <SelectionEditorSection
            title="Items"
            description="Items get their own lane, with the same free and discount controls as perks."
            items={itemPurchases}
            emptyMessage="No item purchases are recorded for this jumper in the current jump."
            addLabel="Add Item"
            createItem={() => createBlankSelection('New Item', { purchaseType: 1, selectionKind: 'purchase', subtype: 1 })}
            onChange={(nextItems) => replacePurchaseSection('item', nextItems)}
            currencyDefinitions={currencyDefinitions}
            subtypeDefinitions={purchaseSubtypeDefinitions}
            enablePricing
            showSubtypeSelector
          />

          <SummarySection
            title="Item stipends"
            description="Item stipend pools sit directly under the item buys they support."
            items={getStipendTokens(
              buildStipendsFromRows(itemStipendRows),
              purchaseSubtypeDefinitions,
              currencyDefinitions,
            )}
            emptyMessage="No item stipend rows are defined yet."
          />

          {renderStipendSection(
            'Item stipend lines',
            'Use this for item allowances and item-specific side pools.',
            itemStipendRows,
            'items',
          )}
        </div>
      ) : null}

      {activeTab === 'other' ? (
        <div className="stack stack--compact">
          <SelectionEditorSection
            title="Other purchases"
            description="Anything that is not a perk, subsystem, or item lives here. This tab also owns currency conversion records like CP to WP."
            items={otherPurchases}
            emptyMessage="No uncategorized purchases are recorded for this participation."
            addLabel="Add Other Purchase"
            createItem={() => createBlankSelection('New Other Purchase', { selectionKind: 'purchase' })}
            onChange={(nextItems) => replacePurchaseSection('other', nextItems)}
            currencyDefinitions={currencyDefinitions}
            subtypeDefinitions={purchaseSubtypeDefinitions}
            enablePricing
            showSubtypeSelector
          />

          <SummarySection
            title="Currency exchanges"
            description="CP to WP and similar conversion records now live beside the nonstandard purchase flows that usually rely on them."
            items={exchangeTokens}
            emptyMessage="No currency exchanges are recorded for this participation yet."
          />

          <section className="editor-section">
            <div className="editor-section__header">
              <div className="stack stack--compact">
                <h4>Currency exchange editor</h4>
                <p className="editor-section__copy">
                  Exchange data is still source-shaped, so it stays JSON-based for now, but it now sits in the main purchase flow instead of hiding in an advanced panel.
                </p>
              </div>
            </div>
            <JsonEditorField
              label="Currency exchanges (CP -> WP and similar)"
              value={draftParticipation.currencyExchanges}
              onValidChange={(value) =>
                updateParticipation((current) => ({
                  ...current,
                  currencyExchanges: Array.isArray(value) ? value : [],
                }))
              }
            />
          </section>
        </div>
      ) : null}

      {activeTab === 'drawbacks' ? (
        <div className="stack stack--compact">
          <div className="guidance-strip">
            <strong>Drawbacks increase budget here.</strong>
            <p>
              The value on these entries is now treated as jump budget gain, so the current budget view updates when you change drawback value or currency.
            </p>
          </div>

          <SummarySection
            title="Drawback budget gains"
            description="Current jump drawback entries that are contributing budget right now."
            items={effectiveBudgetState.contributingParticipationDrawbacks.map((contribution) => ({
              label: contribution.title,
              detail: Object.entries(contribution.budgetGrants)
                .map(
                  ([currencyKey, amount]) =>
                    `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`,
                )
                .join(' - '),
            }))}
            emptyMessage="No drawback entries are currently increasing budget."
          />

          <SelectionEditorSection
            title="Drawbacks"
            description="Active drawbacks for this jump. Their value increases the jump budget for the matching currency."
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
            currencyDefinitions={currencyDefinitions}
          />

          <SelectionEditorSection
            title="Retained drawbacks"
            description="Carry-forward drawbacks still visible in this jump. Their value also feeds the effective budget if you leave a value on them."
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
            currencyDefinitions={currencyDefinitions}
          />
        </div>
      ) : null}

      <details className="details-panel">
        <summary className="details-panel__summary">
          <span>Advanced JSON editors</span>
          <span className="pill">full escape hatch</span>
        </summary>
        <div className="details-panel__body stack stack--compact">
          <AssistiveHint
            as="p"
            text="The tabs above are now the primary workflow. Keep this section for migration cleanup, odd edge cases, or source fragments that still need a first-class editor."
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
              label="Origins / beginnings"
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

export function ParticipationBudgetInspector(props: {
  jumper: WorkspaceJumper;
  participation: WorkspaceParticipation;
  workspace: Workspace;
}) {
  const effectiveBudgetState = getEffectiveParticipationBudgetState(props.workspace, props.participation);
  const rawCurrencyDefinitions = getCurrencyDefinitions(asRecord(props.participation.importSourceMetadata).currencies);
  const currencyDefinitions = ensureCurrencyDefinitions(
    rawCurrencyDefinitions,
    Array.from(
      new Set([
        ...Object.keys(effectiveBudgetState.baseBudgets),
        ...Object.keys(props.participation.budgets),
        ...Object.keys(effectiveBudgetState.participationDrawbackBudgetGrants),
      ]),
    ),
  );
  const purchaseSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(props.participation.importSourceMetadata).purchaseSubtypes);
  const budgetTokens = getBudgetTokens(
    effectiveBudgetState.effectiveBudgets,
    effectiveBudgetState.baseBudgets,
    effectiveBudgetState.chainDrawbackBudgetGrants,
    effectiveBudgetState.participationDrawbackBudgetGrants,
    currencyDefinitions,
  );
  const stipendTokens = getStipendTokens(props.participation.stipends, purchaseSubtypeDefinitions, currencyDefinitions);
  const exchangeTokens = getCurrencyExchangeTokens(props.participation.currencyExchanges, currencyDefinitions);
  const cpBudgetEntry = findPrimaryCpBudget(effectiveBudgetState.effectiveBudgets, currencyDefinitions);
  const cpBudgetLabel = cpBudgetEntry ? formatCurrencyLabel(cpBudgetEntry[0], currencyDefinitions) : null;
  const cpBudgetValue = cpBudgetEntry?.[1] ?? null;
  const cpBaseValue = cpBudgetEntry ? effectiveBudgetState.baseBudgets[cpBudgetEntry[0]] ?? 0 : null;
  const cpJumpDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.participationDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;
  const cpChainDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.chainDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;

  return (
    <div className="stack stack--compact">
      <div className="guidance-strip guidance-strip--accent">
        <strong>{props.jumper.name}</strong>
        <p>
          Current jump budget details for this jumper, including baseline pools, jump drawback gains, chain drawback gains, and any stored currency exchanges.
        </p>
      </div>

      {cpBudgetLabel && cpBudgetValue !== null ? (
        <div className="summary-panel stack stack--compact">
          <h4>Current CP budget</h4>
          <p>
            <strong>{formatNumericValue(cpBudgetValue)}</strong> {cpBudgetLabel}
          </p>
          <p>
            {formatNumericValue(cpBaseValue ?? 0)} base
            {cpJumpDrawbackGrant ? ` | ${cpJumpDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(cpJumpDrawbackGrant)} from jump drawbacks` : ''}
            {cpChainDrawbackGrant ? ` | ${cpChainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(cpChainDrawbackGrant)} from chain drawbacks` : ''}
          </p>
        </div>
      ) : null}

      <SummarySection
        title="Effective budgets"
        description="Base budgets plus current jump drawback value and any active chain drawback gains."
        items={budgetTokens}
        emptyMessage="No budgets are defined for this participation yet."
      />

      <SummarySection
        title="Jump drawback gains"
        description="Current drawback entries on this participation that are feeding budget."
        items={effectiveBudgetState.contributingParticipationDrawbacks.map((contribution) => ({
          label: contribution.title,
          detail: Object.entries(contribution.budgetGrants)
            .map(([currencyKey, amount]) => `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`)
            .join(' - '),
        }))}
        emptyMessage="No participation drawbacks are adding budget right now."
      />

      <SummarySection
        title="Stipends"
        description="Recurring or subtype-specific stipend allocations attached to this participation."
        items={stipendTokens}
        emptyMessage="No stipends are defined for this participation yet."
      />

      <SummarySection
        title="Currency exchanges"
        description="Visible CP to WP and similar conversion records."
        items={exchangeTokens}
        emptyMessage="No currency exchanges are stored for this participation yet."
      />

      <SummarySection
        title="Chain drawback gains"
        description="Active chain drawbacks currently contributing extra budget."
        items={effectiveBudgetState.contributingChainDrawbacks.map((contribution) => ({
          label: contribution.effect.title,
          detail: Object.entries(contribution.budgetGrants)
            .map(([currencyKey, amount]) => `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`)
            .join(' - '),
        }))}
        emptyMessage="No active chain drawbacks are adding budget right now."
      />
    </div>
  );
}

export function ParticipationPage() {
  const { chainId, jumpId } = useParams();
  const [searchParams] = useSearchParams();

  if (!chainId || !jumpId) {
    return <Navigate to="/" replace />;
  }

  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.set('panel', 'participation');
  const nextSearch = nextSearchParams.toString();

  return <Navigate to={`/chains/${chainId}/jumps/${jumpId}${nextSearch.length > 0 ? `?${nextSearch}` : ''}`} replace />;
}
