import { APP_VERSION, CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION } from '../app/config';
import type { NativeChainBundle, NativeSaveEnvelope } from '../domain/save';
import type { AttachmentRef } from '../domain/attachments/types';
import type { BodymodProfile } from '../domain/bodymod/types';
import type { Branch } from '../domain/branch/types';
import type { Effect } from '../domain/effects/types';
import type { ImportReport } from '../domain/import/types';
import type { Companion, Jumper } from '../domain/jumper/types';
import type { Jump, JumperParticipation } from '../domain/jump/types';
import type { Note } from '../domain/notes/types';
import type { PresetProfile } from '../domain/presets/types';
import type { HouseRuleProfile, JumpRulesContext } from '../domain/rules/types';
import type { Snapshot } from '../domain/snapshot/types';
import { validateNativeChainBundle, validateNativeSaveEnvelope } from '../schemas';
import { createId } from '../utils/id';
import { migrateNativeSaveEnvelope } from '../migrations';
import { db } from './database';

export interface ChainOverview {
  chainId: string;
  title: string;
  updatedAt: string;
  activeBranchId: string;
  jumperCount: number;
  jumpCount: number;
  importReportCount: number;
}

interface EntityIdMaps {
  chain: Map<string, string>;
  branch: Map<string, string>;
  jumper: Map<string, string>;
  companion: Map<string, string>;
  jump: Map<string, string>;
  participation: Map<string, string>;
  effect: Map<string, string>;
  bodymodProfile: Map<string, string>;
  jumpRulesContext: Map<string, string>;
  houseRuleProfile: Map<string, string>;
  presetProfile: Map<string, string>;
  snapshot: Map<string, string>;
  note: Map<string, string>;
  attachment: Map<string, string>;
  importReport: Map<string, string>;
}

function remapId(id: string, map: Map<string, string>): string {
  return map.get(id) ?? id;
}

function remapOptionalId(id: string | null | undefined, map: Map<string, string>) {
  if (id === null || id === undefined) {
    return id;
  }

  return remapId(id, map);
}

function remapOwnerEntityId(ownerEntityType: Effect['ownerEntityType'] | Note['ownerEntityType'] | AttachmentRef['ownerEntityType'], ownerEntityId: string, maps: EntityIdMaps) {
  switch (ownerEntityType) {
    case 'chain':
      return remapId(ownerEntityId, maps.chain);
    case 'jumper':
      return remapId(ownerEntityId, maps.jumper);
    case 'companion':
      return remapId(ownerEntityId, maps.companion);
    case 'jump':
      return remapId(ownerEntityId, maps.jump);
    case 'participation':
      return remapId(ownerEntityId, maps.participation);
    case 'branch':
      return remapId(ownerEntityId, maps.branch);
    case 'snapshot':
      return remapId(ownerEntityId, maps.snapshot);
    case 'preset':
      return remapId(ownerEntityId, maps.presetProfile);
    case 'note':
      return remapId(ownerEntityId, maps.note);
    case 'attachment':
      return remapId(ownerEntityId, maps.attachment);
    case 'system':
    default:
      return ownerEntityId;
  }
}

function createEntityIdMap<T extends { id: string }>(records: T[], prefix: string) {
  return new Map(records.map((record) => [record.id, createId(prefix)]));
}

function createBundleIdMaps(bundle: NativeChainBundle): EntityIdMaps {
  return {
    chain: new Map([[bundle.chain.id, createId('chain')]]),
    branch: createEntityIdMap(bundle.branches, 'branch'),
    jumper: createEntityIdMap(bundle.jumpers, 'jumper'),
    companion: createEntityIdMap(bundle.companions, 'companion'),
    jump: createEntityIdMap(bundle.jumps, 'jump'),
    participation: createEntityIdMap(bundle.participations, 'part'),
    effect: createEntityIdMap(bundle.effects, 'effect'),
    bodymodProfile: createEntityIdMap(bundle.bodymodProfiles, 'bodymod'),
    jumpRulesContext: createEntityIdMap(bundle.jumpRulesContexts, 'rules'),
    houseRuleProfile: createEntityIdMap(bundle.houseRuleProfiles, 'house'),
    presetProfile: createEntityIdMap(bundle.presetProfiles, 'preset'),
    snapshot: createEntityIdMap(bundle.snapshots, 'snapshot'),
    note: createEntityIdMap(bundle.notes, 'note'),
    attachment: createEntityIdMap(bundle.attachments, 'attachment'),
    importReport: createEntityIdMap(bundle.importReports, 'report'),
  };
}

function cloneBundleWithRemappedIds(bundle: NativeChainBundle): NativeChainBundle {
  const validatedBundle = validateNativeChainBundle(bundle);
  const maps = createBundleIdMaps(validatedBundle);

  const chainId = remapId(validatedBundle.chain.id, maps.chain);

  const clonedBranches: Branch[] = validatedBundle.branches.map((branch) => ({
    ...branch,
    id: remapId(branch.id, maps.branch),
    chainId,
    forkedFromJumpId: remapOptionalId(branch.forkedFromJumpId, maps.jump),
  }));

  const clonedJumpers: Jumper[] = validatedBundle.jumpers.map((jumper) => ({
    ...jumper,
    id: remapId(jumper.id, maps.jumper),
    chainId,
    branchId: remapId(jumper.branchId, maps.branch),
  }));

  const clonedCompanions: Companion[] = validatedBundle.companions.map((companion) => ({
    ...companion,
    id: remapId(companion.id, maps.companion),
    chainId,
    branchId: remapId(companion.branchId, maps.branch),
    parentJumperId: remapOptionalId(companion.parentJumperId, maps.jumper),
  }));

  const clonedJumps: Jump[] = validatedBundle.jumps.map((jump) => ({
    ...jump,
    id: remapId(jump.id, maps.jump),
    chainId,
    branchId: remapId(jump.branchId, maps.branch),
    participantJumperIds: jump.participantJumperIds.map((jumperId) => remapId(jumperId, maps.jumper)),
  }));

  const clonedParticipations: JumperParticipation[] = validatedBundle.participations.map((participation) => ({
    ...participation,
    id: remapId(participation.id, maps.participation),
    chainId,
    branchId: remapId(participation.branchId, maps.branch),
    jumpId: remapId(participation.jumpId, maps.jump),
    jumperId: remapId(participation.jumperId, maps.jumper),
  }));

  const clonedEffects: Effect[] = validatedBundle.effects.map((effect) => ({
    ...effect,
    id: remapId(effect.id, maps.effect),
    chainId,
    branchId: remapId(effect.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(effect.ownerEntityType, effect.ownerEntityId, maps),
  }));

  const clonedBodymodProfiles: BodymodProfile[] = validatedBundle.bodymodProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.bodymodProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
    jumperId: remapId(profile.jumperId, maps.jumper),
  }));

  const clonedJumpRulesContexts: JumpRulesContext[] = validatedBundle.jumpRulesContexts.map((context) => ({
    ...context,
    id: remapId(context.id, maps.jumpRulesContext),
    chainId,
    branchId: remapId(context.branchId, maps.branch),
    jumpId: remapOptionalId(context.jumpId, maps.jump),
  }));

  const clonedHouseRuleProfiles: HouseRuleProfile[] = validatedBundle.houseRuleProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.houseRuleProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
  }));

  const clonedPresetProfiles: PresetProfile[] = validatedBundle.presetProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.presetProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
  }));

  const clonedSnapshots: Snapshot[] = validatedBundle.snapshots.map((snapshot) => ({
    ...snapshot,
    id: remapId(snapshot.id, maps.snapshot),
    chainId,
    branchId: remapId(snapshot.branchId, maps.branch),
    createdFromJumpId: remapOptionalId(snapshot.createdFromJumpId, maps.jump),
  }));

  const clonedNotes: Note[] = validatedBundle.notes.map((note) => ({
    ...note,
    id: remapId(note.id, maps.note),
    chainId,
    branchId: remapId(note.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(note.ownerEntityType, note.ownerEntityId, maps),
  }));

  const clonedAttachments: AttachmentRef[] = validatedBundle.attachments.map((attachment) => ({
    ...attachment,
    id: remapId(attachment.id, maps.attachment),
    chainId,
    branchId: remapId(attachment.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(attachment.ownerEntityType, attachment.ownerEntityId, maps),
  }));

  const clonedImportReports: ImportReport[] = validatedBundle.importReports.map((report) => ({
    ...report,
    id: remapId(report.id, maps.importReport),
    chainId: remapOptionalId(report.chainId, maps.chain),
  }));

  return validateNativeChainBundle({
    chain: {
      ...validatedBundle.chain,
      id: chainId,
      activeBranchId: remapId(validatedBundle.chain.activeBranchId, maps.branch),
      activeJumpId: remapOptionalId(validatedBundle.chain.activeJumpId, maps.jump),
    },
    branches: clonedBranches,
    jumpers: clonedJumpers,
    companions: clonedCompanions,
    jumps: clonedJumps,
    participations: clonedParticipations,
    effects: clonedEffects,
    bodymodProfiles: clonedBodymodProfiles,
    jumpRulesContexts: clonedJumpRulesContexts,
    houseRuleProfiles: clonedHouseRuleProfiles,
    presetProfiles: clonedPresetProfiles,
    snapshots: clonedSnapshots,
    notes: clonedNotes,
    attachments: clonedAttachments,
    importReports: clonedImportReports,
  });
}

async function writeBundle(bundle: NativeChainBundle) {
  const validatedBundle = validateNativeChainBundle(bundle);
  const tables = [
    db.chains,
    db.branches,
    db.jumpers,
    db.companions,
    db.jumps,
    db.participations,
    db.effects,
    db.bodymodProfiles,
    db.jumpRulesContexts,
    db.houseRuleProfiles,
    db.presetProfiles,
    db.snapshots,
    db.notes,
    db.attachments,
    db.importReports,
  ] as const;

  await db.transaction(
    'rw',
    tables,
    async () => {
      await db.chains.put(validatedBundle.chain);
      await db.branches.bulkPut(validatedBundle.branches);
      await db.jumpers.bulkPut(validatedBundle.jumpers);
      await db.companions.bulkPut(validatedBundle.companions);
      await db.jumps.bulkPut(validatedBundle.jumps);
      await db.participations.bulkPut(validatedBundle.participations);
      await db.effects.bulkPut(validatedBundle.effects);
      await db.bodymodProfiles.bulkPut(validatedBundle.bodymodProfiles);
      await db.jumpRulesContexts.bulkPut(validatedBundle.jumpRulesContexts);
      await db.houseRuleProfiles.bulkPut(validatedBundle.houseRuleProfiles);
      await db.presetProfiles.bulkPut(validatedBundle.presetProfiles);
      await db.snapshots.bulkPut(validatedBundle.snapshots);
      await db.notes.bulkPut(validatedBundle.notes);
      await db.attachments.bulkPut(validatedBundle.attachments);
      await db.importReports.bulkPut(validatedBundle.importReports);
    },
  );
}

export async function createBlankChain(title: string): Promise<NativeChainBundle> {
  const now = new Date().toISOString();
  const chainId = createId('chain');
  const branchId = createId('branch');

  const bundle: NativeChainBundle = {
    chain: {
      id: chainId,
      createdAt: now,
      updatedAt: now,
      title: title.trim() || 'Untitled Chain',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      formatVersion: NATIVE_FORMAT_VERSION,
      activeBranchId: branchId,
      activeJumpId: null,
      chainSettings: {
        chainDrawbacksForCompanions: false,
        chainDrawbacksSupplements: true,
        narratives: 'enabled',
        altForms: true,
      },
      bankSettings: {
        enabled: false,
        maxDeposit: 200,
        depositRatio: 50,
        interestRate: 0,
      },
      importSourceMetadata: {},
    },
    branches: [
      {
        id: branchId,
        chainId,
        createdAt: now,
        updatedAt: now,
        title: 'Mainline',
        sourceBranchId: null,
        forkedFromJumpId: null,
        isActive: true,
        notes: 'Created locally.',
      },
    ],
    jumpers: [],
    companions: [],
    jumps: [],
    participations: [],
    effects: [],
    bodymodProfiles: [],
    jumpRulesContexts: [],
    houseRuleProfiles: [],
    presetProfiles: [],
    snapshots: [],
    notes: [],
    attachments: [],
    importReports: [],
  };

  const validatedBundle = validateNativeChainBundle(bundle);
  await writeBundle(validatedBundle);
  return validatedBundle;
}

export async function saveImportedChainBundle(bundle: NativeChainBundle): Promise<NativeChainBundle> {
  const now = new Date().toISOString();
  const persistedBundle = validateNativeChainBundle({
    ...bundle,
    chain: {
      ...bundle.chain,
      updatedAt: now,
    },
    branches: bundle.branches.map((branch, index) => ({
      ...branch,
      isActive: index === 0 ? true : branch.isActive,
      updatedAt: now,
    })),
    jumpers: bundle.jumpers.map((jumper) => ({
      ...jumper,
      updatedAt: now,
    })),
    companions: bundle.companions.map((companion) => ({
      ...companion,
      updatedAt: now,
    })),
    jumps: bundle.jumps.map((jump) => ({
      ...jump,
      updatedAt: now,
    })),
    participations: bundle.participations.map((participation) => ({
      ...participation,
      updatedAt: now,
    })),
    effects: bundle.effects.map((effect) => ({
      ...effect,
      updatedAt: now,
    })),
    bodymodProfiles: bundle.bodymodProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    jumpRulesContexts: bundle.jumpRulesContexts.map((context) => ({
      ...context,
      updatedAt: now,
    })),
    houseRuleProfiles: bundle.houseRuleProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    presetProfiles: bundle.presetProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    snapshots: bundle.snapshots,
    notes: bundle.notes.map((note) => ({
      ...note,
      updatedAt: now,
    })),
    attachments: bundle.attachments.map((attachment) => ({
      ...attachment,
      updatedAt: now,
    })),
    importReports: bundle.importReports.map((report) => ({
      ...report,
      status: 'imported',
      updatedAt: now,
    })),
  });

  await writeBundle(persistedBundle);
  return persistedBundle;
}

export async function getChainBundle(chainId: string): Promise<NativeChainBundle | undefined> {
  const chain = await db.chains.get(chainId);

  if (!chain) {
    return undefined;
  }

  const [
    branches,
    jumpers,
    companions,
    jumps,
    participations,
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles,
    presetProfiles,
    snapshots,
    notes,
    attachments,
    importReports,
  ] = await Promise.all([
    db.branches.where('chainId').equals(chainId).toArray(),
    db.jumpers.where('chainId').equals(chainId).toArray(),
    db.companions.where('chainId').equals(chainId).toArray(),
    db.jumps.where('chainId').equals(chainId).toArray(),
    db.participations.where('chainId').equals(chainId).toArray(),
    db.effects.where('chainId').equals(chainId).toArray(),
    db.bodymodProfiles.where('chainId').equals(chainId).toArray(),
    db.jumpRulesContexts.where('chainId').equals(chainId).toArray(),
    db.houseRuleProfiles.where('chainId').equals(chainId).toArray(),
    db.presetProfiles.where('chainId').equals(chainId).toArray(),
    db.snapshots.where('chainId').equals(chainId).toArray(),
    db.notes.where('chainId').equals(chainId).toArray(),
    db.attachments.where('chainId').equals(chainId).toArray(),
    db.importReports.where('chainId').equals(chainId).toArray(),
  ]);

  return validateNativeChainBundle({
    chain,
    branches,
    jumpers,
    companions,
    jumps,
    participations,
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles,
    presetProfiles,
    snapshots,
    notes,
    attachments,
    importReports,
  });
}

export async function listChainOverviews(): Promise<ChainOverview[]> {
  const chains = await db.chains.orderBy('updatedAt').reverse().toArray();

  return Promise.all(
    chains.map(async (chain) => {
      const [jumperCount, jumpCount, importReportCount] = await Promise.all([
        db.jumpers.where('chainId').equals(chain.id).count(),
        db.jumps.where('chainId').equals(chain.id).count(),
        db.importReports.where('chainId').equals(chain.id).count(),
      ]);

      return {
        chainId: chain.id,
        title: chain.title,
        updatedAt: chain.updatedAt,
        activeBranchId: chain.activeBranchId,
        jumperCount,
        jumpCount,
        importReportCount,
      };
    }),
  );
}

export function createNativeSaveEnvelope(chains: NativeChainBundle[]): NativeSaveEnvelope {
  const validatedChains = chains.map((chain) => validateNativeChainBundle(chain));

  return validateNativeSaveEnvelope({
    formatVersion: NATIVE_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    chains: validatedChains,
    metadata: {
      exportMode: 'metadata-and-data',
    },
  });
}

export async function exportNativeSave(chainId?: string): Promise<NativeSaveEnvelope> {
  if (chainId) {
    const bundle = await getChainBundle(chainId);

    if (!bundle) {
      throw new Error('Chain not found.');
    }

    return createNativeSaveEnvelope([bundle]);
  }

  const chains = await db.chains.toArray();
  const bundles = await Promise.all(chains.map((chain) => getChainBundle(chain.id)));
  return createNativeSaveEnvelope(bundles.filter((bundle): bundle is NativeChainBundle => Boolean(bundle)));
}

export async function importNativeSave(raw: unknown): Promise<NativeSaveEnvelope> {
  const migratedEnvelope = migrateNativeSaveEnvelope(raw);
  const importedEnvelope = validateNativeSaveEnvelope({
    ...migratedEnvelope,
    chains: migratedEnvelope.chains.map((bundle) => cloneBundleWithRemappedIds(bundle)),
  });

  for (const bundle of importedEnvelope.chains) {
    await writeBundle(bundle);
  }

  return importedEnvelope;
}
