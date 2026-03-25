import type { Chain } from '../../domain/chain/types';
import type { JsonMap } from '../../domain/common';
import {
  personalRealityCoreModes,
  personalRealityOptionCatalog,
  personalRealityOptionsById,
  type PersonalRealityCoreModeId,
  type PersonalRealityExtraModeId,
  type PersonalRealityOption,
} from './catalog';

export const PERSONAL_REALITY_METADATA_KEY = 'personalReality';

export type PersonalRealityLimitationStatus = 'active' | 'resolved-by-time' | 'paid-off-wp' | 'paid-off-cp';

export interface PersonalRealityBudgetSettings {
  completedJumpCountOverride: number | null;
  patientJumperDelayedJumps: number;
  swapOutExperiencedJumps: number;
  crossroadsTriggeredJumps: number;
  generalCpToWpPurchases: number;
  unlimitedTransferredWp: number;
  udsWarehouseWp: number;
  manualWpAdjustment: number;
  manualWpAdjustmentReason: string;
}

export interface PersonalRealitySelectionState {
  units: number;
  cpUnits: number;
  variantId: string;
  limitationStatus: PersonalRealityLimitationStatus;
}

export interface PersonalRealityState {
  version: 1;
  coreModeId: PersonalRealityCoreModeId | '';
  extraModeIds: PersonalRealityExtraModeId[];
  discountedGroupIds: string[];
  budget: PersonalRealityBudgetSettings;
  selections: Record<string, PersonalRealitySelectionState>;
  pageNotes: Record<string, string>;
  notes: string;
}

export interface PersonalRealitySelectionSummary {
  option: PersonalRealityOption;
  selection: PersonalRealitySelectionState;
  selected: boolean;
  wpSpent: number;
  cpSpent: number;
  wpGain: number;
  missingRequirementIds: string[];
  activeLimitation: boolean;
}

export interface PersonalRealityPlanSummary {
  completedJumpCount: number;
  availableWp: number;
  wpSpent: number;
  remainingWp: number;
  cpSpent: number;
  collectiveWp: number;
  therehouseCpPerCompletedJump: number;
  therehouseEarnedCp: number;
  selectedOptionCount: number;
  activeLimitationCount: number;
  pageSelectionCounts: Record<number, number>;
  warnings: string[];
  selectionSummaries: Record<string, PersonalRealitySelectionSummary>;
}

const coreModeIds = new Set(personalRealityCoreModes.map((entry) => entry.id));
const extraModeIds = new Set<PersonalRealityExtraModeId>(['patient-jumper', 'swap-out', 'cross-roads']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function readSignedNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function readSelection(value: unknown): PersonalRealitySelectionState {
  const record = asRecord(value);

  if (!record) {
    return createDefaultSelectionState();
  }

  const limitationStatusValue = readString(record.limitationStatus, 'active');
  const limitationStatus: PersonalRealityLimitationStatus =
    limitationStatusValue === 'resolved-by-time' ||
    limitationStatusValue === 'paid-off-wp' ||
    limitationStatusValue === 'paid-off-cp'
      ? limitationStatusValue
      : 'active';

  return {
    units: readInteger(record.units, 0),
    cpUnits: readInteger(record.cpUnits, 0),
    variantId: readString(record.variantId, ''),
    limitationStatus,
  };
}

export function createDefaultSelectionState(): PersonalRealitySelectionState {
  return {
    units: 0,
    cpUnits: 0,
    variantId: '',
    limitationStatus: 'active',
  };
}

function createSelectionStateForOption(option: PersonalRealityOption): PersonalRealitySelectionState {
  if (option.defaultSelected) {
    return {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };
  }

  return createDefaultSelectionState();
}

export function createDefaultPersonalRealityState(): PersonalRealityState {
  return {
    version: 1,
    coreModeId: '',
    extraModeIds: [],
    discountedGroupIds: [],
    budget: {
      completedJumpCountOverride: null,
      patientJumperDelayedJumps: 0,
      swapOutExperiencedJumps: 0,
      crossroadsTriggeredJumps: 0,
      generalCpToWpPurchases: 0,
      unlimitedTransferredWp: 0,
      udsWarehouseWp: 0,
      manualWpAdjustment: 0,
      manualWpAdjustmentReason: '',
    },
    selections: {},
    pageNotes: {},
    notes: '',
  };
}

export function readPersonalRealityState(chain: Pick<Chain, 'importSourceMetadata'>): PersonalRealityState {
  const root = asRecord(chain.importSourceMetadata);
  const metadata = root ? asRecord(root[PERSONAL_REALITY_METADATA_KEY]) : null;
  const defaults = createDefaultPersonalRealityState();

  if (!metadata) {
    return defaults;
  }

  const rawBudget = asRecord(metadata.budget);
  const rawSelections = asRecord(metadata.selections);
  const rawPageNotes = asRecord(metadata.pageNotes);
  const requestedCoreMode = readString(metadata.coreModeId, '');
  const coreModeId = coreModeIds.has(requestedCoreMode as PersonalRealityCoreModeId)
    ? (requestedCoreMode as PersonalRealityCoreModeId)
    : '';

  return {
    version: 1,
    coreModeId,
    extraModeIds: Array.isArray(metadata.extraModeIds)
      ? metadata.extraModeIds.filter((value): value is PersonalRealityExtraModeId => extraModeIds.has(value as PersonalRealityExtraModeId))
      : [],
    discountedGroupIds: Array.isArray(metadata.discountedGroupIds)
      ? metadata.discountedGroupIds.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 3)
      : [],
    budget: {
      completedJumpCountOverride: rawBudget ? readNullableInteger(rawBudget.completedJumpCountOverride) : null,
      patientJumperDelayedJumps: rawBudget ? readInteger(rawBudget.patientJumperDelayedJumps, 0) : 0,
      swapOutExperiencedJumps: rawBudget ? readInteger(rawBudget.swapOutExperiencedJumps, 0) : 0,
      crossroadsTriggeredJumps: rawBudget ? readInteger(rawBudget.crossroadsTriggeredJumps, 0) : 0,
      generalCpToWpPurchases: rawBudget ? readInteger(rawBudget.generalCpToWpPurchases, 0) : 0,
      unlimitedTransferredWp: rawBudget ? readInteger(rawBudget.unlimitedTransferredWp, 0) : 0,
      udsWarehouseWp: rawBudget ? readSignedNumber(rawBudget.udsWarehouseWp, 0) : 0,
      manualWpAdjustment: rawBudget ? readSignedNumber(rawBudget.manualWpAdjustment, 0) : 0,
      manualWpAdjustmentReason: rawBudget ? readString(rawBudget.manualWpAdjustmentReason, '') : '',
    },
    selections: rawSelections
      ? Object.fromEntries(
          Object.entries(rawSelections)
            .filter(([key]) => key in personalRealityOptionsById)
            .map(([key, value]) => [key, readSelection(value)]),
        )
      : {},
    pageNotes: rawPageNotes
      ? (Object.fromEntries(
          Object.entries(rawPageNotes)
            .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
            .map(([key, value]) => [key, value]),
        ) as Record<string, string>)
      : {},
    notes: readString(metadata.notes, ''),
  };
}

export function writePersonalRealityState(
  chain: Chain,
  state: PersonalRealityState,
): Chain {
  const importSourceMetadata = {
    ...chain.importSourceMetadata,
    [PERSONAL_REALITY_METADATA_KEY]: state,
  } as JsonMap;

  return {
    ...chain,
    importSourceMetadata,
  };
}

function getSelectionForOption(state: PersonalRealityState, optionId: string): PersonalRealitySelectionState {
  const option = personalRealityOptionsById[optionId];

  if (!option) {
    return createDefaultSelectionState();
  }

  return state.selections[optionId] ?? createSelectionStateForOption(option);
}

export function isLimitationOption(option: PersonalRealityOption) {
  return option.kind === 'limitation' || (option.page >= 48 && option.page <= 53);
}

function isOptionTaken(option: PersonalRealityOption, selection: PersonalRealitySelectionState) {
  if (option.kind === 'variant') {
    if (selection.variantId.length === 0) {
      return false;
    }

    if (option.id === 'all-your-peeps' && selection.variantId === 'attempt-packs') {
      return selection.units > 0;
    }

    return true;
  }

  return selection.units > 0 || selection.cpUnits > 0;
}

function getVariant(option: PersonalRealityOption, variantId: string) {
  return option.variants?.find((variant) => variant.id === variantId) ?? null;
}

function getRequirementIds(option: PersonalRealityOption) {
  return option.requiresOptionIds ?? [];
}

function getRequirementMissingIds(state: PersonalRealityState, option: PersonalRealityOption) {
  const requirementIds = getRequirementIds(option);

  if (requirementIds.length === 0) {
    return [];
  }

  return requirementIds.filter((requirementId) => {
    const requiredOption = personalRealityOptionsById[requirementId];

    if (!requiredOption) {
      return false;
    }

    return !isOptionTaken(requiredOption, getSelectionForOption(state, requirementId));
  });
}

function getDiscountGroupId(option: PersonalRealityOption) {
  return option.discountGroupId ?? option.id;
}

function isDiscounted(state: PersonalRealityState, option: PersonalRealityOption) {
  return state.coreModeId === 'upfront' && state.discountedGroupIds.includes(getDiscountGroupId(option));
}

function applyDiscount(amount: number, discounted: boolean) {
  return discounted ? amount / 2 : amount;
}

function getCompletedJumpCount(state: PersonalRealityState, defaultCompletedJumpCount: number) {
  return state.budget.completedJumpCountOverride ?? defaultCompletedJumpCount;
}

function getBigBenefactorGain(selection: PersonalRealitySelectionState, completedJumpCount: number) {
  if (selection.variantId === 'flat-bonus') {
    return 500;
  }

  if (selection.variantId === 'per-jump') {
    return completedJumpCount * 50;
  }

  return 0;
}

function getVariantGain(option: PersonalRealityOption, selection: PersonalRealitySelectionState, completedJumpCount: number) {
  const variant = getVariant(option, selection.variantId);

  if (!variant) {
    return 0;
  }

  if (option.id === 'big-benefactor') {
    return getBigBenefactorGain(selection, completedJumpCount);
  }

  return variant.wpGain ?? 0;
}

function getVariantCost(option: PersonalRealityOption, selection: PersonalRealitySelectionState, completedJumpCount: number) {
  const variant = getVariant(option, selection.variantId);

  if (!variant) {
    return { wpSpent: 0, cpSpent: 0 };
  }

  if (option.id === 'all-your-peeps') {
    if (selection.variantId === 'attempt-packs') {
      return {
        wpSpent: Math.max(0, selection.units) * 50,
        cpSpent: 0,
      };
    }

    if (selection.variantId === 'unlimited-plan') {
      return {
        wpSpent: 600 + Math.max(0, selection.units) * 50,
        cpSpent: 0,
      };
    }
  }

  return {
    wpSpent: variant.wpCost ?? 0,
    cpSpent: variant.cpCost ?? 0,
  };
}

function getCounterCost(option: PersonalRealityOption, selection: PersonalRealitySelectionState, state: PersonalRealityState) {
  const units = Math.max(0, selection.units);
  const cpUnits = Math.max(0, selection.cpUnits);

  if (units === 0 && cpUnits === 0) {
    return { wpSpent: 0, cpSpent: 0 };
  }

  switch (option.id) {
    case 'personal-mod-pods':
      return {
        wpSpent: units > 0 ? 100 + Math.max(0, units - 1) * 20 : 0,
        cpSpent: 0,
      };
    case 'starting-collection':
      return {
        wpSpent: units > 0 ? 100 + Math.max(0, units - 1) * 50 : 0,
        cpSpent: 0,
      };
    case 'pod-rack':
      return {
        wpSpent: units > 0 ? 200 + Math.max(0, units - 1) * 50 : 0,
        cpSpent: 0,
      };
    case 'personal-realty': {
      if (units === 0) {
        return { wpSpent: 0, cpSpent: 0 };
      }

      const firstUnitCost = isOptionTaken(
        personalRealityOptionsById['personal-mini-realty'],
        getSelectionForOption(state, 'personal-mini-realty'),
      )
        ? 2700
        : 3000;

      return {
        wpSpent: firstUnitCost + Math.max(0, units - 1) * 3000,
        cpSpent: 0,
      };
    }
    default:
      return {
        wpSpent: (option.wpCost ?? 0) * units,
        cpSpent: (option.cpCost ?? 0) * cpUnits,
      };
  }
}

function getSelectionCosts(
  state: PersonalRealityState,
  option: PersonalRealityOption,
  selection: PersonalRealitySelectionState,
  completedJumpCount: number,
) {
  if (!isOptionTaken(option, selection)) {
    return { wpSpent: 0, cpSpent: 0, wpGain: 0 };
  }

  let wpSpent = 0;
  let cpSpent = 0;
  let wpGain = 0;

  if (option.kind === 'toggle') {
    wpSpent = (option.wpCost ?? 0) * Math.max(0, selection.units);
    cpSpent = (option.cpCost ?? 0) * Math.max(0, selection.cpUnits);
  } else if (option.kind === 'counter') {
    const counterCosts = getCounterCost(option, selection, state);
    wpSpent = counterCosts.wpSpent;
    cpSpent = counterCosts.cpSpent;
  } else if (option.kind === 'variant') {
    const variantCosts = getVariantCost(option, selection, completedJumpCount);
    wpSpent = variantCosts.wpSpent;
    cpSpent = variantCosts.cpSpent;
    wpGain = getVariantGain(option, selection, completedJumpCount);
  } else if (option.kind === 'limitation') {
    wpGain = option.wpGain ?? 0;
  }

  if (option.id === 'jump-recording' && isOptionTaken(personalRealityOptionsById['big-benefactor'], getSelectionForOption(state, 'big-benefactor'))) {
    wpSpent = 0;
  }

  if (option.id === 'all-your-pets' && isOptionTaken(personalRealityOptionsById['all-your-stuff'], getSelectionForOption(state, 'all-your-stuff'))) {
    wpSpent = 0;
  }

  wpSpent = applyDiscount(wpSpent, isDiscounted(state, option));

  if (isLimitationOption(option) && wpGain > 0) {
    const canBuyOff = option.id !== 'the-woods-are-lovely-dark-and-deep';
    const buyoffCost = wpGain * 1.5;

    if (selection.limitationStatus === 'paid-off-wp' && canBuyOff) {
      wpSpent += buyoffCost;
    }

    if (selection.limitationStatus === 'paid-off-cp' && canBuyOff) {
      cpSpent += buyoffCost;
    }
  }

  return { wpSpent, cpSpent, wpGain };
}

function getReasonableModeWarnings(summary: PersonalRealityPlanSummary, state: PersonalRealityState) {
  if (state.coreModeId !== 'reasonable') {
    return [];
  }

  return Object.values(summary.selectionSummaries)
    .filter((entry) => entry.selected)
    .flatMap((entry) => {
      const option = entry.option;

      if (option.kind === 'variant') {
        const variant = getVariant(option, entry.selection.variantId);
        const variantCost = option.id === 'all-your-peeps' ? 50 : variant?.wpCost ?? 0;

        return variantCost > 100 ? [`Reasonable mode blocks ${option.title} because it costs more than 100 WP.`] : [];
      }

      const unitCost = option.wpCost ?? 0;
      return unitCost > 100 ? [`Reasonable mode blocks ${option.title} because it costs more than 100 WP.`] : [];
    });
}

export function buildPersonalRealityPlanSummary(
  state: PersonalRealityState,
  defaultCompletedJumpCount: number,
): PersonalRealityPlanSummary {
  const completedJumpCount = getCompletedJumpCount(state, defaultCompletedJumpCount);
  const selectionSummaries: Record<string, PersonalRealitySelectionSummary> = {};
  const pageSelectionCounts: Record<number, number> = {
    2: state.coreModeId ? 1 : 0,
    3: state.extraModeIds.length,
  };

  let wpSpent = 0;
  let cpSpent = 0;
  let limitationWpGain = 0;
  let selectedOptionCount = 0;
  let activeLimitationCount = 0;

  for (const option of personalRealityOptionCatalog) {
    const selection = getSelectionForOption(state, option.id);
    const selected = isOptionTaken(option, selection);
    const missingRequirementIds = selected ? getRequirementMissingIds(state, option) : [];
    const costs = getSelectionCosts(state, option, selection, completedJumpCount);
    const activeLimitation =
      selected && isLimitationOption(option) && selection.limitationStatus === 'active';

    if (selected) {
      selectedOptionCount += 1;
      pageSelectionCounts[option.page] = (pageSelectionCounts[option.page] ?? 0) + 1;
      wpSpent += costs.wpSpent;
      cpSpent += costs.cpSpent;
      limitationWpGain += costs.wpGain;

      if (activeLimitation) {
        activeLimitationCount += 1;
      }
    }

    selectionSummaries[option.id] = {
      option,
      selection,
      selected,
      wpSpent: costs.wpSpent,
      cpSpent: costs.cpSpent,
      wpGain: costs.wpGain,
      missingRequirementIds,
      activeLimitation,
    };
  }

  let availableWp = 0;

  switch (state.coreModeId) {
    case 'upfront':
      availableWp += 1500;
      break;
    case 'incremental':
      availableWp += state.extraModeIds.includes('swap-out') && state.budget.swapOutExperiencedJumps >= 25 ? 700 : 500;
      availableWp += completedJumpCount * 50;
      break;
    case 'unlimited':
      availableWp += state.budget.unlimitedTransferredWp;
      break;
    case 'reasonable':
      availableWp += 3000;
      availableWp += Math.floor(completedJumpCount / 5) * 100;
      break;
    case 'therehouse':
      availableWp += 5000;
      break;
    default:
      break;
  }

  if (state.extraModeIds.includes('patient-jumper')) {
    availableWp += state.budget.patientJumperDelayedJumps * 100;
  }

  availableWp += state.budget.generalCpToWpPurchases * 2;
  availableWp += state.budget.udsWarehouseWp;
  availableWp += state.budget.manualWpAdjustment;
  availableWp += limitationWpGain;

  const collectiveWp = state.extraModeIds.includes('cross-roads') ? state.budget.crossroadsTriggeredJumps * 5 : 0;
  const therehouseCpPerCompletedJump = state.coreModeId === 'therehouse' ? 200 : 0;
  const therehouseEarnedCp = therehouseCpPerCompletedJump * completedJumpCount;
  const remainingWp = availableWp - wpSpent;

  cpSpent += state.budget.generalCpToWpPurchases * 50;

  const warnings: string[] = [];

  if (!state.coreModeId) {
    warnings.push('Select a core mode before relying on the WP total.');
  }

  if (state.coreModeId === 'upfront' && state.discountedGroupIds.length > 3) {
    warnings.push('Upfront Core Mode only allows three discounted purchase groups.');
  }

  if (
    selectionSummaries['the-woods-are-lovely-dark-and-deep']?.selected &&
    selectionSummaries['sky-simulator']?.selected
  ) {
    warnings.push('The Woods Are Lovely Dark and Deep forbids Sky Simulator.');
  }

  if (
    selectionSummaries['a-digital-frontier']?.selected &&
    selectionSummaries['never-the-twain-shall-meet']?.selected
  ) {
    warnings.push('Never The Twain Shall Meet replaces A Digital Frontier rather than stacking with it.');
  }

  if (
    selectionSummaries['the-woods-are-lovely-dark-and-deep']?.selected &&
    selectionSummaries['the-woods-are-lovely-dark-and-deep']?.selection.limitationStatus !== 'active'
  ) {
    warnings.push('The Woods Are Lovely Dark and Deep cannot be bought off and should stay active.');
  }

  for (const summary of Object.values(selectionSummaries)) {
    if (summary.selected && summary.missingRequirementIds.length > 0) {
      warnings.push(`${summary.option.title} is selected without all listed prerequisites.`);
    }
  }

  warnings.push(...getReasonableModeWarnings(
    {
      completedJumpCount,
      availableWp,
      wpSpent,
      remainingWp,
      cpSpent,
      collectiveWp,
      therehouseCpPerCompletedJump,
      therehouseEarnedCp,
      selectedOptionCount,
      activeLimitationCount,
      pageSelectionCounts,
      warnings: [],
      selectionSummaries,
    },
    state,
  ));

  return {
    completedJumpCount,
    availableWp,
    wpSpent,
    remainingWp,
    cpSpent,
    collectiveWp,
    therehouseCpPerCompletedJump,
    therehouseEarnedCp,
    selectedOptionCount,
    activeLimitationCount,
    pageSelectionCounts,
    warnings: Array.from(new Set(warnings)),
    selectionSummaries,
  };
}
