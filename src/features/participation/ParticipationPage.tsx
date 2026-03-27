import { useEffect, useState } from 'react';
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
import { COSMIC_BACKPACK_BP_CURRENCY_KEY } from '../cosmic-backpack/model';

type Workspace = ReturnType<typeof useChainWorkspace>['workspace'];
type WorkspaceJumper = Workspace['jumpers'][number];
type WorkspaceJump = Workspace['jumps'][number];
type WorkspaceParticipation = Workspace['participations'][number];

type ParticipationTab = 'beginnings' | 'perks' | 'subsystems' | 'items' | 'other' | 'drawbacks' | 'notes';
type PurchaseSectionKey = 'perk' | 'subsystem' | 'item' | 'other';
type DiscountLevel = 0 | 1 | 2;
type BeginningSlotId = 'origin' | 'background' | 'race' | 'age';
type PurchaseSubtypeSectionId = 'perks' | 'subsystems' | 'items' | 'other';

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
  description?: string;
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

interface BudgetLedgerEntry {
  currencyKey: string;
  starting: number;
  spent: number;
  exchangedOut: number;
  exchangedIn: number;
  remaining: number;
}

const CORE_BEGINNING_SLOTS: Array<{ id: BeginningSlotId; label: string; defaultKey: string; singleLine: boolean }> = [
  { id: 'origin', label: 'Origin', defaultKey: 'origin', singleLine: true },
  { id: 'background', label: 'Background', defaultKey: 'background', singleLine: true },
  { id: 'race', label: 'Race', defaultKey: 'race', singleLine: true },
  { id: 'age', label: 'Age / starting state', defaultKey: 'age', singleLine: true },
];
const DEFAULT_CURRENCY_DEFINITIONS: Record<string, CurrencyDefinition> = {
  '0': {
    name: 'Choice Points',
    abbrev: 'CP',
    budget: 1000,
    essential: true,
  },
  [COSMIC_BACKPACK_BP_CURRENCY_KEY]: {
    name: 'Cosmic Backpack BP',
    abbrev: 'BP',
    budget: null,
    essential: false,
  },
};
const DEFAULT_PURCHASE_SUBTYPE_DEFINITIONS: Record<string, PurchaseSubtypeDefinition> = {
  '0': {
    name: 'Perk',
    stipend: null,
    currencyKey: '0',
    type: 0,
    essential: true,
  },
  '1': {
    name: 'Item',
    stipend: null,
    currencyKey: '0',
    type: 1,
    essential: true,
  },
  '10': {
    name: 'Subsystem',
    stipend: null,
    currencyKey: '0',
    type: 2,
    essential: true,
  },
};

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

function titleCaseIdentifier(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

function getOptionalIdentifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function toStoredIdentifier(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return '';
  }

  return /^-?\d+(\.\d+)?$/.test(trimmedValue) ? Number(trimmedValue) : trimmedValue;
}

function getSelectionPurchaseType(value: unknown) {
  const record = asRecord(value);
  return getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);
}

function getSelectionSubtypeKey(value: unknown) {
  const record = asRecord(value);
  return getOptionalIdentifier(record.subtype) ?? getOptionalIdentifier(record.subtypeKey);
}

function getSelectionCurrencyKey(value: unknown) {
  const record = asRecord(value);
  return getOptionalIdentifier(record.currency) ?? getOptionalIdentifier(record.currencyKey) ?? '0';
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

function getSelectionEditorKey(value: unknown, title: string, index: number) {
  const record = asRecord(value);
  const explicitId =
    getOptionalIdentifier(record.id) ??
    getOptionalIdentifier(record.selectionId) ??
    getOptionalIdentifier(record.entryId) ??
    getOptionalIdentifier(record.uuid);
  const sourceId =
    getOptionalIdentifier(record.sourcePurchaseId) ??
    getOptionalIdentifier(record.sourceDrawbackId) ??
    getOptionalIdentifier(record.sourceId);

  if (explicitId) {
    return `${title}-${explicitId}`;
  }

  if (sourceId) {
    return `${title}-source-${sourceId}`;
  }

  return `${title}-${index}`;
}

function getSelectionMetadata(record: Record<string, unknown>) {
  const metadata: string[] = [];

  if (record.unresolved === true) {
    metadata.push('Needs review');
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
              : DEFAULT_CURRENCY_DEFINITIONS[key]?.name ?? `Currency ${key}`,
          abbrev: typeof record.abbrev === 'string' ? record.abbrev : '',
          budget: getOptionalNumber(record.budget),
          essential: record.essential === true || DEFAULT_CURRENCY_DEFINITIONS[key]?.essential === true,
        },
      ];
    }),
  );
}

function ensureCurrencyDefinitions(
  definitions: Record<string, CurrencyDefinition>,
  budgetKeys: string[],
): Record<string, CurrencyDefinition> {
  const nextDefinitions = {
    ...DEFAULT_CURRENCY_DEFINITIONS,
    ...definitions,
  };

  for (const budgetKey of budgetKeys) {
    if (!(budgetKey in nextDefinitions)) {
      nextDefinitions[budgetKey] = {
        name: budgetKey.startsWith('custom-currency') ? 'New currency' : `Currency ${budgetKey}`,
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
              : DEFAULT_PURCHASE_SUBTYPE_DEFINITIONS[key]?.name ?? `Subtype ${key}`,
          stipend: getOptionalNumber(record.stipend),
          currencyKey: getOptionalIdentifier(record.currency) ?? getOptionalIdentifier(record.currencyKey) ?? DEFAULT_PURCHASE_SUBTYPE_DEFINITIONS[key]?.currencyKey ?? '0',
          type: getOptionalNumber(record.type),
          essential: record.essential === true || DEFAULT_PURCHASE_SUBTYPE_DEFINITIONS[key]?.essential === true,
        },
      ];
    }),
  );
}

function ensurePurchaseSubtypeDefinitions(
  definitions: Record<string, PurchaseSubtypeDefinition>,
  subtypeKeys: string[],
): Record<string, PurchaseSubtypeDefinition> {
  const nextDefinitions = {
    ...DEFAULT_PURCHASE_SUBTYPE_DEFINITIONS,
    ...definitions,
  };

  for (const subtypeKey of subtypeKeys) {
    if (!(subtypeKey in nextDefinitions)) {
      nextDefinitions[subtypeKey] = {
        name: subtypeKey.startsWith('stipend-subtype') ? 'New stipend type' : `Subtype ${subtypeKey}`,
        stipend: null,
        currencyKey: '0',
        type: subtypeKey === '1' ? 1 : subtypeKey === '10' ? 2 : null,
        essential: false,
      };
    }
  }

  return nextDefinitions;
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
              : key.startsWith('origin-field') || key.startsWith('custom-beginning')
                ? 'Custom beginning'
                : titleCaseIdentifier(key),
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
  const name =
    definition?.name ??
    (currencyKey === '0'
      ? 'Choice Points'
      : currencyKey === COSMIC_BACKPACK_BP_CURRENCY_KEY
        ? 'Cosmic Backpack BP'
      : currencyKey.startsWith('custom-currency')
        ? 'Custom currency'
        : titleCaseIdentifier(currencyKey) || 'Custom currency');
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
    return subtypeKey.startsWith('stipend-subtype') ? 'Custom stipend' : titleCaseIdentifier(subtypeKey) || 'Custom stipend';
  }

  return `${definition.name} • ${formatCurrencyLabel(definition.currencyKey, currencyDefinitions)}`;
}

function getPurchaseSubtypeSection(
  subtypeKey: string,
  definition: PurchaseSubtypeDefinition,
): PurchaseSubtypeSectionId {
  const lowerName = definition.name.toLowerCase();

  if (definition.type === 1) {
    return 'items';
  }

  if (definition.type === 2) {
    return 'subsystems';
  }

  if (definition.type === 3) {
    return 'other';
  }

  if (definition.type === 0 && (subtypeKey === '0' || lowerName.includes('perk'))) {
    return 'perks';
  }

  return 'subsystems';
}

function getOriginCustomLabel(record: Record<string, unknown>) {
  return getRecordStringValue(record, ['label', 'title', 'name']);
}

function getOriginDisplayName(
  originKey: string,
  originCategories: Record<string, OriginCategoryDefinition>,
  record: Record<string, unknown>,
) {
  const customLabel = getOriginCustomLabel(record);

  if (customLabel) {
    return customLabel;
  }

  if (originCategories[originKey]?.name) {
    return originCategories[originKey].name;
  }

  if (originKey.startsWith('origin-field') || originKey.startsWith('custom-beginning')) {
    return 'Origin';
  }

  return titleCaseIdentifier(originKey) || 'Origin';
}

function inferBeginningSlotId(
  originKey: string,
  originCategories: Record<string, OriginCategoryDefinition>,
  record: Record<string, unknown>,
): BeginningSlotId | null {
  const combined = [originKey, originCategories[originKey]?.name ?? '', getOriginCustomLabel(record) ?? '']
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

  if (combined.includes('background')) {
    return 'background';
  }

  if (combined.includes('race') || combined.includes('species')) {
    return 'race';
  }

  if (combined.includes('age')) {
    return 'age';
  }

  if (combined.includes('origin')) {
    return 'origin';
  }

  return null;
}

function getSuggestedOriginKeyForSlot(
  slotId: BeginningSlotId,
  orderedOriginKeys: string[],
  originCategories: Record<string, OriginCategoryDefinition>,
  origins: Record<string, unknown>,
) {
  const matchingKey = orderedOriginKeys.find((originKey) => {
    if (originKey in origins) {
      return false;
    }

    return inferBeginningSlotId(originKey, originCategories, asRecord(origins[originKey])) === slotId;
  });

  return matchingKey ?? CORE_BEGINNING_SLOTS.find((slot) => slot.id === slotId)?.defaultKey ?? slotId;
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

    const categoryName = getOriginDisplayName(originKey, originCategories, record);
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
      detail: 'Conversion record',
      muted: true,
    };
  });
}

function normalizeCurrencyExchangeForEdit(value: unknown, defaultCurrencyKey: string) {
  const record = asRecord(value);

  return {
    ...record,
    fromCurrency:
      getRecordStringValue(record, ['fromCurrency', 'sourceCurrency', 'currencyFrom', 'sourceCurrencyKey', 'from', 'source']) ??
      getRecordStringValue(record, ['currency']) ??
      defaultCurrencyKey,
    toCurrency:
      getRecordStringValue(record, ['toCurrency', 'targetCurrency', 'currencyTo', 'targetCurrencyKey', 'to', 'target']) ??
      defaultCurrencyKey,
    fromAmount: getRecordNumberValue(record, ['fromAmount', 'sourceAmount', 'spent', 'amount', 'value']) ?? 0,
    toAmount: getRecordNumberValue(record, ['toAmount', 'targetAmount', 'receivedAmount', 'convertedAmount', 'received']) ?? 0,
    notes: getRecordStringValue(record, ['notes', 'summary', 'description']) ?? '',
  };
}

function updateCurrencyExchangeItems(
  items: unknown[],
  index: number,
  defaultCurrencyKey: string,
  updater: (record: Record<string, unknown>) => Record<string, unknown>,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? updater(normalizeCurrencyExchangeForEdit(item, defaultCurrencyKey)) : item,
  );
}

function getSelectionSpendAmount(selection: unknown) {
  const record = asRecord(selection);

  if (record.free === true) {
    return 0;
  }

  return getOptionalNumber(record.purchaseValue) ?? getComputedSelectionCost(record) ?? getOptionalNumber(record.value) ?? 0;
}

function sumCurrencyAmounts(entries: Array<{ currencyKey: string; amount: number }>) {
  return entries.reduce<Record<string, number>>((totals, entry) => {
    if (!Number.isFinite(entry.amount) || entry.amount === 0) {
      return totals;
    }

    return {
      ...totals,
      [entry.currencyKey]: (totals[entry.currencyKey] ?? 0) + entry.amount,
    };
  }, {});
}

function getOriginSpendAmounts(
  origins: Record<string, unknown>,
  orderedOriginKeys: string[],
  primaryCurrencyKey: string,
) {
  return sumCurrencyAmounts(
    orderedOriginKeys
      .map((originKey) => {
        const cost = getOptionalNumber(asRecord(origins[originKey]).cost);

        return cost !== null ? { currencyKey: primaryCurrencyKey, amount: cost } : null;
      })
      .filter((entry): entry is { currencyKey: string; amount: number } => entry !== null),
  );
}

function getBankDepositSpendAmounts(bankDeposit: number, primaryCurrencyKey: string) {
  return sumCurrencyAmounts(
    Number.isFinite(bankDeposit) && bankDeposit !== 0
      ? [
          {
            currencyKey: primaryCurrencyKey,
            amount: bankDeposit,
          },
        ]
      : [],
  );
}

function getCurrencyExchangeFlows(
  exchanges: unknown[],
  defaultCurrencyKey: string,
): { outflows: Record<string, number>; inflows: Record<string, number> } {
  return exchanges.reduce<{ outflows: Record<string, number>; inflows: Record<string, number> }>(
    (flows, exchange) => {
      const record = normalizeCurrencyExchangeForEdit(exchange, defaultCurrencyKey);
      const fromCurrency = typeof record.fromCurrency === 'string' ? record.fromCurrency : defaultCurrencyKey;
      const toCurrency = typeof record.toCurrency === 'string' ? record.toCurrency : defaultCurrencyKey;
      const fromAmount = getOptionalNumber(record.fromAmount) ?? 0;
      const toAmount = getOptionalNumber(record.toAmount) ?? 0;

      if (fromAmount !== 0) {
        flows.outflows[fromCurrency] = (flows.outflows[fromCurrency] ?? 0) + fromAmount;
      }

      if (toAmount !== 0) {
        flows.inflows[toCurrency] = (flows.inflows[toCurrency] ?? 0) + toAmount;
      }

      return flows;
    },
    { outflows: {}, inflows: {} },
  );
}

function getBudgetLedgerEntries(
  effectiveBudgets: Record<string, number>,
  purchases: unknown[],
  origins: Record<string, unknown>,
  orderedOriginKeys: string[],
  bankDeposit: number,
  currencyExchanges: unknown[],
  currencyDefinitions: Record<string, CurrencyDefinition>,
) {
  const primaryCurrencyKey = findPrimaryCpBudget(effectiveBudgets, currencyDefinitions)?.[0] ?? Object.keys(effectiveBudgets)[0] ?? '0';
  const purchaseSpend = sumCurrencyAmounts(
    purchases.map((purchase) => ({
      currencyKey: getSelectionCurrencyKey(purchase),
      amount: getSelectionSpendAmount(purchase),
    })),
  );
  const originSpend = getOriginSpendAmounts(origins, orderedOriginKeys, primaryCurrencyKey);
  const bankDepositSpend = getBankDepositSpendAmounts(bankDeposit, primaryCurrencyKey);
  const combinedSpend = sumCurrencyAmounts(
    [...Object.entries(purchaseSpend), ...Object.entries(originSpend), ...Object.entries(bankDepositSpend)].map(
      ([currencyKey, amount]) => ({ currencyKey, amount }),
    ),
  );
  const exchangeFlows = getCurrencyExchangeFlows(currencyExchanges, primaryCurrencyKey);
  const currencyKeys = new Set([
    ...Object.keys(effectiveBudgets),
    ...Object.keys(combinedSpend),
    ...Object.keys(exchangeFlows.outflows),
    ...Object.keys(exchangeFlows.inflows),
  ]);

  return Array.from(currencyKeys)
    .map<BudgetLedgerEntry>((currencyKey) => {
      const starting = effectiveBudgets[currencyKey] ?? 0;
      const spent = combinedSpend[currencyKey] ?? 0;
      const exchangedOut = exchangeFlows.outflows[currencyKey] ?? 0;
      const exchangedIn = exchangeFlows.inflows[currencyKey] ?? 0;

      return {
        currencyKey,
        starting,
        spent,
        exchangedOut,
        exchangedIn,
        remaining: starting - spent - exchangedOut + exchangedIn,
      };
    })
    .sort((left, right) => {
      if (left.currencyKey === primaryCurrencyKey) {
        return -1;
      }

      if (right.currencyKey === primaryCurrencyKey) {
        return 1;
      }

      return formatCurrencyLabel(left.currencyKey, currencyDefinitions).localeCompare(
        formatCurrencyLabel(right.currencyKey, currencyDefinitions),
      );
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
          {props.description ? <p className="editor-section__copy">{props.description}</p> : null}
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
              <div className="selection-editor" key={getSelectionEditorKey(item, props.title, index)}>
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
                            currency: toStoredIdentifier(event.target.value),
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
                                subtype: toStoredIdentifier(event.target.value),
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

function CurrencyExchangeEditorSection(props: {
  items: unknown[];
  currencyDefinitions: Record<string, CurrencyDefinition>;
  defaultCurrencyKey: string;
  onChange: (nextItems: unknown[]) => void;
}) {
  const currencyKeys = Object.keys(props.currencyDefinitions);

  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <h4>Currency exchanges</h4>
        <span className="pill">{props.items.length}</span>
      </div>

      <p className="editor-section__copy">
        Warehouse add-ons from any supplement can be bought with Cosmic Backpack BP. Use exchanges here when you want CP from this jump to fund Backpack-side warehouse purchases.
      </p>

      {props.items.length === 0 ? (
        <p className="editor-section__empty">No currency exchanges yet.</p>
      ) : (
        <div className="selection-editor-list">
          {props.items.map((item, index) => {
            const record = normalizeCurrencyExchangeForEdit(item, props.defaultCurrencyKey);
            const availableFromCurrencies = Array.from(new Set([String(record.fromCurrency), ...currencyKeys]));
            const availableToCurrencies = Array.from(new Set([String(record.toCurrency), ...currencyKeys]));

            return (
              <div className="selection-editor" key={`exchange-${index}`}>
                <div className="selection-editor__header">
                  <strong>
                    {formatCurrencyLabel(String(record.fromCurrency), props.currencyDefinitions)} {'->'}{' '}
                    {formatCurrencyLabel(String(record.toCurrency), props.currencyDefinitions)}
                  </strong>
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
                    <span>Spend from</span>
                    <select
                      value={String(record.fromCurrency)}
                      onChange={(event) =>
                        props.onChange(
                          updateCurrencyExchangeItems(props.items, index, props.defaultCurrencyKey, (current) => ({
                            ...current,
                            fromCurrency: event.target.value,
                          })),
                        )
                      }
                    >
                      {availableFromCurrencies.map((currencyKey) => (
                        <option key={`from-${currencyKey}`} value={currencyKey}>
                          {formatCurrencyLabel(currencyKey, props.currencyDefinitions)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Gain in</span>
                    <select
                      value={String(record.toCurrency)}
                      onChange={(event) =>
                        props.onChange(
                          updateCurrencyExchangeItems(props.items, index, props.defaultCurrencyKey, (current) => ({
                            ...current,
                            toCurrency: event.target.value,
                          })),
                        )
                      }
                    >
                      {availableToCurrencies.map((currencyKey) => (
                        <option key={`to-${currencyKey}`} value={currencyKey}>
                          {formatCurrencyLabel(currencyKey, props.currencyDefinitions)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Amount spent</span>
                    <input
                      type="number"
                      value={getOptionalNumber(record.fromAmount) ?? 0}
                      onChange={(event) =>
                        props.onChange(
                          updateCurrencyExchangeItems(props.items, index, props.defaultCurrencyKey, (current) => ({
                            ...current,
                            fromAmount: Number(event.target.value),
                          })),
                        )
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Amount gained</span>
                    <input
                      type="number"
                      value={getOptionalNumber(record.toAmount) ?? 0}
                      onChange={(event) =>
                        props.onChange(
                          updateCurrencyExchangeItems(props.items, index, props.defaultCurrencyKey, (current) => ({
                            ...current,
                            toAmount: Number(event.target.value),
                          })),
                        )
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={typeof record.notes === 'string' ? record.notes : ''}
                    onChange={(event) =>
                      props.onChange(
                        updateCurrencyExchangeItems(props.items, index, props.defaultCurrencyKey, (current) => ({
                          ...current,
                          notes: event.target.value,
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
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              normalizeCurrencyExchangeForEdit(
                {
                  fromCurrency: props.defaultCurrencyKey,
                  toCurrency: COSMIC_BACKPACK_BP_CURRENCY_KEY,
                  fromAmount: 0,
                  toAmount: 0,
                  notes: '',
                },
                props.defaultCurrencyKey,
              ),
            ])
          }
        >
          Add Cosmic Backpack Transfer
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              normalizeCurrencyExchangeForEdit({}, props.defaultCurrencyKey),
            ])
          }
        >
          Add Exchange
        </button>
      </div>
    </section>
  );
}

function CurrencyDefinitionEditorSection(props: {
  definitions: Record<string, CurrencyDefinition>;
  onChange: (nextDefinitions: Record<string, CurrencyDefinition>) => void;
}) {
  const definitionKeys = Object.keys(props.definitions).sort((left, right) => {
    if (left === '0') {
      return -1;
    }

    if (right === '0') {
      return 1;
    }

    if (left === COSMIC_BACKPACK_BP_CURRENCY_KEY) {
      return -1;
    }

    if (right === COSMIC_BACKPACK_BP_CURRENCY_KEY) {
      return 1;
    }

    return formatCurrencyLabel(left, props.definitions).localeCompare(formatCurrencyLabel(right, props.definitions));
  });

  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <h4>Currencies</h4>
        <span className="pill">{definitionKeys.length}</span>
      </div>

      <div className="selection-editor-list">
        {definitionKeys.map((currencyKey) => {
          const definition = props.definitions[currencyKey];
          const canRemove = currencyKey !== '0' && currencyKey !== COSMIC_BACKPACK_BP_CURRENCY_KEY;

          return (
            <div className="selection-editor" key={`currency-definition-${currencyKey}`}>
              <div className="selection-editor__header">
                <strong>{formatCurrencyLabel(currencyKey, props.definitions)}</strong>
                {canRemove ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      const nextDefinitions = { ...props.definitions };
                      delete nextDefinitions[currencyKey];
                      props.onChange(nextDefinitions);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="field-grid field-grid--two">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={definition.name}
                    onChange={(event) =>
                      props.onChange({
                        ...props.definitions,
                        [currencyKey]: {
                          ...definition,
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>

                <label className="field">
                  <span>Abbreviation</span>
                  <input
                    value={definition.abbrev}
                    onChange={(event) =>
                      props.onChange({
                        ...props.definitions,
                        [currencyKey]: {
                          ...definition,
                          abbrev: event.target.value,
                        },
                      })
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
          onClick={() => {
            const nextKey = getNextCustomKey(Object.keys(props.definitions), 'custom-currency');
            props.onChange({
              ...props.definitions,
              [nextKey]: {
                name: 'New currency',
                abbrev: '',
                budget: null,
                essential: false,
              },
            });
          }}
        >
          Add Currency
        </button>
      </div>
    </section>
  );
}

function PurchaseSubtypeDefinitionEditorSection(props: {
  title: string;
  section: Extract<PurchaseSubtypeSectionId, 'subsystems' | 'items'>;
  definitions: Record<string, PurchaseSubtypeDefinition>;
  currencyDefinitions: Record<string, CurrencyDefinition>;
  onChange: (nextDefinitions: Record<string, PurchaseSubtypeDefinition>) => void;
}) {
  const definitionEntries = Object.entries(props.definitions)
    .filter(([subtypeKey, definition]) => getPurchaseSubtypeSection(subtypeKey, definition) === props.section)
    .sort((left, right) => left[1].name.localeCompare(right[1].name));

  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <h4>{props.title}</h4>
        <span className="pill">{definitionEntries.length}</span>
      </div>

      {definitionEntries.length === 0 ? <p className="editor-section__empty">No stipend types yet.</p> : null}

      {definitionEntries.length > 0 ? (
        <div className="selection-editor-list">
          {definitionEntries.map(([subtypeKey, definition]) => {
            const canRemove = !definition.essential;

            return (
              <div className="selection-editor" key={`subtype-definition-${subtypeKey}`}>
                <div className="selection-editor__header">
                  <strong>{formatPurchaseSubtypeLabel(subtypeKey, props.definitions, props.currencyDefinitions)}</strong>
                  {canRemove ? (
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => {
                        const nextDefinitions = { ...props.definitions };
                        delete nextDefinitions[subtypeKey];
                        props.onChange(nextDefinitions);
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="field-grid field-grid--three">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={definition.name}
                      onChange={(event) =>
                        props.onChange({
                          ...props.definitions,
                          [subtypeKey]: {
                            ...definition,
                            name: event.target.value,
                          },
                        })
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Currency</span>
                    <select
                      value={definition.currencyKey}
                      onChange={(event) =>
                        props.onChange({
                          ...props.definitions,
                          [subtypeKey]: {
                            ...definition,
                            currencyKey: event.target.value,
                          },
                        })
                      }
                    >
                      {Object.keys(props.currencyDefinitions).map((currencyKey) => (
                        <option key={`subtype-currency-${subtypeKey}-${currencyKey}`} value={currencyKey}>
                          {formatCurrencyLabel(currencyKey, props.currencyDefinitions)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Default stipend</span>
                    <input
                      type="number"
                      value={definition.stipend ?? 0}
                      onChange={(event) =>
                        props.onChange({
                          ...props.definitions,
                          [subtypeKey]: {
                            ...definition,
                            stipend: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            const nextKey = getNextCustomKey(Object.keys(props.definitions), 'stipend-subtype');
            props.onChange({
              ...props.definitions,
              [nextKey]: {
                name: props.section === 'items' ? 'New item stipend' : 'New subsystem stipend',
                stipend: 0,
                currencyKey: '0',
                type: props.section === 'items' ? 1 : 2,
                essential: false,
              },
            });
          }}
        >
          Add Stipend Type
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
  const populatedEntries = props.orderedOriginKeys
    .map((originKey) => {
      const record = asRecord(props.origins[originKey]);

      return {
        originKey,
        record,
        definition: props.originCategories[originKey],
      };
    })
    .filter(({ originKey, record, definition }) => originKey in props.origins || Object.keys(record).length > 0 || Boolean(definition));
  const assignedCoreKeys = new Set<string>();
  const coreEntries = CORE_BEGINNING_SLOTS.map((slot) => {
    const existingEntry = populatedEntries.find(({ originKey, record }) => {
      if (assignedCoreKeys.has(originKey)) {
        return false;
      }

      return inferBeginningSlotId(originKey, props.originCategories, record) === slot.id;
    });

    if (existingEntry) {
      assignedCoreKeys.add(existingEntry.originKey);
    }

    return {
      slot,
      entry: existingEntry ?? null,
    };
  });
  const otherEntries = populatedEntries.filter(({ originKey }) => !assignedCoreKeys.has(originKey) && originKey in props.origins);

  function updateOrigin(originKey: string, updater: (record: Record<string, unknown>) => Record<string, unknown>) {
    props.onChange({
      ...props.origins,
      [originKey]: updater(asRecord(props.origins[originKey])),
    });
  }

  function renderBeginningEditor(
    originKey: string,
    label: string,
    singleLine: boolean,
    allowLabelEdit: boolean,
    record: Record<string, unknown>,
  ) {
    const summary = typeof record.summary === 'string' ? record.summary : '';
    const description = typeof record.description === 'string' ? record.description : '';
    const cost = getOptionalNumber(record.cost) ?? 0;

    return (
      <div className="selection-editor" key={`origin-${originKey}`}>
        <div className="selection-editor__header">
          <strong>{label}</strong>
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
          {allowLabelEdit ? (
            <label className="field">
              <span>Label</span>
              <input
                value={getOriginCustomLabel(record) ?? label}
                onChange={(event) =>
                  updateOrigin(originKey, (current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          <label className="field">
            <span>Cost</span>
            <input
              type="number"
              value={cost}
              onChange={(event) =>
                updateOrigin(originKey, (current) => ({
                  ...current,
                  cost: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <label className="field">
          <span>Choice</span>
          {singleLine ? (
            <input
              value={summary}
              onChange={(event) =>
                updateOrigin(originKey, (current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
          ) : (
            <textarea
              rows={3}
              value={summary}
              onChange={(event) =>
                updateOrigin(originKey, (current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
            />
          )}
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) =>
              updateOrigin(originKey, (current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
      </div>
    );
  }

  return (
    <section className="editor-section">
      <div className="editor-section__header">
        <h4>Beginnings</h4>
        <span className="pill">{Object.keys(props.origins).length}</span>
      </div>

      {Object.keys(props.origins).length === 0 ? (
        <p className="editor-section__empty">No beginnings yet.</p>
      ) : (
        <div className="selection-editor-list">
          {coreEntries
            .filter((entry) => entry.entry !== null)
            .map(({ slot, entry }) =>
              renderBeginningEditor(
                entry!.originKey,
                getOriginDisplayName(entry!.originKey, props.originCategories, entry!.record) || slot.label,
                entry!.definition?.singleLine ?? slot.singleLine,
                slot.id === 'origin',
                entry!.record,
              ),
            )}

          {otherEntries.length > 0 ? (
            <section className="editor-section">
              <div className="editor-section__header">
                <h5>Other beginnings</h5>
                <span className="pill">{otherEntries.length}</span>
              </div>
              <div className="selection-editor-list">
                {otherEntries.map(({ originKey, record, definition }) =>
                  renderBeginningEditor(
                    originKey,
                    getOriginDisplayName(originKey, props.originCategories, record),
                    definition?.singleLine ?? true,
                    true,
                    record,
                  ),
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <div className="actions">
        {coreEntries
          .filter(({ entry }) => entry === null)
          .map(({ slot }) => (
            <button
              className="button button--secondary"
              type="button"
              key={`add-${slot.id}`}
              onClick={() => {
                const nextKey = getSuggestedOriginKeyForSlot(
                  slot.id,
                  props.orderedOriginKeys,
                  props.originCategories,
                  props.origins,
                );
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
              Add {slot.label}
            </button>
          ))}
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            const nextKey = getNextCustomKey(Object.keys(props.origins), 'custom-beginning');

            props.onChange({
              ...props.origins,
              [nextKey]: {
                label: 'Origin',
                summary: '',
                description: '',
                cost: 0,
              },
            });
          }}
        >
          Add Beginning
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
  showBudgetHeader?: boolean;
  onDraftChange?: (draft: WorkspaceParticipation | null) => void;
}) {
  const participationAutosave = useAutosaveRecord(props.participation, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.participations, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save participation changes.'),
  });
  const draftParticipation = participationAutosave.draft ?? props.participation;
  useEffect(() => {
    props.onDraftChange?.(draftParticipation);
  }, [draftParticipation, props.onDraftChange]);

  useEffect(() => {
    return () => {
      props.onDraftChange?.(null);
    };
  }, [props.onDraftChange]);
  const rawCurrencyDefinitions = getCurrencyDefinitions(asRecord(draftParticipation.importSourceMetadata).currencies);
  const effectiveBudgetState = getEffectiveParticipationBudgetState(props.workspace, draftParticipation);
  const stipendRows = flattenStipends(draftParticipation.stipends);
  const provisionalCurrencyKeys = Array.from(
    new Set([
      ...Object.keys(rawCurrencyDefinitions),
      ...Object.keys(effectiveBudgetState.baseBudgets),
      ...Object.keys(draftParticipation.budgets),
      ...Object.keys(effectiveBudgetState.participationDrawbackBudgetGrants),
      ...Object.keys(effectiveBudgetState.chainDrawbackBudgetGrants),
      ...stipendRows.map((row) => row.currencyKey),
      ...draftParticipation.purchases.map((purchase) => getSelectionCurrencyKey(purchase)),
      ...draftParticipation.currencyExchanges.flatMap((exchange) => {
        const record = normalizeCurrencyExchangeForEdit(exchange, '0');
        return [String(record.fromCurrency), String(record.toCurrency)];
      }),
    ]),
  );
  const currencyDefinitions = ensureCurrencyDefinitions(
    rawCurrencyDefinitions,
    provisionalCurrencyKeys,
  );
  const rawPurchaseSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(draftParticipation.importSourceMetadata).purchaseSubtypes);
  const purchaseSubtypeDefinitions = ensurePurchaseSubtypeDefinitions(
    rawPurchaseSubtypeDefinitions,
    Array.from(
      new Set([
        ...Object.keys(rawPurchaseSubtypeDefinitions),
        ...stipendRows.map((row) => row.subtypeKey),
        ...draftParticipation.purchases
          .map((purchase) => getSelectionSubtypeKey(purchase))
          .filter((value): value is string => Boolean(value)),
      ]),
    ),
  );
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
  const showBudgetHeader = props.showBudgetHeader ?? true;
  const exchangeTokens = getCurrencyExchangeTokens(draftParticipation.currencyExchanges, currencyDefinitions);
  const cpBudgetEntry = findPrimaryCpBudget(effectiveBudgetState.effectiveBudgets, currencyDefinitions);
  const primaryCurrencyKey = cpBudgetEntry?.[0] ?? Object.keys(currencyDefinitions)[0] ?? '0';
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
  const budgetLedgerEntries = getBudgetLedgerEntries(
    effectiveBudgetState.effectiveBudgets,
    draftParticipation.purchases,
    draftParticipation.origins,
    orderedOriginKeys,
    draftParticipation.bankDeposit,
    draftParticipation.currencyExchanges,
    currencyDefinitions,
  );
  const primaryBudgetLedgerEntry =
    budgetLedgerEntries.find((entry) => entry.currencyKey === primaryCurrencyKey) ?? budgetLedgerEntries[0] ?? null;
  const cpCurrentValue = primaryBudgetLedgerEntry?.remaining ?? cpBudgetValue;

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

  function updateCurrencyDefinitions(nextDefinitions: Record<string, CurrencyDefinition>) {
    updateParticipation((current) => ({
      ...current,
      importSourceMetadata: {
        ...current.importSourceMetadata,
        currencies: nextDefinitions,
      },
    }));
  }

  function updatePurchaseSubtypeDefinitions(nextDefinitions: Record<string, PurchaseSubtypeDefinition>) {
    updateParticipation((current) => ({
      ...current,
      importSourceMetadata: {
        ...current.importSourceMetadata,
        purchaseSubtypes: nextDefinitions,
      },
    }));
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
          </div>
          <span className="pill">{budgetRows.length}</span>
        </div>

        <div className="selection-editor-list">
          {budgetRows.map((currencyKey) => {
            const explicitAmount = draftParticipation.budgets[currencyKey];
            const visibleAmount = explicitAmount ?? effectiveBudgetState.baseBudgets[currencyKey] ?? 0;
            const inheritedAmount =
              currencyKey in inheritedBaseBudgets ? inheritedBaseBudgets[currencyKey] ?? null : null;
            const availableCurrencyKeys = Array.from(new Set([currencyKey, ...Object.keys(currencyDefinitions)]));

            return (
              <div className="selection-editor" key={`budget-${currencyKey}`}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>{formatCurrencyLabel(currencyKey, currencyDefinitions)}</strong>
                    <div className="inline-meta">
                      {inheritedAmount !== null ? (
                        <span className="pill">Default {formatNumericValue(inheritedAmount)}</span>
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
                  <label className="field">
                    <span>Currency</span>
                    <select
                      value={currencyKey}
                      onChange={(event) =>
                        updateParticipation((current) => ({
                          ...current,
                          budgets: renameRecordKey(current.budgets, currencyKey, event.target.value),
                        }))
                      }
                    >
                      {availableCurrencyKeys.map((availableCurrencyKey) => (
                        <option key={availableCurrencyKey} value={availableCurrencyKey}>
                          {formatCurrencyLabel(availableCurrencyKey, currencyDefinitions)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Starting amount</span>
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
                  updateParticipation((current) => {
                    const existingCurrencyKeys = Array.from(
                      new Set([
                        ...Object.keys(asRecord(asRecord(current.importSourceMetadata).currencies)),
                        ...Object.keys(current.budgets),
                        ...budgetRows,
                      ]),
                    );
                const nextKey = getNextCustomKey(existingCurrencyKeys, 'custom-currency');
                const nextCurrencyDefinitions = {
                  ...getCurrencyDefinitions(asRecord(current.importSourceMetadata).currencies),
                  [nextKey]: {
                    name: 'New currency',
                    abbrev: '',
                    budget: null,
                    essential: false,
                  },
                };

                return {
                  ...current,
                  budgets: {
                    ...current.budgets,
                    [nextKey]: 0,
                  },
                  importSourceMetadata: {
                    ...current.importSourceMetadata,
                    currencies: nextCurrencyDefinitions,
                  },
                };
              })
            }
          >
            Add Budget Line
          </button>
        </div>
      </section>
    );
  }

  function renderStipendSection(title: string, rows: StipendRow[], section: 'subsystems' | 'items') {
    return (
      <section className="editor-section">
        <div className="editor-section__header">
          <h4>{title}</h4>
          <span className="pill">{rows.length}</span>
        </div>

        {rows.length === 0 ? (
          <p className="editor-section__empty">No stipend lines yet.</p>
        ) : (
          <div className="selection-editor-list">
            {rows.map((row) => {
              const subtypeDefinition = purchaseSubtypeDefinitions[row.subtypeKey];
              const rowKey = `${row.currencyKey}-${row.subtypeKey}`;
              const availableCurrencyKeys = Array.from(new Set([row.currencyKey, ...Object.keys(currencyDefinitions)]));
              const availableSubtypeKeys = Array.from(new Set([row.subtypeKey, ...Object.keys(purchaseSubtypeDefinitions)]));

              return (
                <div className="selection-editor" key={`stipend-${rowKey}`}>
                  <div className="selection-editor__header">
                    <div className="stack stack--compact">
                      <strong>{formatPurchaseSubtypeLabel(row.subtypeKey, purchaseSubtypeDefinitions, currencyDefinitions)}</strong>
                      {subtypeDefinition?.stipend !== null && subtypeDefinition?.stipend !== undefined ? (
                        <div className="inline-meta">
                          <span className="pill">Default {formatNumericValue(subtypeDefinition.stipend)}</span>
                        </div>
                      ) : null}
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
                      <span>Currency</span>
                      <select
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
                      >
                        {availableCurrencyKeys.map((currencyKey) => (
                          <option key={`stipend-currency-${currencyKey}`} value={currencyKey}>
                            {formatCurrencyLabel(currencyKey, currencyDefinitions)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Stipend type</span>
                      <select
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
                      >
                        {availableSubtypeKeys.map((subtypeKey) => (
                          <option key={`stipend-subtype-${subtypeKey}`} value={subtypeKey}>
                            {formatPurchaseSubtypeLabel(subtypeKey, purchaseSubtypeDefinitions, currencyDefinitions)}
                          </option>
                        ))}
                      </select>
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
                const currentSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(current.importSourceMetadata).purchaseSubtypes);
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
                const nextPurchaseSubtypeDefinitions =
                  unusedSubtype?.[0]
                    ? currentSubtypeDefinitions
                    : {
                        ...currentSubtypeDefinitions,
                        [nextSubtypeKey]: {
                          name: section === 'items' ? 'New item stipend' : 'New subsystem stipend',
                          stipend: 0,
                          currencyKey: nextCurrencyKey,
                          type: section === 'items' ? 1 : 2,
                          essential: false,
                        },
                      };

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
                  importSourceMetadata: {
                    ...current.importSourceMetadata,
                    purchaseSubtypes: nextPurchaseSubtypeDefinitions,
                  },
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
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <article className="card editor-sheet stack" key={props.jumper.id}>
      <div className="section-heading">
        <h3>{props.jumper.name}</h3>
        <span className="pill">{draftParticipation.status}</span>
      </div>

      <AutosaveStatusIndicator status={participationAutosave.status} />

      {showBudgetHeader ? (
        <ParticipationBudgetSummaryGrid
          cpBaseValue={cpBaseValue}
          cpBudgetLabel={cpBudgetLabel}
          cpBudgetValue={cpCurrentValue}
          cpJumpDrawbackGrant={cpJumpDrawbackGrant}
          cpChainDrawbackGrant={cpChainDrawbackGrant}
        />
      ) : null}

      <ParticipationEditorTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'beginnings' ? (
        <div className="stack stack--compact">
          <div className="editor-section">
            <div className="editor-section__header">
              <h4>Core Participation</h4>
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
              title="Budget ledger"
              items={budgetLedgerEntries.map((entry) => ({
                label: `${formatCurrencyLabel(entry.currencyKey, currencyDefinitions)}: ${formatNumericValue(entry.remaining)} left`,
                detail: [
                  `${formatNumericValue(entry.starting)} start`,
                  entry.spent !== 0 ? `-${formatNumericValue(entry.spent)} spent` : null,
                  entry.exchangedOut !== 0 ? `-${formatNumericValue(entry.exchangedOut)} exchanged out` : null,
                  entry.exchangedIn !== 0 ? `+${formatNumericValue(entry.exchangedIn)} exchanged in` : null,
                ]
                  .filter((value): value is string => Boolean(value))
                  .join(' - '),
              }))}
              emptyMessage="No budgets yet."
            />
          ) : null}

          {renderBudgetLinesSection()}

          <CurrencyDefinitionEditorSection
            definitions={currencyDefinitions}
            onChange={updateCurrencyDefinitions}
          />
        </div>
      ) : null}

      {activeTab === 'perks' ? (
        <SelectionEditorSection
          title="Perks"
          items={perkPurchases}
          emptyMessage="No perks yet."
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
            items={subsystemPurchases}
            emptyMessage="No subsystem purchases yet."
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
            items={getStipendTokens(
              buildStipendsFromRows(subsystemStipendRows),
              purchaseSubtypeDefinitions,
              currencyDefinitions,
            )}
            emptyMessage="No subsystem stipends yet."
          />

          {renderStipendSection(
            'Subsystem stipend lines',
            subsystemStipendRows,
            'subsystems',
          )}

          <PurchaseSubtypeDefinitionEditorSection
            title="Subsystem stipend types"
            section="subsystems"
            definitions={purchaseSubtypeDefinitions}
            currencyDefinitions={currencyDefinitions}
            onChange={updatePurchaseSubtypeDefinitions}
          />
        </div>
      ) : null}

      {activeTab === 'items' ? (
        <div className="stack stack--compact">
          <SelectionEditorSection
            title="Items"
            items={itemPurchases}
            emptyMessage="No items yet."
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
            items={getStipendTokens(
              buildStipendsFromRows(itemStipendRows),
              purchaseSubtypeDefinitions,
              currencyDefinitions,
            )}
            emptyMessage="No item stipends yet."
          />

          {renderStipendSection(
            'Item stipend lines',
            itemStipendRows,
            'items',
          )}

          <PurchaseSubtypeDefinitionEditorSection
            title="Item stipend types"
            section="items"
            definitions={purchaseSubtypeDefinitions}
            currencyDefinitions={currencyDefinitions}
            onChange={updatePurchaseSubtypeDefinitions}
          />
        </div>
      ) : null}

      {activeTab === 'other' ? (
        <div className="stack stack--compact">
          <SelectionEditorSection
            title="Other purchases"
            items={otherPurchases}
            emptyMessage="No other purchases yet."
            addLabel="Add Other Purchase"
            createItem={() => createBlankSelection('New Other Purchase', { selectionKind: 'purchase' })}
            onChange={(nextItems) => replacePurchaseSection('other', nextItems)}
            currencyDefinitions={currencyDefinitions}
            subtypeDefinitions={purchaseSubtypeDefinitions}
            enablePricing
            showSubtypeSelector
          />

          <CurrencyExchangeEditorSection
            items={draftParticipation.currencyExchanges}
            currencyDefinitions={currencyDefinitions}
            defaultCurrencyKey={primaryCurrencyKey}
            onChange={(nextItems) =>
              updateParticipation((current) => ({
                ...current,
                currencyExchanges: nextItems,
              }))
            }
          />
        </div>
      ) : null}

      {activeTab === 'drawbacks' ? (
        <div className="stack stack--compact">
          <SummarySection
            title="Drawback budget gains"
            items={effectiveBudgetState.contributingParticipationDrawbacks.map((contribution) => ({
              label: contribution.title,
              detail: Object.entries(contribution.budgetGrants)
                .map(
                  ([currencyKey, amount]) =>
                    `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`,
                )
                .join(' - '),
            }))}
            emptyMessage="No drawback gains yet."
          />

          <SelectionEditorSection
            title="Drawbacks"
            items={draftParticipation.drawbacks}
            emptyMessage="No drawbacks yet."
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
            items={draftParticipation.retainedDrawbacks}
            emptyMessage="No retained drawbacks."
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

      {activeTab === 'notes' ? (
        <div className="stack stack--compact">
          <section className="editor-section">
            <div className="editor-section__header">
              <h4>Notes</h4>
            </div>

            <label className="field">
              <span>Jump notes</span>
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
          </section>
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
            text="Use this only when the main tabs do not cover a case yet."
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

function ParticipationBudgetSummaryGrid(props: {
  cpBaseValue: number | null;
  cpBudgetLabel: string | null;
  cpBudgetValue: number | null;
  cpJumpDrawbackGrant: number | null;
  cpChainDrawbackGrant: number | null;
}) {
  return (
    <div className="summary-grid">
      <article className="metric">
        <strong>{props.cpBaseValue !== null ? formatNumericValue(props.cpBaseValue) : 'No base CP'}</strong>
        <span>{props.cpBudgetLabel ? `${props.cpBudgetLabel} starting pool` : 'No primary CP'}</span>
      </article>
      <article className="metric">
        <strong>
          {props.cpJumpDrawbackGrant !== null && props.cpJumpDrawbackGrant !== 0
            ? `${props.cpJumpDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(props.cpJumpDrawbackGrant)}`
            : '0'}
        </strong>
        <span>Jump drawback gain</span>
      </article>
      <article className="metric">
        <strong>
          {props.cpChainDrawbackGrant !== null && props.cpChainDrawbackGrant !== 0
            ? `${props.cpChainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(props.cpChainDrawbackGrant)}`
            : '0'}
        </strong>
        <span>Chain drawback gain</span>
      </article>
      <article className="metric">
        <strong>{props.cpBudgetValue !== null ? formatNumericValue(props.cpBudgetValue) : 'No current CP'}</strong>
        <span>Current CP</span>
      </article>
    </div>
  );
}

function getParticipationBudgetSummaryData(workspace: Workspace, participation: WorkspaceParticipation) {
  const effectiveBudgetState = getEffectiveParticipationBudgetState(workspace, participation);
  const rawCurrencyDefinitions = getCurrencyDefinitions(asRecord(participation.importSourceMetadata).currencies);
  const stipendRows = flattenStipends(participation.stipends);
  const currencyDefinitions = ensureCurrencyDefinitions(
    rawCurrencyDefinitions,
    Array.from(
      new Set([
        ...Object.keys(rawCurrencyDefinitions),
        ...Object.keys(effectiveBudgetState.baseBudgets),
        ...Object.keys(participation.budgets),
        ...Object.keys(effectiveBudgetState.chainDrawbackBudgetGrants),
        ...Object.keys(effectiveBudgetState.participationDrawbackBudgetGrants),
        ...stipendRows.map((row) => row.currencyKey),
        ...participation.purchases.map((purchase) => getSelectionCurrencyKey(purchase)),
        ...participation.currencyExchanges.flatMap((exchange) => {
          const record = normalizeCurrencyExchangeForEdit(exchange, '0');
          return [String(record.fromCurrency), String(record.toCurrency)];
        }),
      ]),
    ),
  );
  const cpBudgetEntry = findPrimaryCpBudget(effectiveBudgetState.effectiveBudgets, currencyDefinitions);
  const orderedOriginKeys = getOrderedOriginCategoryKeys(
    participation.origins,
    getOriginCategoryDefinitions(asRecord(participation.importSourceMetadata).originCategories),
    getKeyList(asRecord(participation.importSourceMetadata).originCategoryList),
  );
  const primaryCurrencyKey = cpBudgetEntry?.[0] ?? Object.keys(effectiveBudgetState.effectiveBudgets)[0] ?? '0';
  const budgetLedgerEntries = getBudgetLedgerEntries(
    effectiveBudgetState.effectiveBudgets,
    participation.purchases,
    participation.origins,
    orderedOriginKeys,
    participation.bankDeposit,
    participation.currencyExchanges,
    currencyDefinitions,
  );
  const primaryBudgetLedgerEntry =
    budgetLedgerEntries.find((entry) => entry.currencyKey === primaryCurrencyKey) ?? budgetLedgerEntries[0] ?? null;

  return {
    cpBudgetLabel: cpBudgetEntry ? formatCurrencyLabel(cpBudgetEntry[0], currencyDefinitions) : null,
    cpBudgetValue: primaryBudgetLedgerEntry?.remaining ?? cpBudgetEntry?.[1] ?? null,
    cpBaseValue: cpBudgetEntry ? effectiveBudgetState.baseBudgets[cpBudgetEntry[0]] ?? 0 : null,
    cpJumpDrawbackGrant: cpBudgetEntry ? effectiveBudgetState.participationDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null,
    cpChainDrawbackGrant: cpBudgetEntry ? effectiveBudgetState.chainDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null,
  };
}

export function ParticipationBudgetHeader(props: {
  jumper: WorkspaceJumper;
  participation: WorkspaceParticipation;
  workspace: Workspace;
}) {
  const summary = getParticipationBudgetSummaryData(props.workspace, props.participation);

  return (
    <section className="section-surface stack stack--compact">
      <div className="section-heading">
        <h4>Budget snapshot</h4>
        <span className="pill">{props.jumper.name}</span>
      </div>
      <ParticipationBudgetSummaryGrid
        cpBaseValue={summary.cpBaseValue}
        cpBudgetLabel={summary.cpBudgetLabel}
        cpBudgetValue={summary.cpBudgetValue}
        cpJumpDrawbackGrant={summary.cpJumpDrawbackGrant}
        cpChainDrawbackGrant={summary.cpChainDrawbackGrant}
      />
    </section>
  );
}

export function ParticipationBudgetShellAttachment(props: {
  jump: WorkspaceJump;
  jumper: WorkspaceJumper;
  participation: WorkspaceParticipation;
  workspace: Workspace;
}) {
  const summary = getParticipationBudgetSummaryData(props.workspace, props.participation);

  return (
    <section className="jump-shell-budget" aria-label="Active purchase budget">
      <div className="jump-shell-budget__identity">
        <div className="jump-shell-budget__identity-topline">
          <span className="pill">Purchases</span>
          <span className="pill pill--soft">{props.jumper.name}</span>
        </div>
        <strong>{props.jump.title}</strong>
        <span>Budget snapshot stays visible while you work through purchases.</span>
      </div>
      <div className="jump-shell-budget__metrics">
        <article className="jump-shell-budget__metric">
          <strong>{summary.cpBudgetValue !== null ? formatNumericValue(summary.cpBudgetValue) : 'No current CP'}</strong>
          <span>Current CP</span>
        </article>
        <article className="jump-shell-budget__metric">
          <strong>{summary.cpBaseValue !== null ? formatNumericValue(summary.cpBaseValue) : 'No base CP'}</strong>
          <span>{summary.cpBudgetLabel ? `${summary.cpBudgetLabel} start` : 'No primary CP'}</span>
        </article>
        <article className="jump-shell-budget__metric">
          <strong>
            {summary.cpJumpDrawbackGrant !== null && summary.cpJumpDrawbackGrant !== 0
              ? `${summary.cpJumpDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(summary.cpJumpDrawbackGrant)}`
              : '0'}
          </strong>
          <span>Jump gain</span>
        </article>
        <article className="jump-shell-budget__metric">
          <strong>
            {summary.cpChainDrawbackGrant !== null && summary.cpChainDrawbackGrant !== 0
              ? `${summary.cpChainDrawbackGrant > 0 ? '+' : ''}${formatNumericValue(summary.cpChainDrawbackGrant)}`
              : '0'}
          </strong>
          <span>Chain gain</span>
        </article>
      </div>
    </section>
  );
}

export function ParticipationBudgetInspector(props: {
  jumper: WorkspaceJumper;
  participation: WorkspaceParticipation;
  workspace: Workspace;
}) {
  const effectiveBudgetState = getEffectiveParticipationBudgetState(props.workspace, props.participation);
  const rawCurrencyDefinitions = getCurrencyDefinitions(asRecord(props.participation.importSourceMetadata).currencies);
  const stipendRows = flattenStipends(props.participation.stipends);
  const currencyDefinitions = ensureCurrencyDefinitions(
    rawCurrencyDefinitions,
    Array.from(
      new Set([
        ...Object.keys(rawCurrencyDefinitions),
        ...Object.keys(effectiveBudgetState.baseBudgets),
        ...Object.keys(props.participation.budgets),
        ...Object.keys(effectiveBudgetState.chainDrawbackBudgetGrants),
        ...Object.keys(effectiveBudgetState.participationDrawbackBudgetGrants),
        ...stipendRows.map((row) => row.currencyKey),
        ...props.participation.purchases.map((purchase) => getSelectionCurrencyKey(purchase)),
        ...props.participation.currencyExchanges.flatMap((exchange) => {
          const record = normalizeCurrencyExchangeForEdit(exchange, '0');
          return [String(record.fromCurrency), String(record.toCurrency)];
        }),
      ]),
    ),
  );
  const rawPurchaseSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(props.participation.importSourceMetadata).purchaseSubtypes);
  const purchaseSubtypeDefinitions = ensurePurchaseSubtypeDefinitions(
    rawPurchaseSubtypeDefinitions,
    Array.from(
      new Set([
        ...Object.keys(rawPurchaseSubtypeDefinitions),
        ...stipendRows.map((row) => row.subtypeKey),
        ...props.participation.purchases
          .map((purchase) => getSelectionSubtypeKey(purchase))
          .filter((value): value is string => Boolean(value)),
      ]),
    ),
  );
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
  const primaryCurrencyKey = cpBudgetEntry?.[0] ?? Object.keys(currencyDefinitions)[0] ?? '0';
  const cpBudgetLabel = cpBudgetEntry ? formatCurrencyLabel(cpBudgetEntry[0], currencyDefinitions) : null;
  const cpBudgetValue = cpBudgetEntry?.[1] ?? null;
  const cpBaseValue = cpBudgetEntry ? effectiveBudgetState.baseBudgets[cpBudgetEntry[0]] ?? 0 : null;
  const cpJumpDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.participationDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;
  const cpChainDrawbackGrant =
    cpBudgetEntry ? effectiveBudgetState.chainDrawbackBudgetGrants[cpBudgetEntry[0]] ?? 0 : null;
  const orderedOriginKeys = getOrderedOriginCategoryKeys(
    props.participation.origins,
    getOriginCategoryDefinitions(asRecord(props.participation.importSourceMetadata).originCategories),
    getKeyList(asRecord(props.participation.importSourceMetadata).originCategoryList),
  );
  const budgetLedgerEntries = getBudgetLedgerEntries(
    effectiveBudgetState.effectiveBudgets,
    props.participation.purchases,
    props.participation.origins,
    orderedOriginKeys,
    props.participation.bankDeposit,
    props.participation.currencyExchanges,
    currencyDefinitions,
  );
  const primaryBudgetLedgerEntry =
    budgetLedgerEntries.find((entry) => entry.currencyKey === primaryCurrencyKey) ?? budgetLedgerEntries[0] ?? null;

  return (
    <div className="stack stack--compact">
      {primaryBudgetLedgerEntry ? (
        <div className="summary-panel stack stack--compact">
          <h4>Current budget</h4>
          <p>
            <strong>{formatNumericValue(primaryBudgetLedgerEntry.remaining)}</strong>{' '}
            {formatCurrencyLabel(primaryBudgetLedgerEntry.currencyKey, currencyDefinitions)}
          </p>
          <p>
            {formatNumericValue(primaryBudgetLedgerEntry.starting)} start
            {primaryBudgetLedgerEntry.spent !== 0 ? ` | -${formatNumericValue(primaryBudgetLedgerEntry.spent)} spent` : ''}
            {primaryBudgetLedgerEntry.exchangedOut !== 0
              ? ` | -${formatNumericValue(primaryBudgetLedgerEntry.exchangedOut)} exchanged out`
              : ''}
            {primaryBudgetLedgerEntry.exchangedIn !== 0
              ? ` | +${formatNumericValue(primaryBudgetLedgerEntry.exchangedIn)} exchanged in`
              : ''}
          </p>
        </div>
      ) : null}

      <SummarySection
        title="Budget ledger"
        items={budgetLedgerEntries.map((entry) => ({
          label: `${formatCurrencyLabel(entry.currencyKey, currencyDefinitions)}: ${formatNumericValue(entry.remaining)} left`,
          detail: [
            `${formatNumericValue(entry.starting)} start`,
            entry.spent !== 0 ? `-${formatNumericValue(entry.spent)} spent` : null,
            entry.exchangedOut !== 0 ? `-${formatNumericValue(entry.exchangedOut)} exchanged out` : null,
            entry.exchangedIn !== 0 ? `+${formatNumericValue(entry.exchangedIn)} exchanged in` : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join(' - '),
        }))}
        emptyMessage="No budgets yet."
      />

      {effectiveBudgetState.contributingParticipationDrawbacks.length > 0 ? (
        <SummarySection
          title="Jump drawback gains"
          items={effectiveBudgetState.contributingParticipationDrawbacks.map((contribution) => ({
            label: contribution.title,
            detail: Object.entries(contribution.budgetGrants)
              .map(([currencyKey, amount]) => `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`)
              .join(' - '),
          }))}
          emptyMessage="No jump drawback gains."
        />
      ) : null}

      {stipendTokens.length > 0 ? <SummarySection title="Stipends" items={stipendTokens} emptyMessage="No stipends yet." /> : null}

      {exchangeTokens.length > 0 ? (
        <SummarySection title="Currency exchanges" items={exchangeTokens} emptyMessage="No currency exchanges yet." />
      ) : null}

      {effectiveBudgetState.contributingChainDrawbacks.length > 0 ? (
        <SummarySection
          title="Chain drawback gains"
          items={effectiveBudgetState.contributingChainDrawbacks.map((contribution) => ({
            label: contribution.effect.title,
            detail: Object.entries(contribution.budgetGrants)
              .map(([currencyKey, amount]) => `${amount > 0 ? '+' : ''}${formatNumericValue(amount)} ${formatCurrencyLabel(currencyKey, currencyDefinitions)}`)
              .join(' - '),
          }))}
          emptyMessage="No chain drawback gains."
        />
      ) : null}
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
