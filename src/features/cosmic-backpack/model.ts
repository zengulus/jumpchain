import type { Chain } from '../../domain/chain/types';
import type { JsonMap } from '../../domain/common';
import { createId } from '../../utils/id';
import {
  COSMIC_BACKPACK_BASE_VOLUME_FT3,
  COSMIC_BACKPACK_TOTAL_BP,
  cosmicBackpackMandatoryOptionIds,
  cosmicBackpackOptionCatalog,
  cosmicBackpackOptionsById,
  type CosmicBackpackOption,
} from './catalog';

export const COSMIC_BACKPACK_METADATA_KEY = 'cosmicBackpack';
export const COSMIC_BACKPACK_BP_CURRENCY_KEY = 'cosmic-backpack-bp';
const CUBIC_FEET_TO_CUBIC_METERS = 0.028316846592;

export interface CosmicBackpackCustomUpgrade {
  id: string;
  title: string;
  costBp: number;
  addedVolumeFt3: number;
  volumeMultiplier: number;
  notes: string;
}

export interface CosmicBackpackState {
  version: 1;
  selectedOptionIds: string[];
  customUpgrades: CosmicBackpackCustomUpgrade[];
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
  customUpgradeCount: number;
  selectedCoreUpgradeCount: number;
  selectedAttachmentCount: number;
  selectedModifierCount: number;
  customSpentBp: number;
  customAddedVolumeFt3: number;
  customVolumeMultiplier: number;
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

function getValidSelectedOptionIds(value: unknown) {
  const selectedIds = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry in cosmicBackpackOptionsById)
    : [];

  return Array.from(new Set([...cosmicBackpackMandatoryOptionIds, ...selectedIds]));
}

function getValidCustomUpgrades(value: unknown): CosmicBackpackCustomUpgrade[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();

  return value.flatMap((entry, index) => {
    const record = asRecord(entry);

    if (!record) {
      return [];
    }

    const rawId = readString(record.id).trim();
    const nextId = rawId.length > 0 && !seenIds.has(rawId) ? rawId : createId(`cosmic_backpack_upgrade_${index + 1}`);
    seenIds.add(nextId);

    return [
      {
        id: nextId,
        title: readString(record.title).trim() || `Custom upgrade ${index + 1}`,
        costBp: readFiniteNumber(record.costBp),
        addedVolumeFt3: readFiniteNumber(record.addedVolumeFt3),
        volumeMultiplier: Math.max(0.01, readFiniteNumber(record.volumeMultiplier, 1)),
        notes: readString(record.notes),
      },
    ];
  });
}

function formatBudget(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function createBlankCosmicBackpackCustomUpgrade(): CosmicBackpackCustomUpgrade {
  return {
    id: createId('cosmic_backpack_upgrade'),
    title: 'Custom upgrade',
    costBp: 0,
    addedVolumeFt3: 0,
    volumeMultiplier: 1,
    notes: '',
  };
}

export function createDefaultCosmicBackpackState(): CosmicBackpackState {
  return {
    version: 1,
    selectedOptionIds: [...cosmicBackpackMandatoryOptionIds],
    customUpgrades: [],
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
    customUpgrades: getValidCustomUpgrades(metadata.customUpgrades),
    appearanceNotes: readString(metadata.appearanceNotes),
    containerForm: readString(metadata.containerForm),
    notes: readString(metadata.notes),
  };
}

export function writeCosmicBackpackState(chain: Chain, state: CosmicBackpackState): Chain {
  const normalizedState: CosmicBackpackState = {
    ...state,
    selectedOptionIds: getValidSelectedOptionIds(state.selectedOptionIds),
    customUpgrades: getValidCustomUpgrades(state.customUpgrades),
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
  const normalizedCustomUpgrades = getValidCustomUpgrades(state.customUpgrades);
  const selectedOptions = normalizedSelectedIds
    .map((optionId) => cosmicBackpackOptionsById[optionId])
    .filter((option): option is CosmicBackpackOption => Boolean(option));
  const selectedOptionSpentBp = selectedOptions.reduce((total, option) => total + option.costBp, 0);
  const customSpentBp = normalizedCustomUpgrades.reduce((total, upgrade) => total + upgrade.costBp, 0);
  const spentBp = selectedOptionSpentBp + customSpentBp;
  const transferredBp = Number.isFinite(derivedBudget.transferredBp) ? derivedBudget.transferredBp : 0;
  const totalBp = COSMIC_BACKPACK_TOTAL_BP + transferredBp;
  const remainingBp = totalBp - spentBp;
  const builtInStorageMultiplier = normalizedSelectedIds.includes('more-space') ? 2 : 1;
  const customVolumeMultiplier = normalizedCustomUpgrades.reduce(
    (product, upgrade) => product * Math.max(0.01, upgrade.volumeMultiplier),
    1,
  );
  const customAddedVolumeFt3 = normalizedCustomUpgrades.reduce(
    (total, upgrade) => total + upgrade.addedVolumeFt3,
    0,
  );
  const storageVolumeFt3 = Math.max(
    0,
    Number(
      (
        COSMIC_BACKPACK_BASE_VOLUME_FT3 * builtInStorageMultiplier * customVolumeMultiplier
        + customAddedVolumeFt3
      ).toFixed(2),
    ),
  );
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
    storageVolumeFt3,
    storageVolumeM3: Number((storageVolumeFt3 * CUBIC_FEET_TO_CUBIC_METERS).toFixed(1)),
    selectedOptionCount: selectedUserOptionCount,
    customUpgradeCount: normalizedCustomUpgrades.length,
    selectedCoreUpgradeCount: selectedOptions.filter((option) => option.category === 'core-upgrade').length,
    selectedAttachmentCount: selectedOptions.filter((option) => option.category === 'attachment').length,
    selectedModifierCount: selectedOptions.filter((option) => option.category === 'modifier').length,
    customSpentBp,
    customAddedVolumeFt3,
    customVolumeMultiplier,
    warnings,
  };
}
