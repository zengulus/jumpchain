import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { UiPreferencesProvider } from '../app/UiPreferencesContext';
import { HomePage } from '../features/home/HomePage';
import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import { db } from '../db/database';
import {
  createNativeSaveEnvelope,
  createSnapshotForBranch,
  createBlankChain,
  deleteChain,
  exportBranchSave,
  exportNativeSave,
  getChainBundle,
  importNativeSave,
  listChainOverviews,
  restoreSnapshotAsBranch,
  saveImportedChainBundle,
} from '../db/persistence';
import { CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION, APP_VERSION } from '../app/config';
import { migrateNativeSaveEnvelope } from '../migrations';
import {
  createBlankBodymodProfile,
  createBlankCompanion,
  createBlankEffect,
  createBlankJumper,
  saveChainEntity,
  saveChainRecord,
} from '../features/workspace/records';
import { validateNativeChainBundle } from '../schemas';
import { createDefaultPersonalRealityState } from '../features/personal-reality/model';

async function resetDatabase() {
  db.close();
  await db.delete();
}

describe('native persistence and round-trip safety', () => {
  it('validates a blank native bundle successfully', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Phase One Bundle');
    const validatedBundle = validateNativeChainBundle(bundle);

    expect(validatedBundle.chain.title).toBe('Phase One Bundle');
    expect(validatedBundle.branches).toHaveLength(1);
  });

  it('fails malformed native bundle validation with a useful title error', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Invalid Me');
    let errorMessage = '';

    try {
      validateNativeChainBundle({
        ...bundle,
        chain: {
          ...bundle.chain,
          title: '',
        },
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage.length > 0).toBe(true);
    expect(errorMessage.includes('title')).toBe(true);
  });

  it('routes migration by header and rejects unsupported schema versions explicitly', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Migration Ready');
    const envelope = await exportNativeSave(bundle.chain.id);
    const migratedEnvelope = migrateNativeSaveEnvelope(envelope);

    expect(migratedEnvelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    let errorMessage = '';

    try {
      migrateNativeSaveEnvelope({
        ...envelope,
        schemaVersion: 99,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toBe('Unsupported native schema version: 99');
  });

  it('exports native saves with required top-level metadata fields', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Export Metadata');
    const envelope = await exportNativeSave(bundle.chain.id);

    expect(envelope.formatVersion).toBe(NATIVE_FORMAT_VERSION);
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(typeof envelope.exportedAt).toBe('string');
    expect(envelope.appVersion).toBe(APP_VERSION);
  });

  it('persists and reloads a blank chain with the same visible state', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Reloadable Chain');
    const reloadedBundle = await getChainBundle(createdBundle.chain.id);

    expect(Boolean(reloadedBundle)).toBe(true);

    if (!reloadedBundle) {
      throw new Error('Expected a persisted chain bundle.');
    }

    expect(reloadedBundle.chain.title).toBe('Reloadable Chain');
    expect(reloadedBundle.branches).toHaveLength(1);
    expect(reloadedBundle.jumpers).toHaveLength(0);
    expect(reloadedBundle.jumps).toHaveLength(0);

    const overviews = await listChainOverviews();
    expect(overviews).toHaveLength(1);
    expect(overviews[0].title).toBe('Reloadable Chain');
  });

  it('persists companion records with parent jumper assignment across reload', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Companion Reload');
    const branchId = createdBundle.chain.activeBranchId;
    const jumper = {
      ...createBlankJumper(createdBundle.chain.id, branchId),
      name: 'Lead Jumper',
    };
    const companion = {
      ...createBlankCompanion(createdBundle.chain.id, branchId),
      name: 'Trusted Ally',
      role: 'Scout',
      status: 'active' as const,
      originJumpId: null,
      parentJumperId: jumper.id,
    };

    await saveChainRecord(db.jumpers, jumper);
    await saveChainRecord(db.companions, companion);

    const reloadedBundle = await getChainBundle(createdBundle.chain.id);

    expect(reloadedBundle?.companions).toHaveLength(1);
    expect(reloadedBundle?.companions[0]?.name).toBe('Trusted Ally');
    expect(reloadedBundle?.companions[0]?.role).toBe('Scout');
    expect(reloadedBundle?.companions[0]?.parentJumperId).toBe(jumper.id);
  });

  it('persists Iconic profiles with tiered selections across reload', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Iconic Reload');
    const branchId = createdBundle.chain.activeBranchId;
    const jumper = {
      ...createBlankJumper(createdBundle.chain.id, branchId),
      name: 'Concept Jumper',
    };

    await saveChainRecord(db.jumpers, jumper);

    const profile = {
      ...createBlankBodymodProfile(createdBundle.chain.id, branchId, jumper.id),
      mode: 'suite' as const,
      summary: 'Street sorcerer with a ritual kit.',
      benchmarkNotes: 'Benchmark against named recurring casters who stay relevant in normal conflicts.',
      interpretationNotes: 'Keep the ritual identity online even when raw output compresses to setting Core.',
      iconicSelections: [
        {
          kind: 'power' as const,
          title: 'Instinctive Sorcery',
          source: 'Occult Jump',
          summary: 'Preserves the core casting identity.',
        },
        {
          kind: 'item' as const,
          title: 'Field Grimoire',
          source: 'Occult Jump',
          summary: 'Keeps the recognisable ritual toolkit available.',
        },
      ],
    };

    await saveChainRecord(db.bodymodProfiles, profile);

    const reloadedBundle = await getChainBundle(createdBundle.chain.id);
    const reloadedProfile = reloadedBundle?.bodymodProfiles.find((entry) => entry.jumperId === jumper.id);

    expect(reloadedProfile?.mode).toBe('suite');
    expect(reloadedProfile?.summary).toBe('Street sorcerer with a ritual kit.');
    expect(reloadedProfile?.benchmarkNotes).toContain('named recurring casters');
    expect(reloadedProfile?.iconicSelections[0]?.title).toBe('Instinctive Sorcery');
    expect(reloadedProfile?.iconicSelections[1]?.kind).toBe('item');
  });

  it('persists chainwide rule flags and chain-owned drawback effects across reload', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Chainwide Rules');
    const chainwideDrawback = {
      ...createBlankEffect(createdBundle.chain.id, createdBundle.chain.activeBranchId, createdBundle.chain.id),
      title: 'No Outside Context Problem',
      category: 'drawback' as const,
      description: 'Chainwide drawback test record.',
    };

    await saveChainEntity({
      ...createdBundle.chain,
      chainSettings: {
        ...createdBundle.chain.chainSettings,
        chainDrawbacksForCompanions: true,
        chainDrawbacksSupplements: false,
      },
    });
    await saveChainRecord(db.effects, chainwideDrawback);

    const reloadedBundle = await getChainBundle(createdBundle.chain.id);

    expect(reloadedBundle?.chain.chainSettings.chainDrawbacksForCompanions).toBe(true);
    expect(reloadedBundle?.chain.chainSettings.chainDrawbacksSupplements).toBe(false);
    expect(
      reloadedBundle?.effects.some(
        (effect) =>
          effect.title === 'No Outside Context Problem' &&
          effect.ownerEntityType === 'chain' &&
          effect.ownerEntityId === createdBundle.chain.id &&
          effect.scopeType === 'chain',
      ),
    ).toBe(true);
  });

  it('persists Personal Reality supplement state inside chain metadata across reload', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Personal Reality Reload');
    const personalRealityState = createDefaultPersonalRealityState();
    personalRealityState.coreModeId = 'upfront';
    personalRealityState.discountedGroupIds = ['medical-suite'];
    personalRealityState.notes = 'Warehouse village build with a medical core.';
    personalRealityState.selections['medical-bay'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };

    await saveChainEntity({
      ...createdBundle.chain,
      importSourceMetadata: {
        ...createdBundle.chain.importSourceMetadata,
        personalReality: personalRealityState,
      },
    });

    const reloadedBundle = await getChainBundle(createdBundle.chain.id);
    const reloadedPersonalReality = reloadedBundle?.chain.importSourceMetadata.personalReality as
      | { coreModeId?: string; notes?: string; discountedGroupIds?: string[]; selections?: Record<string, { units?: number }> }
      | undefined;

    expect(reloadedPersonalReality?.coreModeId).toBe('upfront');
    expect(reloadedPersonalReality?.notes).toContain('medical core');
    expect(reloadedPersonalReality?.discountedGroupIds?.[0]).toBe('medical-suite');
    expect(reloadedPersonalReality?.selections?.['medical-bay']?.units).toBe(1);
  });

  it('deletes a chain and cascades its chain-owned records out of IndexedDB', async () => {
    await resetDatabase();
    const createdBundle = await createBlankChain('Disposable Chain');

    await deleteChain(createdBundle.chain.id);

    const reloadedBundle = await getChainBundle(createdBundle.chain.id);
    const overviews = await listChainOverviews();

    expect(reloadedBundle).toBe(undefined);
    expect(overviews).toHaveLength(0);
  });

  it('imports native saves as safe copies with remapped ids', async () => {
    await resetDatabase();
    const originalBundle = await createBlankChain('Safe Copy Chain');
    const branchId = originalBundle.chain.activeBranchId;
    const jumper = {
      ...createBlankJumper(originalBundle.chain.id, branchId),
      name: 'Import Parent',
    };
    const companion = {
      ...createBlankCompanion(originalBundle.chain.id, branchId),
      name: 'Imported Ally',
      parentJumperId: jumper.id,
    };

    await saveChainRecord(db.jumpers, jumper);
    await saveChainRecord(db.companions, companion);

    const exportedEnvelope = await exportNativeSave(originalBundle.chain.id);
    const importedEnvelope = await importNativeSave(exportedEnvelope);
    const overviews = await listChainOverviews();

    expect(importedEnvelope.chains).toHaveLength(1);
    expect(overviews).toHaveLength(2);

    const importedBundle = importedEnvelope.chains[0];
    expect(importedBundle.chain.id === originalBundle.chain.id).toBe(false);
    expect(importedBundle.chain.title).toBe(originalBundle.chain.title);
    expect(importedBundle.chain.activeBranchId === originalBundle.chain.activeBranchId).toBe(false);
    expect(importedBundle.chain.activeBranchId === importedBundle.branches[0].id).toBe(true);
    expect(importedBundle.jumpers).toHaveLength(1);
    expect(importedBundle.companions).toHaveLength(1);
    expect(importedBundle.companions[0].id === companion.id).toBe(false);
    expect(importedBundle.companions[0].parentJumperId === jumper.id).toBe(false);
    expect(importedBundle.companions[0].parentJumperId).toBe(importedBundle.jumpers[0].id);

    const persistedImportedBundle = await getChainBundle(importedBundle.chain.id);
    expect(Boolean(persistedImportedBundle)).toBe(true);

    if (!persistedImportedBundle) {
      throw new Error('Expected imported safe copy to be persisted.');
    }

    expect(persistedImportedBundle.chain.title).toBe('Safe Copy Chain');
    expect(persistedImportedBundle.branches).toHaveLength(1);
    expect(persistedImportedBundle.companions).toHaveLength(1);
  });

  it('rolls back multi-chain native imports when a later table write fails', async () => {
    await resetDatabase();
    const firstBundle = await createBlankChain('Atomic Import One');
    const secondBundle = await createBlankChain('Atomic Import Two');
    const nativeEnvelope = createNativeSaveEnvelope([firstBundle, secondBundle]);

    await resetDatabase();

    const branchesBulkPutSpy = vi.spyOn(db.branches, 'bulkPut').mockRejectedValueOnce(new Error('Injected bulkPut failure.'));

    let errorMessage = '';

    try {
      await importNativeSave(nativeEnvelope);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      branchesBulkPutSpy.mockRestore();
    }

    expect(errorMessage).toBe('Injected bulkPut failure.');
    const overviews = await listChainOverviews();
    expect(overviews).toHaveLength(0);
  });

  it('persists imported ChainMaker data and reloads preserved unresolved mappings', async () => {
    await resetDatabase();
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const savedBundle = await saveImportedChainBundle(session.bundle);
    const reloadedBundle = await getChainBundle(savedBundle.chain.id);

    expect(Boolean(reloadedBundle)).toBe(true);

    if (!reloadedBundle) {
      throw new Error('Expected imported ChainMaker bundle to reload.');
    }

    expect(reloadedBundle.jumpers).toHaveLength(1);
    expect(reloadedBundle.jumps).toHaveLength(1);
    expect(reloadedBundle.participations).toHaveLength(1);
    expect(reloadedBundle.importReports).toHaveLength(1);
    expect(
      reloadedBundle.importReports[0].unresolvedMappings.some((mapping) => mapping.path === 'topLevelPreservedBlocks'),
    ).toBe(true);
    expect(reloadedBundle.importReports[0].unresolvedMappings.length).toBe(
      session.importReport.unresolvedMappings.length,
    );
  });

  it('imports reviewed ChainMaker bundles into an existing chain as a staged branch', async () => {
    await resetDatabase();
    const targetBundle = await createBlankChain('Target Chain');
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const persistedBundle = await saveImportedChainBundle(session.bundle, {
      importMode: 'new-branch',
      targetChainId: targetBundle.chain.id,
      branchTitle: 'Imported Timeline',
    });
    const activeBranch = persistedBundle.branches.find((branch) => branch.id === persistedBundle.chain.activeBranchId);

    expect(persistedBundle.chain.id).toBe(targetBundle.chain.id);
    expect(persistedBundle.branches).toHaveLength(2);
    expect(activeBranch?.title).toBe('Imported Timeline');
    expect(persistedBundle.importReports.some((report) => report.importMode === 'new-branch')).toBe(true);
    expect(persistedBundle.jumpers).toHaveLength(1);
    expect(persistedBundle.jumps).toHaveLength(1);
  });

  it('stages new-jumper imports as non-destructive branches inside an existing chain', async () => {
    await resetDatabase();
    const targetBundle = await createBlankChain('Host Chain');
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const persistedBundle = await saveImportedChainBundle(session.bundle, {
      importMode: 'new-jumpers',
      targetChainId: targetBundle.chain.id,
      branchTitle: 'Imported Jumpers',
    });
    const activeBranch = persistedBundle.branches.find((branch) => branch.id === persistedBundle.chain.activeBranchId);

    expect(persistedBundle.chain.id).toBe(targetBundle.chain.id);
    expect(persistedBundle.branches).toHaveLength(2);
    expect(activeBranch?.title).toBe('Imported Jumpers');
    expect(activeBranch?.notes.includes('jumper staging branch')).toBe(true);
    expect(persistedBundle.importReports.some((report) => report.importMode === 'new-jumpers')).toBe(true);
  });

  it('exports a filtered single-branch native save', async () => {
    await resetDatabase();
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const savedBundle = await saveImportedChainBundle(session.bundle);
    const branchEnvelope = await exportBranchSave(savedBundle.chain.id, savedBundle.chain.activeBranchId);

    expect(branchEnvelope.chains).toHaveLength(1);
    expect(branchEnvelope.chains[0].branches).toHaveLength(1);
    expect(branchEnvelope.chains[0].branches[0].id).toBe(savedBundle.chain.activeBranchId);
    expect(branchEnvelope.chains[0].jumps).toHaveLength(savedBundle.jumps.length);
  });

  it('creates a snapshot and restores it into a new active branch', async () => {
    await resetDatabase();
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const savedBundle = await saveImportedChainBundle(session.bundle);
    const companion = {
      ...createBlankCompanion(savedBundle.chain.id, savedBundle.chain.activeBranchId),
      name: 'Snapshot Ally',
      parentJumperId: savedBundle.jumpers[0]?.id ?? null,
    };

    await saveChainRecord(db.companions, companion);

    const snapshot = await createSnapshotForBranch(
      savedBundle.chain.id,
      savedBundle.chain.activeBranchId,
      'Checkpoint',
      'Test restore point',
    );
    const restoredBranch = await restoreSnapshotAsBranch(savedBundle.chain.id, snapshot.id, 'Restored Timeline');
    const reloadedBundle = await getChainBundle(savedBundle.chain.id);

    expect(Boolean(reloadedBundle)).toBe(true);

    if (!reloadedBundle) {
      throw new Error('Expected reloaded bundle after snapshot restore.');
    }

    expect(reloadedBundle.branches).toHaveLength(2);
    expect(reloadedBundle.chain.activeBranchId).toBe(restoredBranch.id);
    expect(restoredBranch.id === savedBundle.chain.activeBranchId).toBe(false);

    const restoredJumpers = reloadedBundle.jumpers.filter((jumper) => jumper.branchId === restoredBranch.id);
    const restoredCompanions = reloadedBundle.companions.filter((entry) => entry.branchId === restoredBranch.id);

    expect(restoredCompanions).toHaveLength(1);
    expect(restoredJumpers).toHaveLength(1);
    expect(restoredCompanions[0].parentJumperId).toBe(restoredJumpers[0].id);
    expect(restoredCompanions[0].parentJumperId === savedBundle.jumpers[0]?.id).toBe(false);
  });

  it('touches the parent chain updated timestamp when a snapshot is created', async () => {
    await resetDatabase();
    const savedBundle = await createBlankChain('Snapshot Timestamp');

    await new Promise((resolve) => setTimeout(resolve, 20));
    await createSnapshotForBranch(savedBundle.chain.id, savedBundle.chain.activeBranchId, 'Checkpoint', 'Timestamp test');

    const reloadedBundle = await getChainBundle(savedBundle.chain.id);
    expect(reloadedBundle?.chain.updatedAt === savedBundle.chain.updatedAt).toBe(false);
  });

  it('rejects restoring a snapshot into a different chain', async () => {
    await resetDatabase();
    const firstBundle = await createBlankChain('First Chain');
    const secondBundle = await createBlankChain('Second Chain');
    const snapshot = await createSnapshotForBranch(firstBundle.chain.id, firstBundle.chain.activeBranchId, 'Foreign Snapshot', '');

    let errorMessage = '';

    try {
      await restoreSnapshotAsBranch(secondBundle.chain.id, snapshot.id);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toBe('Snapshot does not belong to the selected chain.');

    const reloadedSecondBundle = await getChainBundle(secondBundle.chain.id);
    expect(reloadedSecondBundle?.branches).toHaveLength(1);
    expect(reloadedSecondBundle?.chain.activeBranchId).toBe(secondBundle.chain.activeBranchId);
  });

  it('renders the home page with persisted chain list data after reload', async () => {
    await resetDatabase();
    await createBlankChain('Rendered Chain');

    const view = render(
      <UiPreferencesProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </UiPreferencesProvider>,
    );

    await waitFor(() => {
      expect((view.container.textContent ?? '').includes('Rendered Chain')).toBe(true);
    });

    view.unmount();
  });
});
