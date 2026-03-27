import type { Chain } from '../../domain/chain/types';
import type { JsonMap } from '../../domain/common';
import {
  COSMIC_BACKPACK_BASE_VOLUME_FT3,
  COSMIC_BACKPACK_BASE_VOLUME_M3,
  COSMIC_BACKPACK_TOTAL_BP,
  cosmicBackpackMandatoryOptionIds,
  cosmicBackpackOptionCatalog,
  cosmicBackpackOptionsById,
} from './catalog';

export const COSMIC_BACKPACK_METADATA_KEY = 'cosmicBackpack';
export const COSMIC_BACKPACK_BP_CURRENCY_KEY = 'cosmic-backpack-bp';

export interface CosmicBackpackState {
  version: 1;
  selectedOptionIds: string[];
  appearanceNotes: string;
  containerForm: string;
  notes: string;
}

export interface CosmicBackpackSummary {
  baseBp: number;
  transferredBp: number;
  totalBp: number;
  spentBp: number;
  remainingBp: number;
  storageVolumeFt3: number;
  storageVolumeM3: number;
  selectedOptionCount: number;
  selectedCoreUpgradeCount: number;
  selectedAttachmentCount: number;
  selectedModifierCount: number;
  warnings: string[];
}

export interface CosmicBackpackDerivedBudget {
  transferredBp: number;
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

function getValidSelectedOptionIds(value: unknown) {
  const selectedIds = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry in cosmicBackpackOptionsById)
    : [];

  return Array.from(new Set([...cosmicBackpackMandatoryOptionIds, ...selectedIds]));
}

function formatBudget(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function createDefaultCosmicBackpackState(): CosmicBackpackState {
  return {
    version: 1,
    selectedOptionIds: [...cosmicBackpackMandatoryOptionIds],
    appearanceNotes: '',
    containerForm: '',
    notes: '',
  };
}

export function readCosmicBackpackState(chain: Pick<Chain, 'importSourceMetadata'>): CosmicBackpackState {
  const root = asRecord(chain.importSourceMetadata);
  const metadata = root ? asRecord(root[COSMIC_BACKPACK_METADATA_KEY]) : null;

  if (!metadata) {
    return createDefaultCosmicBackpackState();
  }

  return {
    version: 1,
    selectedOptionIds: getValidSelectedOptionIds(metadata.selectedOptionIds),
    appearanceNotes: readString(metadata.appearanceNotes),
    containerForm: readString(metadata.containerForm),
    notes: readString(metadata.notes),
  };
}

export function writeCosmicBackpackState(chain: Chain, state: CosmicBackpackState): Chain {
  const normalizedState: CosmicBackpackState = {
    ...state,
    selectedOptionIds: getValidSelectedOptionIds(state.selectedOptionIds),
  };
  const importSourceMetadata = {
    ...chain.importSourceMetadata,
    [COSMIC_BACKPACK_METADATA_KEY]: normalizedState,
  } as JsonMap;

  return {
    ...chain,
    importSourceMetadata,
  };
}

export function getCosmicBackpackMissingRequirementIds(state: CosmicBackpackState, optionId: string) {
  const option = cosmicBackpackOptionsById[optionId];

  if (!option?.requirementIds?.length) {
    return [];
  }

  const selectedIds = new Set(state.selectedOptionIds);
  return option.requirementIds.filter((requirementId) => !selectedIds.has(requirementId));
}

export function setCosmicBackpackOptionSelected(
  state: CosmicBackpackState,
  optionId: string,
  selected: boolean,
): CosmicBackpackState {
  if (!(optionId in cosmicBackpackOptionsById)) {
    return state;
  }

  if (!selected && cosmicBackpackMandatoryOptionIds.includes(optionId as (typeof cosmicBackpackMandatoryOptionIds)[number])) {
    return {
      ...state,
      selectedOptionIds: getValidSelectedOptionIds(state.selectedOptionIds),
    };
  }

  const selectedIds = new Set(getValidSelectedOptionIds(state.selectedOptionIds));

  if (selected) {
    selectedIds.add(optionId);
  } else {
    const idsToRemove = new Set<string>([optionId]);
    let changed = true;

    while (changed) {
      changed = false;

      for (const option of cosmicBackpackOptionCatalog) {
        if (!option.requirementIds?.some((requirementId) => idsToRemove.has(requirementId))) {
          continue;
        }

        if (!idsToRemove.has(option.id)) {
          idsToRemove.add(option.id);
          changed = true;
        }
      }
    }

    for (const id of idsToRemove) {
      selectedIds.delete(id);
    }
  }

  return {
    ...state,
    selectedOptionIds: getValidSelectedOptionIds(
      cosmicBackpackOptionCatalog
        .map((option) => option.id)
        .filter((id) => selectedIds.has(id)),
    ),
  };
}

export function buildCosmicBackpackSummary(
  state: CosmicBackpackState,
  derivedBudget: CosmicBackpackDerivedBudget = { transferredBp: 0 },
): CosmicBackpackSummary {
  const normalizedSelectedIds = getValidSelectedOptionIds(state.selectedOptionIds);
  const selectedOptions = normalizedSelectedIds
    .map((optionId) => cosmicBackpackOptionsById[optionId])
    .filter(Boolean);
  const spentBp = selectedOptions.reduce((total, option) => total + option.costBp, 0);
  const transferredBp = Number.isFinite(derivedBudget.transferredBp) ? derivedBudget.transferredBp : 0;
  const totalBp = COSMIC_BACKPACK_TOTAL_BP + transferredBp;
  const remainingBp = totalBp - spentBp;
  const storageMultiplier = normalizedSelectedIds.includes('more-space') ? 2 : 1;
  const warnings: string[] = [];

  for (const option of selectedOptions) {
    const missingRequirementIds = getCosmicBackpackMissingRequirementIds(
      {
        ...state,
        selectedOptionIds: normalizedSelectedIds,
      },
      option.id,
    );

    if (missingRequirementIds.length > 0) {
      warnings.push(
        `${option.title} is missing ${missingRequirementIds
          .map((requirementId) => cosmicBackpackOptionsById[requirementId]?.title ?? requirementId)
          .join(', ')}.`,
      );
    }
  }

  if (remainingBp < 0) {
    warnings.push(`Current selections are over budget by ${formatBudget(Math.abs(remainingBp))} BP.`);
  }

  const selectedUserOptionCount = selectedOptions.filter(
    (option) =>
      !cosmicBackpackMandatoryOptionIds.includes(
        option.id as (typeof cosmicBackpackMandatoryOptionIds)[number],
      ),
  ).length;

  return {
    baseBp: COSMIC_BACKPACK_TOTAL_BP,
    transferredBp,
    totalBp,
    spentBp,
    remainingBp,
    storageVolumeFt3: COSMIC_BACKPACK_BASE_VOLUME_FT3 * storageMultiplier,
    storageVolumeM3: Number((COSMIC_BACKPACK_BASE_VOLUME_M3 * storageMultiplier).toFixed(1)),
    selectedOptionCount: selectedUserOptionCount,
    selectedCoreUpgradeCount: selectedOptions.filter((option) => option.category === 'core-upgrade').length,
    selectedAttachmentCount: selectedOptions.filter((option) => option.category === 'attachment').length,
    selectedModifierCount: selectedOptions.filter((option) => option.category === 'modifier').length,
    warnings,
  };
}
