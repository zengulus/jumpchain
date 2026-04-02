import type { JsonMap } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import {
  altChainBuilderOptionCatalog,
  altChainBuilderOptionsById,
  getAltChainBuilderSelectionLimit,
  type AltChainBuilderOption,
} from './catalog';

export const ALT_CHAIN_BUILDER_METADATA_KEY = 'altChainBuilder';
export const ALT_CHAIN_BUILDER_EFFECT_SOURCE = 'alt-chain-builder';

export const altChainStartingPoints = ['chosen', 'stranded', 'cocksure'] as const;
export type AltChainStartingPoint = (typeof altChainStartingPoints)[number];

export const altChainExchangeRates = ['favored', 'survivor', 'masochist'] as const;
export type AltChainExchangeRate = (typeof altChainExchangeRates)[number];

export interface AltChainBuilderState {
  version: 2;
  enabled: boolean;
  startingPoint: AltChainStartingPoint;
  exchangeRate: AltChainExchangeRate;
  selectionCounts: Record<string, number>;
  notes: string;
  lastSyncedAt: string | null;
}

export interface AltChainStartingPointConfig {
  title: string;
  simpleSummary: string;
  description: string;
  baselineAccommodationCount: number;
  baselineComplicationCount: number;
  minimumRecordedComplicationsBeforeAccommodations?: number;
  reviewNote: string;
}

export interface AltChainExchangeRateConfig {
  title: string;
  ratioLabel: string;
  simpleSummary: string;
  description: string;
  complicationsRequired: number;
  accommodationsGranted: number;
}

export interface AltChainBuilderSummary {
  selectedAccommodationCount: number;
  selectedComplicationCount: number;
  selectedOptionCount: number;
  baselineAccommodationCount: number;
  baselineComplicationCount: number;
  recordedAccommodationCount: number;
  recordedComplicationCount: number;
  exchangeAccommodationCredit: number;
  availableExtraAccommodationCredit: number;
  extraAccommodationDelta: number;
  warnings: string[];
}

export interface AltChainBuilderSelectedOption {
  option: AltChainBuilderOption;
  count: number;
}

export interface AltChainBuilderGeneratedEffectSpec {
  optionId: string;
  count: number;
  title: string;
  description: string;
  category: Effect['category'];
  importSourceMetadata: JsonMap;
}

export const ALT_CHAIN_STARTING_POINT_CONFIGS: Record<AltChainStartingPoint, AltChainStartingPointConfig> = {
  chosen: {
    title: 'Chosen',
    simpleSummary: 'Start from the usual standard package, then record the extra swaps and standing picks that matter.',
    description: 'Begin from the standard package, then record the named Accommodations and Complications you actually want to carry forward.',
    baselineAccommodationCount: 22,
    baselineComplicationCount: 2,
    reviewNote: 'Chosen already assumes a 22 Accommodation / 2 Complication standard package baseline.',
  },
  stranded: {
    title: 'Stranded',
    simpleSummary: 'Start from zero and earn every extra comfort the hard way.',
    description: 'Start with no Complications or Accommodations and build the chain from scratch.',
    baselineAccommodationCount: 0,
    baselineComplicationCount: 0,
    reviewNote: 'Stranded starts blank: no baseline Accommodations and no baseline Complications.',
  },
  cocksure: {
    title: 'Cocksure',
    simpleSummary: 'Front-load pain first, then start buying relief once the chain has earned it.',
    description: 'Take at least eight Complications before you start adding Accommodations.',
    baselineAccommodationCount: 0,
    baselineComplicationCount: 0,
    minimumRecordedComplicationsBeforeAccommodations: 8,
    reviewNote: 'Cocksure requires at least eight recorded Complications before extra Accommodations should start landing.',
  },
};

export const ALT_CHAIN_EXCHANGE_RATE_CONFIGS: Record<AltChainExchangeRate, AltChainExchangeRateConfig> = {
  favored: {
    title: 'Favored',
    ratioLabel: '3 A / 2 C',
    simpleSummary: 'Two complications buy three accommodations.',
    description: 'Every two Complications fund three extra Accommodations.',
    complicationsRequired: 2,
    accommodationsGranted: 3,
  },
  survivor: {
    title: 'Survivor',
    ratioLabel: '1 A / 1 C',
    simpleSummary: 'Each complication is worth one accommodation.',
    description: 'Each Complication funds one extra Accommodation.',
    complicationsRequired: 1,
    accommodationsGranted: 1,
  },
  masochist: {
    title: 'Masochist',
    ratioLabel: '1 A / 2 C',
    simpleSummary: 'Every accommodation costs two complications.',
    description: 'Every two Complications fund one extra Accommodation.',
    complicationsRequired: 2,
    accommodationsGranted: 1,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAltChainStartingPoint(value: unknown): value is AltChainStartingPoint {
  return typeof value === 'string' && altChainStartingPoints.includes(value as AltChainStartingPoint);
}

function isAltChainExchangeRate(value: unknown): value is AltChainExchangeRate {
  return typeof value === 'string' && altChainExchangeRates.includes(value as AltChainExchangeRate);
}

function normalizeSelectionCount(value: unknown, maxSelections?: number) {
  const rawValue =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : 0;
  const normalizedValue = Math.max(0, Math.trunc(rawValue));

  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return 0;
  }

  if (typeof maxSelections === 'number' && Number.isFinite(maxSelections)) {
    return Math.min(maxSelections, normalizedValue);
  }

  return normalizedValue;
}

function readSelectionCounts(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([optionId, count]) => {
      const option = altChainBuilderOptionsById[optionId];

      if (!option) {
        return [];
      }

      const normalizedCount = normalizeSelectionCount(count, getAltChainBuilderSelectionLimit(option));

      return normalizedCount > 0 ? [[optionId, normalizedCount]] : [];
    }),
  ) as Record<string, number>;
}

function normalizeSelectionCounts(selectionCounts: Record<string, number>) {
  return readSelectionCounts(selectionCounts);
}

export function createDefaultAltChainBuilderState(): AltChainBuilderState {
  return {
    version: 2,
    enabled: false,
    startingPoint: 'chosen',
    exchangeRate: 'favored',
    selectionCounts: {},
    notes: '',
    lastSyncedAt: null,
  };
}

export function parseAltChainBuilderState(raw: unknown): AltChainBuilderState {
  const fallback = createDefaultAltChainBuilderState();
  const record = isRecord(raw) ? raw : {};

  return {
    version: 2,
    enabled: record.enabled === true,
    startingPoint: isAltChainStartingPoint(record.startingPoint) ? record.startingPoint : fallback.startingPoint,
    exchangeRate: isAltChainExchangeRate(record.exchangeRate) ? record.exchangeRate : fallback.exchangeRate,
    selectionCounts: normalizeSelectionCounts(readSelectionCounts(record.selectionCounts)),
    notes: typeof record.notes === 'string' ? record.notes : fallback.notes,
    lastSyncedAt: typeof record.lastSyncedAt === 'string' && record.lastSyncedAt.trim().length > 0 ? record.lastSyncedAt : null,
  };
}

export function updateAltChainBuilderMetadata(importSourceMetadata: JsonMap, nextState: AltChainBuilderState): JsonMap {
  return {
    ...importSourceMetadata,
    [ALT_CHAIN_BUILDER_METADATA_KEY]: {
      version: 2,
      enabled: nextState.enabled,
      startingPoint: nextState.startingPoint,
      exchangeRate: nextState.exchangeRate,
      selectionCounts: normalizeSelectionCounts(nextState.selectionCounts),
      notes: nextState.notes,
      lastSyncedAt: nextState.lastSyncedAt,
    },
  };
}

export function getAltChainBuilderSelectionCount(state: AltChainBuilderState, optionId: string) {
  return normalizeSelectionCount(state.selectionCounts[optionId], getAltChainBuilderSelectionLimit(altChainBuilderOptionsById[optionId]));
}

export function setAltChainBuilderSelectionCount(state: AltChainBuilderState, optionId: string, count: unknown): AltChainBuilderState {
  const option = altChainBuilderOptionsById[optionId];

  if (!option) {
    return state;
  }

  const normalizedCount = normalizeSelectionCount(count, getAltChainBuilderSelectionLimit(option));
  const nextSelectionCounts = { ...state.selectionCounts };

  if (normalizedCount <= 0) {
    delete nextSelectionCounts[optionId];
  } else {
    nextSelectionCounts[optionId] = normalizedCount;
  }

  return {
    ...state,
    selectionCounts: normalizeSelectionCounts(nextSelectionCounts),
  };
}

export function listAltChainBuilderSelectedOptions(
  state: AltChainBuilderState,
  kind?: AltChainBuilderOption['kind'],
) {
  return altChainBuilderOptionCatalog.flatMap<AltChainBuilderSelectedOption>((option) => {
    if (kind && option.kind !== kind) {
      return [];
    }

    const count = getAltChainBuilderSelectionCount(state, option.id);

    return count > 0 ? [{ option, count }] : [];
  });
}

export function buildAltChainBuilderSummary(state: AltChainBuilderState): AltChainBuilderSummary {
  const startingPoint = ALT_CHAIN_STARTING_POINT_CONFIGS[state.startingPoint];
  const exchangeRate = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[state.exchangeRate];
  const selectedAccommodations = listAltChainBuilderSelectedOptions(state, 'accommodation');
  const selectedComplications = listAltChainBuilderSelectedOptions(state, 'complication');
  const selectedAccommodationCount = selectedAccommodations.reduce((total, entry) => total + entry.count, 0);
  const selectedComplicationCount = selectedComplications.reduce((total, entry) => total + entry.count, 0);
  const selectedOptionCount = selectedAccommodations.length + selectedComplications.length;
  const exchangeAccommodationCredit =
    Math.floor(selectedComplicationCount / exchangeRate.complicationsRequired) * exchangeRate.accommodationsGranted;
  const cocksureGate = startingPoint.minimumRecordedComplicationsBeforeAccommodations ?? 0;
  const cocksureGateMet = selectedComplicationCount >= cocksureGate;
  const availableExtraAccommodationCredit =
    cocksureGate > 0 && !cocksureGateMet ? 0 : exchangeAccommodationCredit;
  const extraAccommodationDelta = availableExtraAccommodationCredit - selectedAccommodationCount;
  const warnings: string[] = [];

  if (!state.enabled) {
    warnings.push('Builder tracking is off. Turn it on before relying on the recorded counts.');
  }

  if (state.startingPoint === 'cocksure' && cocksureGate > 0 && selectedAccommodationCount > 0 && !cocksureGateMet) {
    warnings.push(`Cocksure wants at least ${cocksureGate} recorded Complications before extra Accommodations start landing.`);
  }

  if (selectedAccommodationCount > availableExtraAccommodationCredit) {
    warnings.push('Recorded Accommodations currently outpace the extra Complication credit paying for them.');
  }

  if (state.startingPoint === 'chosen') {
    warnings.push('Chosen baseline picks are tracked as builder metadata only. Only the named options recorded below will post into chainwide effects.');
  }

  return {
    selectedAccommodationCount,
    selectedComplicationCount,
    selectedOptionCount,
    baselineAccommodationCount: startingPoint.baselineAccommodationCount,
    baselineComplicationCount: startingPoint.baselineComplicationCount,
    recordedAccommodationCount: startingPoint.baselineAccommodationCount + selectedAccommodationCount,
    recordedComplicationCount: startingPoint.baselineComplicationCount + selectedComplicationCount,
    exchangeAccommodationCredit,
    availableExtraAccommodationCredit,
    extraAccommodationDelta,
    warnings,
  };
}

export function markAltChainBuilderSynced(state: AltChainBuilderState, syncedAt = new Date().toISOString()): AltChainBuilderState {
  return {
    ...state,
    lastSyncedAt: syncedAt,
  };
}

export function formatAltChainBuilderSelection(state: AltChainBuilderState) {
  if (!state.enabled) {
    return 'Not tracked';
  }

  return `${ALT_CHAIN_STARTING_POINT_CONFIGS[state.startingPoint].title} + ${ALT_CHAIN_EXCHANGE_RATE_CONFIGS[state.exchangeRate].title}`;
}

export function describeAltChainBuilderSelection(state: AltChainBuilderState, simpleMode: boolean) {
  if (!state.enabled) {
    return 'Turn this on when the branch uses the Alt-Chain builder as an actual worksheet instead of just manual chainwide effects.';
  }

  const startingPoint = ALT_CHAIN_STARTING_POINT_CONFIGS[state.startingPoint];
  const exchangeRate = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[state.exchangeRate];

  return simpleMode
    ? `${startingPoint.simpleSummary} ${exchangeRate.simpleSummary}`
    : `${startingPoint.description} ${exchangeRate.description}`;
}

export function hasAltChainBuilderBeenUsed(state: AltChainBuilderState) {
  return (
    state.enabled ||
    state.notes.trim().length > 0 ||
    Object.keys(normalizeSelectionCounts(state.selectionCounts)).length > 0 ||
    state.lastSyncedAt !== null
  );
}

export function buildAltChainBuilderGeneratedEffectSpecs(state: AltChainBuilderState): AltChainBuilderGeneratedEffectSpec[] {
  return altChainBuilderOptionCatalog.flatMap((option) => {
    const count = getAltChainBuilderSelectionCount(state, option.id);

    if (count <= 0) {
      return [];
    }

    const countSuffix = count > 1 ? ` x${count}` : '';
    const category = option.kind === 'complication' ? 'drawback' : 'rule';
    const descriptionParts = [
      `Generated from the Alt-Chain builder for ${option.group}.`,
      option.description,
      option.note ? `Builder note: ${option.note}` : null,
      count > 1 ? `Recorded ${count} times in the builder.` : null,
    ].filter((part): part is string => Boolean(part));

    return [
      {
        optionId: option.id,
        count,
        title: `${option.title}${countSuffix}`,
        description: descriptionParts.join(' '),
        category,
        importSourceMetadata: {
          altChainBuilderGenerated: true,
          altChainBuilderSource: ALT_CHAIN_BUILDER_EFFECT_SOURCE,
          altChainBuilderOptionId: option.id,
          altChainBuilderOptionKind: option.kind,
          altChainBuilderOptionGroup: option.group,
          altChainBuilderSelectionCount: count,
        },
      },
    ];
  });
}

export function isAltChainBuilderGeneratedEffect(effect: Pick<Effect, 'importSourceMetadata'>) {
  return isRecord(effect.importSourceMetadata) && effect.importSourceMetadata.altChainBuilderGenerated === true;
}

export function getAltChainBuilderGeneratedEffectOptionId(effect: Pick<Effect, 'importSourceMetadata'>) {
  if (!isAltChainBuilderGeneratedEffect(effect)) {
    return null;
  }

  const value = effect.importSourceMetadata.altChainBuilderOptionId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
