import type { Chain } from '../../domain/chain/types';
import type { JsonMap } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { threeBoonsCatalog, threeBoonsOptionsById, threeBoonsOptionsByNumber, type ThreeBoonsOption } from './catalog';

export const THREE_BOONS_METADATA_KEY = 'threeBoons';
export const THREE_BOONS_EFFECT_SOURCE = 'three-boons';
const THREE_BOONS_CHOOSE_LIMIT = 3;
const THREE_BOONS_BASE_ROLL_COUNT = 4;

export type ThreeBoonsMode = 'choose' | 'roll';
export type ThreeBoonsSelectionCounts = Record<string, number>;

export interface ThreeBoonsAcceptedRoll {
  step: number;
  number: number;
  boonId: string;
  extraRollsGranted: number;
  totalOwnedAfterRoll: number;
}

export interface ThreeBoonsRollResult {
  version: 1;
  acceptedRolls: ThreeBoonsAcceptedRoll[];
  selectionCounts: ThreeBoonsSelectionCounts;
  rerollCount: number;
  rolledAt: string | null;
}

export interface ThreeBoonsState {
  version: 1;
  mode: ThreeBoonsMode;
  manualSelectionCounts: ThreeBoonsSelectionCounts;
  rollResult: ThreeBoonsRollResult | null;
  notes: string;
}

export interface ThreeBoonsSummaryEntry {
  option: ThreeBoonsOption;
  count: number;
}

export interface ThreeBoonsSummary {
  activeSelectionCounts: ThreeBoonsSelectionCounts;
  activeSelections: ThreeBoonsSummaryEntry[];
  manualSelections: ThreeBoonsSummaryEntry[];
  rollSelections: ThreeBoonsSummaryEntry[];
  manualSelectionTotal: number;
  rollSelectionTotal: number;
  activeSelectionTotal: number;
  extraRollCount: number;
  warnings: string[];
}

export interface ThreeBoonsGeneratedEffectSpec {
  boonId: string;
  count: number;
  title: string;
  description: string;
  category: Effect['category'];
  importSourceMetadata: JsonMap;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function readFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
}

function clampWholeNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function getSelectionLimit(option: ThreeBoonsOption, allowRollOnly: boolean) {
  if (!allowRollOnly && option.rollOnly) {
    return 0;
  }

  return typeof option.maxSelections === 'number' ? option.maxSelections : undefined;
}

function normalizeSelectionCounts(value: unknown, allowRollOnly: boolean): ThreeBoonsSelectionCounts {
  const record = asRecord(value);

  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([boonId, rawCount]) => {
      const option = threeBoonsOptionsById[boonId];

      if (!option) {
        return [];
      }

      const selectionLimit = getSelectionLimit(option, allowRollOnly);
      const normalizedCount = clampWholeNumber(readFiniteNumber(rawCount));

      if (selectionLimit === 0 || normalizedCount <= 0) {
        return [];
      }

      return [[boonId, typeof selectionLimit === 'number' ? Math.min(normalizedCount, selectionLimit) : normalizedCount]];
    }),
  );
}

function countSelections(selectionCounts: ThreeBoonsSelectionCounts) {
  return Object.values(selectionCounts).reduce((total, count) => total + count, 0);
}

function buildSelectionEntries(selectionCounts: ThreeBoonsSelectionCounts) {
  return threeBoonsCatalog.flatMap((option) => {
    const count = selectionCounts[option.id] ?? 0;

    if (count <= 0) {
      return [];
    }

    return [
      {
        option,
        count,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAcceptedRolls(value: unknown, rollSelectionCounts: ThreeBoonsSelectionCounts): ThreeBoonsAcceptedRoll[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const remainingCounts = { ...rollSelectionCounts };

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);

    if (!record) {
      return [];
    }

    const explicitId = readString(record.boonId).trim();
    const explicitNumber = clampWholeNumber(readFiniteNumber(record.number));
    const option =
      (explicitId.length > 0 ? threeBoonsOptionsById[explicitId] : undefined)
      ?? (explicitNumber > 0 ? threeBoonsOptionsByNumber[explicitNumber] : undefined);

    if (!option) {
      return [];
    }

    const currentRemaining = remainingCounts[option.id] ?? 0;

    if (currentRemaining <= 0) {
      return [];
    }

    const step = clampWholeNumber(readFiniteNumber(record.step, index + 1)) || index + 1;
    const totalOwnedAfterRoll = clampWholeNumber(readFiniteNumber(record.totalOwnedAfterRoll, 1));
    remainingCounts[option.id] = currentRemaining - 1;

    return [
      {
        step,
        number: option.number,
        boonId: option.id,
        extraRollsGranted: clampWholeNumber(readFiniteNumber(record.extraRollsGranted, option.extraRolls ?? 0)),
        totalOwnedAfterRoll,
      },
    ];
  });
}

function normalizeRollResult(value: unknown): ThreeBoonsRollResult | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const selectionCounts = normalizeSelectionCounts(record.selectionCounts, true);
  const acceptedRolls = normalizeAcceptedRolls(record.acceptedRolls, selectionCounts);

  if (countSelections(selectionCounts) <= 0 && acceptedRolls.length <= 0) {
    return null;
  }

  return {
    version: 1,
    selectionCounts,
    acceptedRolls,
    rerollCount: clampWholeNumber(readFiniteNumber(record.rerollCount)),
    rolledAt: readString(record.rolledAt).trim() || null,
  };
}

export function createDefaultThreeBoonsState(): ThreeBoonsState {
  return {
    version: 1,
    mode: 'choose',
    manualSelectionCounts: {},
    rollResult: null,
    notes: '',
  };
}

export function readThreeBoonsState(chain: Pick<Chain, 'importSourceMetadata'>): ThreeBoonsState {
  const root = asRecord(chain.importSourceMetadata);
  const metadata = root ? asRecord(root[THREE_BOONS_METADATA_KEY]) : null;

  if (!metadata) {
    return createDefaultThreeBoonsState();
  }

  const mode = metadata.mode === 'roll' ? 'roll' : 'choose';

  return {
    version: 1,
    mode,
    manualSelectionCounts: normalizeSelectionCounts(metadata.manualSelectionCounts, false),
    rollResult: normalizeRollResult(metadata.rollResult),
    notes: readString(metadata.notes),
  };
}

export function writeThreeBoonsState(chain: Chain, state: ThreeBoonsState): Chain {
  const normalizedState: ThreeBoonsState = {
    version: 1,
    mode: state.mode === 'roll' ? 'roll' : 'choose',
    manualSelectionCounts: normalizeSelectionCounts(state.manualSelectionCounts, false),
    rollResult: normalizeRollResult(state.rollResult),
    notes: state.notes,
  };
  const importSourceMetadata = {
    ...chain.importSourceMetadata,
    [THREE_BOONS_METADATA_KEY]: normalizedState,
  } as JsonMap;

  return {
    ...chain,
    importSourceMetadata,
  };
}

export function getThreeBoonsSelectionCount(selectionCounts: ThreeBoonsSelectionCounts, boonId: string) {
  return selectionCounts[boonId] ?? 0;
}

export function setThreeBoonsManualSelectionCount(
  state: ThreeBoonsState,
  boonId: string,
  requestedCount: number,
): ThreeBoonsState {
  const option = threeBoonsOptionsById[boonId];

  if (!option || option.rollOnly) {
    return {
      ...state,
      manualSelectionCounts: normalizeSelectionCounts(state.manualSelectionCounts, false),
    };
  }

  const currentCounts = normalizeSelectionCounts(state.manualSelectionCounts, false);
  const otherSelectedCount = countSelections(currentCounts) - (currentCounts[boonId] ?? 0);
  const manualSlotsRemaining = Math.max(0, THREE_BOONS_CHOOSE_LIMIT - otherSelectedCount);
  const selectionLimit = typeof option.maxSelections === 'number' ? option.maxSelections : manualSlotsRemaining;
  const normalizedCount = Math.max(0, Math.min(clampWholeNumber(requestedCount), selectionLimit, manualSlotsRemaining));
  const nextCounts = { ...currentCounts };

  if (normalizedCount <= 0) {
    delete nextCounts[boonId];
  } else {
    nextCounts[boonId] = normalizedCount;
  }

  return {
    ...state,
    manualSelectionCounts: nextCounts,
  };
}

export function clearThreeBoonsRollResult(state: ThreeBoonsState): ThreeBoonsState {
  return {
    ...state,
    rollResult: null,
  };
}

function rollFromRandom(randomValue: number) {
  const normalizedValue = Math.max(0, Math.min(0.999999999999, randomValue));
  return Math.floor(normalizedValue * threeBoonsCatalog.length) + 1;
}

export function rollThreeBoonsBoonSet(random: () => number = Math.random, rolledAt = new Date().toISOString()): ThreeBoonsRollResult {
  const acceptedRolls: ThreeBoonsAcceptedRoll[] = [];
  const selectionCounts: ThreeBoonsSelectionCounts = {};
  let rerollCount = 0;
  let pendingRolls = THREE_BOONS_BASE_ROLL_COUNT;
  let safetyCounter = 0;

  while (pendingRolls > 0) {
    safetyCounter += 1;

    if (safetyCounter > 5000) {
      throw new Error('Unable to finish boon rolling without exceeding the safety limit.');
    }

    const rolledNumber = rollFromRandom(random());
    const option = threeBoonsOptionsByNumber[rolledNumber];

    if (!option) {
      rerollCount += 1;
      continue;
    }

    const currentCount = selectionCounts[option.id] ?? 0;
    const selectionLimit = typeof option.maxSelections === 'number' ? option.maxSelections : undefined;

    if (typeof selectionLimit === 'number' && currentCount >= selectionLimit) {
      rerollCount += 1;
      continue;
    }

    const nextCount = currentCount + 1;
    const extraRollsGranted = option.extraRolls ?? 0;

    selectionCounts[option.id] = nextCount;
    acceptedRolls.push({
      step: acceptedRolls.length + 1,
      number: option.number,
      boonId: option.id,
      extraRollsGranted,
      totalOwnedAfterRoll: nextCount,
    });
    pendingRolls -= 1;
    pendingRolls += extraRollsGranted;
  }

  return {
    version: 1,
    acceptedRolls,
    selectionCounts,
    rerollCount,
    rolledAt,
  };
}

export function applyThreeBoonsRoll(state: ThreeBoonsState, rollResult: ThreeBoonsRollResult): ThreeBoonsState {
  return {
    ...state,
    mode: 'roll',
    rollResult: normalizeRollResult(rollResult),
  };
}

export function buildThreeBoonsSummary(state: ThreeBoonsState): ThreeBoonsSummary {
  const manualSelectionCounts = normalizeSelectionCounts(state.manualSelectionCounts, false);
  const rollSelectionCounts = state.rollResult ? normalizeSelectionCounts(state.rollResult.selectionCounts, true) : {};
  const activeSelectionCounts = state.mode === 'roll' ? rollSelectionCounts : manualSelectionCounts;
  const manualSelectionTotal = countSelections(manualSelectionCounts);
  const rollSelectionTotal = countSelections(rollSelectionCounts);
  const warnings: string[] = [];

  if (state.mode === 'choose' && manualSelectionTotal < THREE_BOONS_CHOOSE_LIMIT) {
    warnings.push(`Choose mode has ${manualSelectionTotal} of ${THREE_BOONS_CHOOSE_LIMIT} boons selected.`);
  }

  if (state.mode === 'roll' && rollSelectionTotal <= 0) {
    warnings.push(`Roll mode is active, but no resolved ${THREE_BOONS_BASE_ROLL_COUNT}d${threeBoonsCatalog.length} result has been recorded yet.`);
  }

  const extraRollCount = state.rollResult
    ? state.rollResult.acceptedRolls.reduce((total, entry) => total + entry.extraRollsGranted, 0)
    : 0;

  return {
    activeSelectionCounts,
    activeSelections: buildSelectionEntries(activeSelectionCounts),
    manualSelections: buildSelectionEntries(manualSelectionCounts),
    rollSelections: buildSelectionEntries(rollSelectionCounts),
    manualSelectionTotal,
    rollSelectionTotal,
    activeSelectionTotal: countSelections(activeSelectionCounts),
    extraRollCount,
    warnings,
  };
}

export function hasThreeBoonsStarted(state: ThreeBoonsState) {
  return (
    countSelections(normalizeSelectionCounts(state.manualSelectionCounts, false)) > 0
    || countSelections(state.rollResult ? normalizeSelectionCounts(state.rollResult.selectionCounts, true) : {}) > 0
    || state.notes.trim().length > 0
  );
}

export function isThreeBoonsGeneratedEffect(effect: Pick<Effect, 'importSourceMetadata'>) {
  return isRecord(effect.importSourceMetadata) && effect.importSourceMetadata.threeBoonsGenerated === true;
}

export function getThreeBoonsGeneratedEffectBoonId(effect: Pick<Effect, 'importSourceMetadata'>) {
  if (!isThreeBoonsGeneratedEffect(effect)) {
    return null;
  }

  const value = effect.importSourceMetadata.threeBoonsBoonId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function buildThreeBoonsGeneratedEffectSpecs(state: ThreeBoonsState): ThreeBoonsGeneratedEffectSpec[] {
  const summary = buildThreeBoonsSummary(state);

  return summary.activeSelections.map(({ option, count }) => {
    const countSuffix = count > 1 ? ` x${count}` : '';
    const descriptionParts = [
      `Generated from the Three Boons page while ${state.mode === 'roll' ? 'roll mode' : 'choose mode'} was active.`,
      option.description,
      option.note ? `Source note: ${option.note}` : null,
      count > 1 ? `Recorded ${count} copies of this boon.` : null,
    ].filter((part): part is string => Boolean(part));

    return {
      boonId: option.id,
      count,
      title: `${option.title}${countSuffix}`,
      description: descriptionParts.join(' '),
      category: 'rule',
      importSourceMetadata: {
        threeBoonsGenerated: true,
        threeBoonsSource: THREE_BOONS_EFFECT_SOURCE,
        threeBoonsBoonId: option.id,
        threeBoonsBoonNumber: option.number,
        threeBoonsMode: state.mode,
        threeBoonsSelectionCount: count,
        trackedSupplementId: THREE_BOONS_EFFECT_SOURCE,
      },
    };
  });
}

export function getThreeBoonsChooseLimit() {
  return THREE_BOONS_CHOOSE_LIMIT;
}

export function getThreeBoonsBaseRollCount() {
  return THREE_BOONS_BASE_ROLL_COUNT;
}
