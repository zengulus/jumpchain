import type { JsonMap } from '../common';

export type SelectionKind =
  | 'purchase'
  | 'drawback'
  | 'retained-drawback'
  | 'scenario'
  | 'companion-import';

export type PurchaseSection = 'perk' | 'subsystem' | 'item' | 'other';

export type CostModifier = 'full' | 'discounted' | 'double-discounted' | 'free' | 'custom';

export interface SelectionCost {
  amount: number;
  currencyKey: string;
}

export interface SelectionPrerequisite {
  type: 'origin' | 'purchase' | 'drawback' | 'scenario';
  id?: string | number | null;
  title?: string;
  positive?: boolean;
  importSourceMetadata?: JsonMap;
}

export interface AlternativeCost {
  costs: SelectionCost[];
  prerequisites: SelectionPrerequisite[];
  mandatory: boolean;
  label?: string;
}

export interface ScenarioReward {
  type: 'currency' | 'perk' | 'item' | 'stipend' | 'note';
  title?: string;
  amount?: number;
  currencyKey?: string;
  subtypeKey?: string;
  note?: string;
  sourceSelectionId?: string | number | null;
}

export interface ComboBoost {
  boosterTitle: string;
  description: string;
  sourceSelectionId?: string | number | null;
}

export interface ParticipationSelection {
  id?: string;
  selectionKind: SelectionKind;
  title: string;
  summary?: string;
  description: string;
  value: number;
  currencyKey: string;
  purchaseValue: number;
  costModifier: CostModifier;
  purchaseSection?: PurchaseSection;
  subtypeKey?: string | null;
  purchaseType?: number | null;
  tags: string[];
  free: boolean;
  discountSource?: string;
  choiceContext?: string;
  alternativeCosts?: AlternativeCost[];
  prerequisites?: SelectionPrerequisite[];
  scenarioRewards?: ScenarioReward[];
  comboBoosts?: ComboBoost[];
  sourcePurchaseId?: string | number | null;
  sourceJumpDocId?: string | null;
  sourceTemplateId?: string | number | null;
  importSourceMetadata: JsonMap;
}

export interface CurrencyExchangeRecord {
  fromCurrencyKey: string;
  toCurrencyKey: string;
  fromAmount: number;
  toAmount: number;
  notes: string;
  importSourceMetadata: JsonMap;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getOptionalString(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getTags(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : [];
}

export function normalizeCostModifier(value: unknown): CostModifier {
  if (value === 'full' || value === 'discounted' || value === 'double-discounted' || value === 'free' || value === 'custom') {
    return value;
  }

  const numeric = getOptionalNumber(value);
  if (numeric === 1) {
    return 'discounted';
  }
  if (numeric === 2) {
    return 'double-discounted';
  }

  return 'full';
}

export function getCostModifierFactor(modifier: CostModifier) {
  switch (modifier) {
    case 'discounted':
      return 0.5;
    case 'double-discounted':
      return 0.25;
    case 'free':
      return 0;
    case 'custom':
    case 'full':
    default:
      return 1;
  }
}

export function normalizeParticipationSelection(value: unknown, fallbackKind: SelectionKind): ParticipationSelection {
  const record = asRecord(value);
  const sourcePurchaseId = record.sourcePurchaseId ?? record.sourceDrawbackId ?? record.sourceId;
  const title =
    getOptionalString(record.title) ??
    getOptionalString(record.name) ??
    getOptionalString(record.summary) ??
    getOptionalString(value) ??
    (sourcePurchaseId !== undefined ? `${fallbackKind} ${String(sourcePurchaseId)}` : 'Untitled selection');
  const rawValue = getOptionalNumber(record.value) ?? 0;
  const free = record.free === true;
  const costModifier = free ? 'free' : normalizeCostModifier(record.costModifier);
  const computedPurchaseValue = Number((rawValue * getCostModifierFactor(costModifier)).toFixed(2));
  const purchaseValue = getOptionalNumber(record.purchaseValue) ?? computedPurchaseValue;
  const selectionKind =
    record.selectionKind === 'purchase' ||
    record.selectionKind === 'drawback' ||
    record.selectionKind === 'retained-drawback' ||
    record.selectionKind === 'scenario' ||
    record.selectionKind === 'companion-import'
      ? record.selectionKind
      : fallbackKind;
  const importSourceMetadata = asRecord(record.importSourceMetadata);

  return {
    id: getOptionalString(record.id) ?? undefined,
    selectionKind,
    title,
    summary: getOptionalString(record.summary) ?? title,
    description: typeof record.description === 'string' ? record.description : '',
    value: rawValue,
    currencyKey: getOptionalString(record.currencyKey) ?? getOptionalString(record.currency) ?? '0',
    purchaseValue: free ? 0 : purchaseValue,
    costModifier,
    purchaseSection:
      record.purchaseSection === 'perk' ||
      record.purchaseSection === 'subsystem' ||
      record.purchaseSection === 'item' ||
      record.purchaseSection === 'other'
        ? record.purchaseSection
        : undefined,
    subtypeKey: getOptionalString(record.subtypeKey) ?? getOptionalString(record.subtype),
    purchaseType: getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type),
    tags: getTags(record.tags),
    free,
    discountSource: getOptionalString(record.discountSource) ?? undefined,
    choiceContext: typeof record.choiceContext === 'string' ? record.choiceContext : undefined,
    alternativeCosts: Array.isArray(record.alternativeCosts) ? (record.alternativeCosts as AlternativeCost[]) : undefined,
    prerequisites: Array.isArray(record.prerequisites) ? (record.prerequisites as SelectionPrerequisite[]) : undefined,
    scenarioRewards: Array.isArray(record.scenarioRewards) ? (record.scenarioRewards as ScenarioReward[]) : undefined,
    comboBoosts: Array.isArray(record.comboBoosts) ? (record.comboBoosts as ComboBoost[]) : undefined,
    sourcePurchaseId: getOptionalString(sourcePurchaseId) ?? null,
    sourceJumpDocId: getOptionalString(record.sourceJumpDocId) ?? null,
    sourceTemplateId: getOptionalString(record.sourceTemplateId) ?? null,
    importSourceMetadata: {
      ...importSourceMetadata,
      rawFragment: importSourceMetadata.rawFragment ?? value,
    },
  };
}

export function normalizeCurrencyExchange(value: unknown, fallbackCurrencyKey = '0'): CurrencyExchangeRecord {
  const record = asRecord(value);

  return {
    fromCurrencyKey:
      getOptionalString(record.fromCurrencyKey) ??
      getOptionalString(record.fromCurrency) ??
      getOptionalString(record.sourceCurrencyKey) ??
      getOptionalString(record.sourceCurrency) ??
      getOptionalString(record.currency) ??
      fallbackCurrencyKey,
    toCurrencyKey:
      getOptionalString(record.toCurrencyKey) ??
      getOptionalString(record.toCurrency) ??
      getOptionalString(record.targetCurrencyKey) ??
      getOptionalString(record.targetCurrency) ??
      fallbackCurrencyKey,
    fromAmount:
      getOptionalNumber(record.fromAmount) ??
      getOptionalNumber(record.sourceAmount) ??
      getOptionalNumber(record.spent) ??
      getOptionalNumber(record.amount) ??
      getOptionalNumber(record.value) ??
      0,
    toAmount:
      getOptionalNumber(record.toAmount) ??
      getOptionalNumber(record.targetAmount) ??
      getOptionalNumber(record.receivedAmount) ??
      getOptionalNumber(record.convertedAmount) ??
      getOptionalNumber(record.received) ??
      0,
    notes: getOptionalString(record.notes) ?? getOptionalString(record.summary) ?? getOptionalString(record.description) ?? '',
    importSourceMetadata: {
      ...asRecord(record.importSourceMetadata),
      rawFragment: asRecord(record.importSourceMetadata).rawFragment ?? value,
    },
  };
}

export function normalizeParticipationSelections<TKind extends SelectionKind>(values: unknown[], fallbackKind: TKind) {
  return values.map((value) => normalizeParticipationSelection(value, fallbackKind));
}
