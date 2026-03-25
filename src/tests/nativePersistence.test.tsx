import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../features/home/HomePage';
import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import { db } from '../db/database';
import {
  createSnapshotForBranch,
  createBlankChain,
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
import { validateNativeChainBundle } from '../schemas';

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

  it('imports native saves as safe copies with remapped ids', async () => {
    await resetDatabase();
    const originalBundle = await createBlankChain('Safe Copy Chain');
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

    const persistedImportedBundle = await getChainBundle(importedBundle.chain.id);
    expect(Boolean(persistedImportedBundle)).toBe(true);

    if (!persistedImportedBundle) {
      throw new Error('Expected imported safe copy to be persisted.');
    }

    expect(persistedImportedBundle.chain.title).toBe('Safe Copy Chain');
    expect(persistedImportedBundle.branches).toHaveLength(1);
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
      reloadedBundle.importReports[0].unresolvedMappings.some((mapping) => mapping.path === 'purchaseCategories'),
    ).toBe(true);
    expect(reloadedBundle.importReports[0].unresolvedMappings.length).toBe(
      session.importReport.unresolvedMappings.length,
    );
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
  });

  it('renders the home page with persisted chain list data after reload', async () => {
    await resetDatabase();
    await createBlankChain('Rendered Chain');

    const view = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect((view.container.textContent ?? '').includes('Rendered Chain')).toBe(true);
    });

    view.unmount();
  });
});
