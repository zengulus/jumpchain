import { APP_VERSION, CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION } from '../app/config';
import type { NativeChainBundle, NativeSaveEnvelope } from '../domain/save';
import { NativeSaveEnvelopeSchema } from '../schemas';
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

async function writeBundle(bundle: NativeChainBundle) {
  await db.transaction(
    'rw',
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
    async () => {
      await db.chains.put(bundle.chain);
      await db.branches.bulkPut(bundle.branches);
      await db.jumpers.bulkPut(bundle.jumpers);
      await db.companions.bulkPut(bundle.companions);
      await db.jumps.bulkPut(bundle.jumps);
      await db.participations.bulkPut(bundle.participations);
      await db.effects.bulkPut(bundle.effects);
      await db.bodymodProfiles.bulkPut(bundle.bodymodProfiles);
      await db.jumpRulesContexts.bulkPut(bundle.jumpRulesContexts);
      await db.houseRuleProfiles.bulkPut(bundle.houseRuleProfiles);
      await db.presetProfiles.bulkPut(bundle.presetProfiles);
      await db.snapshots.bulkPut(bundle.snapshots);
      await db.notes.bulkPut(bundle.notes);
      await db.attachments.bulkPut(bundle.attachments);
      await db.importReports.bulkPut(bundle.importReports);
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

  await writeBundle(bundle);
  return bundle;
}

export async function saveImportedChainBundle(bundle: NativeChainBundle): Promise<NativeChainBundle> {
  const now = new Date().toISOString();
  const persistedBundle: NativeChainBundle = {
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
  };

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

  return {
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
  };
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
  return NativeSaveEnvelopeSchema.parse({
    formatVersion: NATIVE_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    chains,
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

  for (const bundle of migratedEnvelope.chains) {
    await writeBundle(bundle);
  }

  return migratedEnvelope;
}
