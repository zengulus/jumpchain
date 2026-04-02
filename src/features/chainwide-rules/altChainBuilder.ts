import type { JsonMap } from '../../domain/common';

export const altChainStartingPoints = ['chosen', 'stranded', 'cocksure'] as const;
export type AltChainStartingPoint = (typeof altChainStartingPoints)[number];

export const altChainExchangeRates = ['favored', 'survivor', 'masochist'] as const;
export type AltChainExchangeRate = (typeof altChainExchangeRates)[number];

export interface AltChainBuilderState {
  enabled: boolean;
  startingPoint: AltChainStartingPoint;
  exchangeRate: AltChainExchangeRate;
  notes: string;
}

export interface AltChainStartingPointConfig {
  title: string;
  simpleSummary: string;
  description: string;
}

export interface AltChainExchangeRateConfig {
  title: string;
  ratioLabel: string;
  simpleSummary: string;
  description: string;
}

export const ALT_CHAIN_STARTING_POINT_CONFIGS: Record<AltChainStartingPoint, AltChainStartingPointConfig> = {
  chosen: {
    title: 'Chosen',
    simpleSummary: 'Start from the builder standard package, then swap outward as needed.',
    description: 'Before swapping or taking more, grab the builder blue and red standard-chain options.',
  },
  stranded: {
    title: 'Stranded',
    simpleSummary: 'Start with no extra support and build up only if you earn it.',
    description: 'Start with no Complications or Accommodations.',
  },
  cocksure: {
    title: 'Cocksure',
    simpleSummary: 'Lock in a harsh complication load first, then buy relief after that.',
    description: 'Take at least eight Complications without Accommodations.',
  },
};

export const ALT_CHAIN_EXCHANGE_RATE_CONFIGS: Record<AltChainExchangeRate, AltChainExchangeRateConfig> = {
  favored: {
    title: 'Favored',
    ratioLabel: '3 A / 2 C',
    simpleSummary: 'Two complications buy three accommodations.',
    description: 'Gain three Accommodations for every two Complications you choose.',
  },
  survivor: {
    title: 'Survivor',
    ratioLabel: '1 A / 1 C',
    simpleSummary: 'Each complication is worth one accommodation.',
    description: 'Each Complication is worth a single Accommodation.',
  },
  masochist: {
    title: 'Masochist',
    ratioLabel: '1 A / 2 C',
    simpleSummary: 'Each accommodation costs two complications.',
    description: 'Any Accommodation will cost two Complications.',
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

export function createDefaultAltChainBuilderState(): AltChainBuilderState {
  return {
    enabled: false,
    startingPoint: 'chosen',
    exchangeRate: 'favored',
    notes: '',
  };
}

export function parseAltChainBuilderState(raw: unknown): AltChainBuilderState {
  const fallback = createDefaultAltChainBuilderState();
  const record = isRecord(raw) ? raw : {};

  return {
    enabled: record.enabled === true,
    startingPoint: isAltChainStartingPoint(record.startingPoint) ? record.startingPoint : fallback.startingPoint,
    exchangeRate: isAltChainExchangeRate(record.exchangeRate) ? record.exchangeRate : fallback.exchangeRate,
    notes: typeof record.notes === 'string' ? record.notes : fallback.notes,
  };
}

export function updateAltChainBuilderMetadata(importSourceMetadata: JsonMap, nextState: AltChainBuilderState): JsonMap {
  return {
    ...importSourceMetadata,
    altChainBuilder: {
      enabled: nextState.enabled,
      startingPoint: nextState.startingPoint,
      exchangeRate: nextState.exchangeRate,
      notes: nextState.notes,
    },
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
    return 'Turn this on when the branch uses the Alt-Chain builder as its standing chainwide scaffold.';
  }

  const startingPoint = ALT_CHAIN_STARTING_POINT_CONFIGS[state.startingPoint];
  const exchangeRate = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[state.exchangeRate];

  return simpleMode
    ? `${startingPoint.simpleSummary} ${exchangeRate.simpleSummary}`
    : `${startingPoint.description} ${exchangeRate.description}`;
}

export function hasAltChainBuilderBeenUsed(state: AltChainBuilderState) {
  return state.enabled || state.notes.trim().length > 0;
}
