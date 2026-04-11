import { CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION } from '../../app/config';
import type { BodymodProfile } from '../bodymod/types';
import type { Branch } from '../branch/types';
import type { Chain } from '../chain/types';
import type { Effect } from '../effects/types';
import type { NativeChainBundle } from '../save';
import type { Jumper } from '../jumper/types';
import type { Jump, JumperParticipation } from '../jump/types';
import type {
  ChainMakerV2Altform,
  ChainMakerV2CleanerResult,
  ChainMakerV2Source,
  ImportReport,
  NormalizedEffectImport,
  NormalizedImportModel,
  NormalizedJumperImport,
  NormalizedJumpImport,
  NormalizedParticipationImport,
  PreparedImportSession,
} from './types';
import { ChainMakerV2SourceSchema } from '../../schemas';
import { createId } from '../../utils/id';
import { normalizeCurrencyExchange, normalizeParticipationSelection } from '../jump/selection';
import { detectImportSource } from './sourceDetection';
import { cleanChainMakerV2Raw } from './cleaner';

const TOP_LEVEL_MAPPED_KEYS = new Set([
  'name',
  'versionNumber',
  'characters',
  'jumps',
  'altforms',
  'chainDrawbacks',
  'chainSettings',
  'bankSettings',
  'purchases',
  'characterList',
  'jumpList',
]);

const JUMP_MAPPED_KEYS = new Set([
  '_id',
  'name',
  'characters',
  'duration',
  'notes',
  'bankDeposits',
  'currencyExchanges',
  'supplementPurchases',
  'supplementInvestments',
  'purchases',
  'retainedDrawbacks',
  'drawbacks',
  'drawbackOverrides',
  'origins',
  'altForms',
  'useAltForms',
  'narratives',
  'useNarratives',
  'budgets',
  'stipends',
  'useSupplements',
  'originCategories',
  'originCategoryList',
  'currencies',
  'purchaseSubtypes',
  'subsystemSummaries',
]);

const CHAIN_SETTINGS_MAPPED_KEYS = new Set([
  'chainDrawbacksForCompanions',
  'chainDrawbacksSupplements',
  'narratives',
  'altForms',
]);

const BANK_SETTINGS_MAPPED_KEYS = new Set(['enabled', 'maxDeposit', 'depositRatio', 'interestRate']);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sortNumericEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort((left, right) => Number(left[0]) - Number(right[0]));
}

function getUnmappedFields(record: Record<string, unknown>, mappedKeys: Set<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !mappedKeys.has(key)));
}

function getNarrativeDefaults() {
  return {
    accomplishments: '',
    challenges: '',
    goals: '',
  };
}

function getDerivedCurrentJumpSourceId(
  source: ChainMakerV2Source,
  jumps: Array<Pick<NormalizedJumpImport, 'sourceId' | 'orderIndex'>>,
) {
  if (jumps.length === 0 || source.current === false) {
    return null;
  }

  const orderedJumps = jumps.slice().sort((left, right) => left.orderIndex - right.orderIndex);
  return orderedJumps[orderedJumps.length - 1]?.sourceId ?? null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getPurchaseCatalog(source: ChainMakerV2Source) {
  const catalog = new Map<number, Record<string, unknown>>();
  const purchaseRecord = asRecord(source.purchases);

  for (const [sourceKey, rawEntry] of sortNumericEntries(purchaseRecord)) {
    const entry = asRecord(rawEntry);
    const entryId = parseOptionalNumber(entry._id) ?? parseOptionalNumber(sourceKey);

    if (entryId !== null) {
      catalog.set(entryId, entry);
    }
  }

  return catalog;
}

function summarizePurchaseCatalogEntry(
  selectionKind: 'purchase' | 'drawback' | 'retained-drawback' | 'chain-drawback',
  sourcePurchaseId: number,
  entry: Record<string, unknown>,
) {
  const tags = Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === 'string') : [];

  return {
    sourcePurchaseId,
    selectionKind,
    name:
      typeof entry.name === 'string' && entry.name.trim().length > 0
        ? entry.name
        : `${selectionKind} ${sourcePurchaseId}`,
    description: typeof entry.description === 'string' ? entry.description : '',
    value: parseOptionalNumber(entry.value),
    currency: parseOptionalNumber(entry.currency),
    purchaseValue: parseOptionalNumber(entry.purchaseValue),
    costModifier: parseOptionalNumber(entry.costModifier),
    purchaseType: parseOptionalNumber(entry._type),
    subtype: parseOptionalNumber(entry.subtype),
    duration: parseOptionalNumber(entry.duration),
    sourceCharacterId: parseOptionalNumber(entry._characterId),
    sourceJumpId: parseOptionalNumber(entry._jumpId),
    tags,
    category: Array.isArray(entry.category) ? entry.category : [],
  };
}

function normalizeSelectionList(
  references: unknown[],
  selectionKind: 'purchase' | 'drawback' | 'retained-drawback',
  pathPrefix: string,
  purchaseCatalog: Map<number, Record<string, unknown>>,
  unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'],
) {
  return references.map((reference, index) => {
    const sourcePurchaseId = parseOptionalNumber(reference);

    if (sourcePurchaseId !== null) {
      const purchaseEntry = purchaseCatalog.get(sourcePurchaseId);

      if (purchaseEntry) {
        return normalizeParticipationSelection(
          summarizePurchaseCatalogEntry(selectionKind, sourcePurchaseId, purchaseEntry),
          selectionKind,
        );
      }
    }

    unresolvedMappings.push({
      path: `${pathPrefix}.${index}`,
      reason: `${selectionKind} reference could not be resolved against the preserved purchase catalog.`,
      severity: 'warning',
      rawFragment: reference,
      preservedAt: 'chain.importSourceMetadata.purchaseCatalog',
    });

    return normalizeParticipationSelection(
      {
        sourcePurchaseId,
        selectionKind,
        name: typeof reference === 'string' || typeof reference === 'number' ? String(reference) : 'Unresolved selection',
        description: '',
        unresolved: true,
      },
      selectionKind,
    );
  });
}

function makeSummary(chainName: string, jumpers: number, jumps: number, chainDrawbacks: number, altforms: number, participations: number) {
  return {
    chainName,
    jumperCount: jumpers,
    jumpCount: jumps,
    chainDrawbackCount: chainDrawbacks,
    altformCount: altforms,
    participationCount: participations,
  };
}

function describeImportSource(sourceType: NormalizedImportModel['sourceType']) {
  if (sourceType === 'jump-summary-text') {
    return 'a jump summary text file';
  }

  if (sourceType === 'chainmaker-v2') {
    return 'ChainMaker v2';
  }

  return sourceType;
}

function buildTopLevelUnresolvedMappings(preservedTopLevel: Record<string, unknown>) {
  const keys = Object.keys(preservedTopLevel);

  if (keys.length === 0) {
    return [];
  }

  return [
    {
      path: 'topLevelPreservedBlocks',
      reason: `Preserved top-level source blocks are available for future mapping work: ${keys.join(', ')}.`,
      severity: 'info' as const,
      rawFragment: {
        keys,
      },
      preservedAt: 'chain.importSourceMetadata',
    },
  ];
}

function normalizeJumpers(source: ChainMakerV2Source): NormalizedJumperImport[] {
  return sortNumericEntries(source.characters).map(([sourceKey, character]) => {
    const preserved = getUnmappedFields(character, new Set([
      '_id',
      'name',
      'gender',
      'originalAge',
      'personality',
      'background',
      'notes',
      '_primary',
      'originalForm',
    ]));
    const normalizedOriginalAge = parseOptionalNumber(character.originalAge);

    return {
      sourceKey,
      sourceId: character._id,
      name: character.name,
      isPrimary: character._primary,
      gender: character.gender,
      originalAge: normalizedOriginalAge,
      notes: character.notes,
      originalFormSourceId: character.originalForm ?? null,
      personality: character.personality,
      background: character.background,
      importSourceMetadata: {
        ...preserved,
        ...(character.originalAge !== undefined && normalizedOriginalAge === null
          ? { originalAgeRaw: character.originalAge }
          : {}),
      },
    };
  });
}

function buildUnresolvedParticipationFragment(jump: ChainMakerV2Source['jumps'][string], sourceKey: string, sourceCharacterId: number) {
  const characterKey = String(sourceCharacterId);

  return {
    sourceJumpKey: sourceKey,
    sourceJumpId: jump._id,
    sourceJumpTitle: jump.name,
    sourceCharacterId,
    notes: jump.notes[characterKey] ?? '',
    purchases: jump.purchases[characterKey] ?? [],
    drawbacks: jump.drawbacks[characterKey] ?? [],
    retainedDrawbacks: jump.retainedDrawbacks[characterKey] ?? [],
    origins: jump.origins[characterKey] ?? {},
    budgets: jump.budgets[characterKey] ?? {},
    stipends: jump.stipends[characterKey] ?? {},
    narratives: jump.narratives[characterKey] ?? getNarrativeDefaults(),
    altForms: jump.altForms[characterKey] ?? [],
    bankDeposit: jump.bankDeposits[characterKey] ?? 0,
    currencyExchanges: jump.currencyExchanges[characterKey] ?? [],
    supplementPurchases: jump.supplementPurchases[characterKey] ?? {},
    supplementInvestments: jump.supplementInvestments[characterKey] ?? {},
    drawbackOverrides: jump.drawbackOverrides[characterKey] ?? {},
    importSourceMetadata: {
      useSupplements: jump.useSupplements,
      useAltForms: jump.useAltForms,
      useNarratives: jump.useNarratives,
      originCategories: jump.originCategories,
      originCategoryList: jump.originCategoryList,
      currencies: jump.currencies,
      purchaseSubtypes: jump.purchaseSubtypes,
      subsystemSummaries: jump.subsystemSummaries,
    },
  };
}

function normalizeJumps(source: ChainMakerV2Source, purchaseCatalog: Map<number, Record<string, unknown>>): {
  jumps: NormalizedJumpImport[];
  participations: NormalizedParticipationImport[];
  warnings: PreparedImportSession['normalized']['warnings'];
  unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'];
  preservedFragments: {
    unresolvedParticipations: Record<string, unknown>[];
  };
} {
  const warnings: PreparedImportSession['normalized']['warnings'] = [];
  const unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'] = [];
  const unresolvedParticipations: Record<string, unknown>[] = [];

  const orderedJumpSourceIds = new Map(source.jumpList.map((jumpId, index) => [jumpId, index]));
  const jumps: Array<Omit<NormalizedJumpImport, 'status'>> = [];
  const participations: Array<Omit<NormalizedParticipationImport, 'status'>> = [];

  for (const [sourceKey, jump] of sortNumericEntries(source.jumps)) {
    const importSourceMetadata = getUnmappedFields(jump, JUMP_MAPPED_KEYS);

    if (Object.keys(importSourceMetadata).length > 0) {
      unresolvedMappings.push({
        path: `jumps.${sourceKey}`,
        reason: 'Jump fields were preserved but are not yet mapped into first-sprint native structures.',
        severity: 'warning',
        rawFragment: importSourceMetadata,
        preservedAt: `jump.importSourceMetadata`,
      });
    }

    jumps.push({
      sourceKey,
      sourceId: jump._id,
      title: jump.name,
      orderIndex: orderedJumpSourceIds.get(jump._id) ?? jumps.length,
      duration: jump.duration,
      characterSourceIds: jump.characters,
      importSourceMetadata,
    });

    for (const characterId of jump.characters) {
      const characterKey = String(characterId);

      if (!(characterKey in source.characters)) {
        const preservedFragment = buildUnresolvedParticipationFragment(jump, sourceKey, characterId);

        warnings.push({
          code: 'missing_character_reference',
          message: `Jump "${jump.name}" references character ${characterId}, but no matching character was found.`,
          path: `jumps.${sourceKey}.characters`,
          severity: 'warning',
        });
        unresolvedMappings.push({
          path: `jumps.${sourceKey}.characters.${characterKey}`,
          reason:
            'Jump participation data referenced a missing character, so the raw participation fragment was preserved instead of being discarded.',
          severity: 'warning',
          rawFragment: preservedFragment,
          preservedAt: 'chain.importSourceMetadata.unresolvedParticipations',
        });
        unresolvedParticipations.push(preservedFragment);
        continue;
      }

      participations.push({
        sourceJumpId: jump._id,
        sourceCharacterId: characterId,
        notes: jump.notes[characterKey] ?? '',
        purchases: normalizeSelectionList(
          jump.purchases[characterKey] ?? [],
          'purchase',
          `jumps.${sourceKey}.purchases.${characterKey}`,
          purchaseCatalog,
          unresolvedMappings,
        ),
        drawbacks: normalizeSelectionList(
          jump.drawbacks[characterKey] ?? [],
          'drawback',
          `jumps.${sourceKey}.drawbacks.${characterKey}`,
          purchaseCatalog,
          unresolvedMappings,
        ),
        retainedDrawbacks: normalizeSelectionList(
          jump.retainedDrawbacks[characterKey] ?? [],
          'retained-drawback',
          `jumps.${sourceKey}.retainedDrawbacks.${characterKey}`,
          purchaseCatalog,
          unresolvedMappings,
        ),
        origins: jump.origins[characterKey] ?? {},
        budgets: jump.budgets[characterKey] ?? {},
        stipends: jump.stipends[characterKey] ?? {},
        narratives: jump.narratives[characterKey] ?? getNarrativeDefaults(),
        altForms: jump.altForms[characterKey] ?? [],
        bankDeposit: jump.bankDeposits[characterKey] ?? 0,
        currencyExchanges: (jump.currencyExchanges[characterKey] ?? []).map((exchange) => normalizeCurrencyExchange(exchange)),
        supplementPurchases: jump.supplementPurchases[characterKey] ?? {},
        supplementInvestments: jump.supplementInvestments[characterKey] ?? {},
        drawbackOverrides: jump.drawbackOverrides[characterKey] ?? {},
        importSourceMetadata: {
          useSupplements: jump.useSupplements,
          useAltForms: jump.useAltForms,
          useNarratives: jump.useNarratives,
          originCategories: jump.originCategories,
          originCategoryList: jump.originCategoryList,
          currencies: jump.currencies,
          purchaseSubtypes: jump.purchaseSubtypes,
          subsystemSummaries: jump.subsystemSummaries,
        },
      });
    }
  }

  const currentJumpSourceId = getDerivedCurrentJumpSourceId(source, jumps);

  return {
    jumps: jumps.map((jump) => ({
      ...jump,
      status: jump.sourceId === currentJumpSourceId ? 'current' : 'completed',
    })),
    participations: participations.map((participation) => ({
      ...participation,
      status: participation.sourceJumpId === currentJumpSourceId ? 'active' : 'completed',
    })),
    warnings,
    unresolvedMappings,
    preservedFragments: {
      unresolvedParticipations,
    },
  };
}

function normalizeEffects(
  source: ChainMakerV2Source,
  purchaseCatalog: Map<number, Record<string, unknown>>,
): {
  effects: NormalizedEffectImport[];
  unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'];
} {
  const unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'] = [];
  const effects = source.chainDrawbacks.map((drawback, index) => {
    const sourcePurchaseId = parseOptionalNumber(drawback);
    const catalogEntry = sourcePurchaseId !== null ? purchaseCatalog.get(sourcePurchaseId) : undefined;
    const drawbackRecord = Array.isArray(drawback)
      ? { rawValue: drawback }
      : catalogEntry
        ? {
            ...catalogEntry,
            sourcePurchaseId,
            selectionKind: 'chain-drawback',
          }
      : Object.keys(asRecord(drawback)).length > 0
        ? asRecord(drawback)
        : { rawValue: drawback };
    const rawTitle = drawbackRecord.name ?? drawbackRecord.title ?? drawbackRecord.summary;
    const rawDescription = drawbackRecord.description ?? drawbackRecord.details ?? drawbackRecord.notes;

    if (sourcePurchaseId !== null && !catalogEntry) {
      unresolvedMappings.push({
        path: `chainDrawbacks.${index}`,
        reason: 'Chain drawback reference could not be resolved against the preserved purchase catalog.',
        severity: 'warning',
        rawFragment: drawback,
        preservedAt: 'chain.importSourceMetadata.purchaseCatalog',
      });
    }

    return {
      sourceIndex: index,
      title: typeof rawTitle === 'string' && rawTitle.trim().length > 0 ? rawTitle : `Chain Drawback ${index + 1}`,
      description: typeof rawDescription === 'string' ? rawDescription : '',
      importSourceMetadata: drawbackRecord,
    };
  });

  return {
    effects,
    unresolvedMappings,
  };
}

function groupAltformsByCharacter(source: ChainMakerV2Source) {
  const grouped = new Map<number, ChainMakerV2Altform[]>();

  for (const [, altform] of sortNumericEntries(source.altforms)) {
    const existing = grouped.get(altform.characterId) ?? [];
    existing.push(altform);
    grouped.set(altform.characterId, existing);
  }

  return grouped;
}

function normalizeBodymodProfiles(source: ChainMakerV2Source): {
  bodymodProfiles: Omit<BodymodProfile, 'id' | 'chainId' | 'branchId' | 'createdAt' | 'updatedAt' | 'jumperId'>[];
  unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'];
  preservedFragments: {
    unresolvedBodymodProfiles: Record<string, unknown>[];
  };
} {
  const groupedAltforms = groupAltformsByCharacter(source);
  const unresolvedMappings: PreparedImportSession['normalized']['unresolvedMappings'] = [];
  const unresolvedBodymodProfiles: Record<string, unknown>[] = [];
  const bodymodProfiles: Omit<
    BodymodProfile,
    'id' | 'chainId' | 'branchId' | 'createdAt' | 'updatedAt' | 'jumperId'
  >[] = [];

  for (const [characterId, altforms] of Array.from(groupedAltforms.entries())) {
    if (!(String(characterId) in source.characters)) {
      const preservedFragment = {
        sourceCharacterId: characterId,
        altforms,
      };

      unresolvedMappings.push({
        path: `altforms.character.${characterId}`,
        reason:
          'Altforms referenced a missing character, so the raw bodymod fragment was preserved instead of being discarded.',
        severity: 'warning',
        rawFragment: preservedFragment,
        preservedAt: 'chain.importSourceMetadata.unresolvedBodymodProfiles',
      });
      unresolvedBodymodProfiles.push(preservedFragment);
      continue;
    }

    bodymodProfiles.push({
      mode: 'baseline' as const,
      summary: `${altforms.length} imported altform${altforms.length === 1 ? '' : 's'}`,
      benchmarkNotes: '',
      interpretationNotes: '',
      iconicSelections: [],
      forms: altforms.map((altform) => ({
        sourceAltformId: altform._id,
        name: altform.name,
        sex: altform.sex,
        species: altform.species,
        physicalDescription: altform.physicalDescription,
        capabilities: altform.capabilities,
        imageUploaded: altform.imageUploaded,
        heightValue: altform.height.value,
        heightUnit: altform.height.unit,
        weightValue: altform.weight.value,
        weightUnit: altform.weight.unit,
        importSourceMetadata: {
          characterId: altform.characterId,
          rawAltform: altform,
        },
      })),
      features: [],
      importSourceMetadata: {
        sourceCharacterId: characterId,
      },
    });
  }

  return {
    bodymodProfiles,
    unresolvedMappings,
    preservedFragments: {
      unresolvedBodymodProfiles,
    },
  };
}

export function parseChainMakerV2Source(raw: unknown): ChainMakerV2Source {
  return ChainMakerV2SourceSchema.parse(raw);
}

function applyCleanerSummary(
  normalized: NormalizedImportModel,
  cleaning: ChainMakerV2CleanerResult,
): NormalizedImportModel {
  if (cleaning.changes.length === 0) {
    return normalized;
  }

  return {
    ...normalized,
    warnings: [
      {
        code: 'chainmaker_cleaner_applied',
        message: `Cleaner normalized ${cleaning.changes.length} source field${cleaning.changes.length === 1 ? '' : 's'} before DTO validation.`,
        severity: 'info',
      },
      ...normalized.warnings,
    ],
    preservedSourceSummary: {
      ...normalized.preservedSourceSummary,
      cleanerChangeCount: cleaning.changes.length,
      cleanerTouchedPaths: cleaning.changes.slice(0, 20).map((change) => change.path),
    },
  };
}

export function normalizeChainMakerV2Source(source: ChainMakerV2Source): NormalizedImportModel {
  const purchaseCatalog = getPurchaseCatalog(source);
  const jumpers = normalizeJumpers(source);
  const jumpData = normalizeJumps(source, purchaseCatalog);
  const effectData = normalizeEffects(source, purchaseCatalog);
  const bodymodData = normalizeBodymodProfiles(source);
  const preservedTopLevel = getUnmappedFields(source, TOP_LEVEL_MAPPED_KEYS);
  const preservedChainSettings = getUnmappedFields(source.chainSettings, CHAIN_SETTINGS_MAPPED_KEYS);
  const preservedBankSettings = getUnmappedFields(source.bankSettings, BANK_SETTINGS_MAPPED_KEYS);
  const chainImportSourceMetadata = {
    ...preservedTopLevel,
    ...(jumpData.preservedFragments.unresolvedParticipations.length > 0
      ? { unresolvedParticipations: jumpData.preservedFragments.unresolvedParticipations }
      : {}),
    ...(bodymodData.preservedFragments.unresolvedBodymodProfiles.length > 0
      ? { unresolvedBodymodProfiles: bodymodData.preservedFragments.unresolvedBodymodProfiles }
      : {}),
    ...(purchaseCatalog.size > 0 ? { purchaseCatalog: source.purchases ?? {} } : {}),
    ...(Object.keys(preservedChainSettings).length > 0 ? { chainSettingsExtra: preservedChainSettings } : {}),
    ...(Object.keys(preservedBankSettings).length > 0 ? { bankSettingsExtra: preservedBankSettings } : {}),
  };
  const topLevelUnresolvedMappings = buildTopLevelUnresolvedMappings(preservedTopLevel);
  const settingsUnresolvedMappings = [
    ...(purchaseCatalog.size > 0
      ? [
          {
            path: 'purchases',
            reason: 'Top-level purchase catalog was preserved and used to enrich purchases, drawbacks, and chain drawbacks.',
            severity: 'info' as const,
            rawFragment: { count: purchaseCatalog.size },
            preservedAt: 'chain.importSourceMetadata.purchaseCatalog',
          },
        ]
      : []),
    ...(Object.keys(preservedChainSettings).length > 0
      ? [
          {
            path: 'chainSettings',
            reason: 'Extra chain settings keys were preserved outside the canonical native settings shape.',
            severity: 'warning' as const,
            rawFragment: preservedChainSettings,
            preservedAt: 'chain.importSourceMetadata.chainSettingsExtra',
          },
        ]
      : []),
    ...(Object.keys(preservedBankSettings).length > 0
      ? [
          {
            path: 'bankSettings',
            reason: 'Extra bank settings keys were preserved outside the canonical native settings shape.',
            severity: 'warning' as const,
            rawFragment: preservedBankSettings,
            preservedAt: 'chain.importSourceMetadata.bankSettingsExtra',
          },
        ]
      : []),
  ];

  return {
    sourceType: 'chainmaker-v2',
    sourceVersion: source.versionNumber,
    chain: {
      title: source.name,
      sourceVersion: source.versionNumber,
      chainSettings: {
        chainDrawbacksForCompanions: source.chainSettings.chainDrawbacksForCompanions,
        chainDrawbacksSupplements: source.chainSettings.chainDrawbacksSupplements,
        narratives: source.chainSettings.narratives,
        altForms: source.chainSettings.altForms,
      },
      bankSettings: {
        enabled: source.bankSettings.enabled,
        maxDeposit: source.bankSettings.maxDeposit,
        depositRatio: source.bankSettings.depositRatio,
        interestRate: source.bankSettings.interestRate,
      },
      importSourceMetadata: chainImportSourceMetadata,
    },
    jumpers,
    companions: [],
    jumps: jumpData.jumps,
    participations: jumpData.participations,
    effects: effectData.effects,
    bodymodProfiles: bodymodData.bodymodProfiles,
    warnings: jumpData.warnings,
    unresolvedMappings: [
      ...topLevelUnresolvedMappings,
      ...settingsUnresolvedMappings,
      ...jumpData.unresolvedMappings,
      ...effectData.unresolvedMappings,
      ...bodymodData.unresolvedMappings,
    ],
    summary: makeSummary(
      source.name,
      jumpers.length,
      jumpData.jumps.length,
      effectData.effects.length,
      Object.keys(source.altforms).length,
      jumpData.participations.length,
    ),
    preservedSourceSummary: {
      topLevelBlocks: Object.keys(chainImportSourceMetadata),
      jumpCount: Object.keys(source.jumps).length,
      characterCount: Object.keys(source.characters).length,
      altformCount: Object.keys(source.altforms).length,
      purchaseCatalogCount: purchaseCatalog.size,
      unresolvedParticipationCount: jumpData.preservedFragments.unresolvedParticipations.length,
      unresolvedBodymodProfileCount: bodymodData.preservedFragments.unresolvedBodymodProfiles.length,
    },
  };
}

export function mapNormalizedImportToNativeBundle(normalized: NormalizedImportModel): NativeChainBundle {
  const now = new Date().toISOString();
  const chainId = createId('chain');
  const branchId = createId('branch');
  const jumperIdBySourceId = new Map<number, string>();
  const jumpIdBySourceId = new Map<number, string>();

  const chain: Chain = {
    id: chainId,
    createdAt: now,
    updatedAt: now,
    title: normalized.chain.title,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    formatVersion: NATIVE_FORMAT_VERSION,
    activeBranchId: branchId,
    activeJumpId: null,
    sourceMetadata: {
      sourceType: normalized.sourceType,
      sourceVersion: normalized.sourceVersion,
      importedAt: now,
      preservedFields: normalized.chain.importSourceMetadata,
    },
    chainSettings: normalized.chain.chainSettings,
    bankSettings: normalized.chain.bankSettings,
    importSourceMetadata: normalized.chain.importSourceMetadata,
  };

  const branch: Branch = {
    id: branchId,
    chainId,
    createdAt: now,
    updatedAt: now,
    title: 'Imported Mainline',
    sourceBranchId: null,
    forkedFromJumpId: null,
    isActive: true,
    notes: `Imported from ${describeImportSource(normalized.sourceType)}.`,
    sourceMetadata: {
      sourceType: normalized.sourceType,
      sourceVersion: normalized.sourceVersion,
      importedAt: now,
    },
  };

  const jumpers: Jumper[] = normalized.jumpers.map((jumperImport) => {
    const jumperId = createId('jumper');
    jumperIdBySourceId.set(jumperImport.sourceId, jumperId);

    return {
      id: jumperId,
      chainId,
      branchId,
      createdAt: now,
      updatedAt: now,
      name: jumperImport.name,
      isPrimary: jumperImport.isPrimary,
      gender: jumperImport.gender,
      originalAge: jumperImport.originalAge ?? null,
      notes: jumperImport.notes,
      originalFormSourceId: jumperImport.originalFormSourceId ?? null,
      personality: jumperImport.personality,
      background: jumperImport.background,
      importSourceMetadata: jumperImport.importSourceMetadata,
    };
  });

  const jumps: Jump[] = normalized.jumps
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((jumpImport, index) => {
      const jumpId = createId('jump');
      jumpIdBySourceId.set(jumpImport.sourceId, jumpId);

      return {
        id: jumpId,
        chainId,
        branchId,
        createdAt: now,
        updatedAt: now,
        title: jumpImport.title,
        orderIndex: index,
        status: jumpImport.status,
        jumpType: 'standard',
        duration: jumpImport.duration,
        participantJumperIds: jumpImport.characterSourceIds
          .map((sourceId) => jumperIdBySourceId.get(sourceId))
          .filter((value): value is string => Boolean(value)),
        jumpDocIds: [],
        sourceJumpId: jumpImport.sourceId,
        importSourceMetadata: jumpImport.importSourceMetadata,
      };
    });

  const participations: JumperParticipation[] = normalized.participations.flatMap((participationImport) => {
    const jumpId = jumpIdBySourceId.get(participationImport.sourceJumpId);
    const jumperId = jumperIdBySourceId.get(participationImport.sourceCharacterId);

    if (!jumpId || !jumperId) {
      return [];
    }

    return [
      {
        id: createId('part'),
        chainId,
        branchId,
        createdAt: now,
        updatedAt: now,
        jumpId,
        jumperId,
        status: participationImport.status,
        notes: participationImport.notes,
        purchases: participationImport.purchases,
        drawbacks: participationImport.drawbacks,
        retainedDrawbacks: participationImport.retainedDrawbacks,
        origins: participationImport.origins,
        budgets: participationImport.budgets,
        stipends: participationImport.stipends,
        narratives: participationImport.narratives,
        altForms: participationImport.altForms,
        bankDeposit: participationImport.bankDeposit,
        currencyExchanges: participationImport.currencyExchanges,
        supplementPurchases: participationImport.supplementPurchases,
        supplementInvestments: participationImport.supplementInvestments,
        drawbackOverrides: participationImport.drawbackOverrides,
        importSourceMetadata: participationImport.importSourceMetadata,
      },
    ];
  });

  const effects: Effect[] = normalized.effects.map((effectImport) => ({
    id: createId('effect'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    scopeType: 'chain',
    ownerEntityType: 'chain',
    ownerEntityId: chainId,
    title: effectImport.title,
    description: effectImport.description,
    category: 'drawback',
    state: 'active',
    sourceEffectId: effectImport.sourceIndex,
    importSourceMetadata: effectImport.importSourceMetadata,
  }));

  const bodymodProfiles: BodymodProfile[] = normalized.bodymodProfiles.flatMap((profileImport) => {
    const sourceCharacterId = profileImport.importSourceMetadata.sourceCharacterId;
    const jumperId =
      typeof sourceCharacterId === 'number' ? jumperIdBySourceId.get(sourceCharacterId) : undefined;

    if (!jumperId) {
      return [];
    }

    return [
      {
        id: createId('bodymod'),
        chainId,
        branchId,
        createdAt: now,
        updatedAt: now,
        jumperId,
        mode: profileImport.mode,
        summary: profileImport.summary,
        benchmarkNotes: profileImport.benchmarkNotes,
        interpretationNotes: profileImport.interpretationNotes,
        iconicSelections: profileImport.iconicSelections,
        forms: profileImport.forms,
        features: profileImport.features,
        importSourceMetadata: profileImport.importSourceMetadata,
      },
    ];
  });

  const jumpRulesContexts = normalized.jumps.map((jumpImport) => ({
    id: createId('rules'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId: jumpIdBySourceId.get(jumpImport.sourceId) ?? null,
    gauntlet: false,
    warehouseAccess: 'manual' as const,
    powerAccess: 'manual' as const,
    itemAccess: 'manual' as const,
    altFormAccess: normalized.chain.chainSettings.altForms ? ('full' as const) : ('locked' as const),
    supplementAccess:
      jumpImport.importSourceMetadata.useSupplements === true ? ('full' as const) : ('locked' as const),
    notes: '',
    importSourceMetadata: jumpImport.importSourceMetadata,
  }));

  const importReport: ImportReport = {
    id: createId('report'),
    createdAt: now,
    updatedAt: now,
    chainId,
    sourceType: normalized.sourceType,
    sourceVersion: normalized.sourceVersion,
    importMode: 'new-chain',
    status: 'draft',
    summary: normalized.summary,
    warnings: normalized.warnings,
    unresolvedMappings: normalized.unresolvedMappings,
    preservedSourceSummary: normalized.preservedSourceSummary,
  };

  const currentJumpId = jumps.find((jump) => jump.status === 'current')?.id ?? null;

  return {
    chain: {
      ...chain,
      activeJumpId: currentJumpId,
    },
    branches: [branch],
    jumpers,
    companions: [],
    jumps,
    jumpDocs: [],
    participations,
    companionParticipations: [],
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles: [],
    presetProfiles: [],
    snapshots: [],
    notes: [],
    attachments: [],
    importReports: [importReport],
  };
}

export function prepareChainMakerV2ImportSession(raw: unknown): PreparedImportSession {
  const detection = detectImportSource(raw);

  if (detection.sourceType !== 'chainmaker-v2' || !detection.isSupported) {
    throw new Error('The provided payload is not a supported ChainMaker v2 export.');
  }

  const cleaning = cleanChainMakerV2Raw(raw);
  const source = parseChainMakerV2Source(cleaning.cleanedRaw);
  const normalized = applyCleanerSummary(normalizeChainMakerV2Source(source), cleaning);
  const bundle = mapNormalizedImportToNativeBundle(normalized);

  return {
    sourceDetection: detection,
    cleaning,
    source,
    normalized,
    bundle,
    importReport: bundle.importReports[0],
  };
}
