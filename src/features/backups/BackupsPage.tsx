import { useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { createBranchFromJump, createSnapshotForBranch, exportBranchSave, exportNativeSave, importNativeSave, restoreSnapshotAsBranch } from '../../db/persistence';
import { downloadJson } from '../../utils/download';
import { readJsonFile } from '../../utils/file';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery } from '../search/searchUtils';
import { StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export function BackupsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, bundle, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshotTitle, setSnapshotTitle] = useState('Checkpoint');
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [branchTitle, setBranchTitle] = useState('Forked Branch');
  const [branchJumpId, setBranchJumpId] = useState(workspace.currentJump?.id ?? workspace.jumps[workspace.jumps.length - 1]?.id ?? '');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const nativeImportInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const selectedSnapshotId = searchParams.get('snapshot');
  const filteredBranches = workspace.branches.filter((branch) => matchesSearchQuery(searchQuery, branch.title, branch.notes));
  const filteredSnapshots = workspace.snapshots
    .filter((snapshot) => matchesSearchQuery(searchQuery, snapshot.title, snapshot.description, snapshot.summary))
    .slice()
    .sort((left, right) => {
      if (selectedSnapshotId === left.id) {
        return -1;
      }

      if (selectedSnapshotId === right.id) {
        return 1;
      }

      return right.createdAt.localeCompare(left.createdAt);
    });

  async function handleExportFullChain() {
    try {
      const envelope = await exportNativeSave(chainId);
      downloadJson(`${toFileSlug(bundle.chain.title) || 'jumpchain-save'}.jumpchain.json`, envelope);
      setNotice({
        tone: 'success',
        message: 'Exported the full chain as a native save.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to export the full chain.',
      });
    }
  }

  async function handleExportActiveBranch() {
    if (!workspace.activeBranch) {
      return;
    }

    try {
      const envelope = await exportBranchSave(chainId, workspace.activeBranch.id);
      downloadJson(
        `${toFileSlug(bundle.chain.title)}-${toFileSlug(workspace.activeBranch.title)}.branch.jumpchain.json`,
        envelope,
      );
      setNotice({
        tone: 'success',
        message: 'Exported the active branch as a filtered native save.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to export the active branch.',
      });
    }
  }

  async function handleCreateSnapshot() {
    if (!workspace.activeBranch) {
      return;
    }

    try {
      await createSnapshotForBranch(chainId, workspace.activeBranch.id, snapshotTitle, snapshotDescription);
      setNotice({
        tone: 'success',
        message: 'Created a restorable snapshot for the active branch.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a snapshot.',
      });
    }
  }

  async function handleRestoreSnapshot(snapshotId: string) {
    try {
      const branch = await restoreSnapshotAsBranch(chainId, snapshotId);
      setNotice({
        tone: 'success',
        message: `Restored snapshot into new branch "${branch.title}".`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to restore snapshot.',
      });
    }
  }

  async function handleCreateBranch() {
    if (!workspace.activeBranch || !branchJumpId) {
      return;
    }

    try {
      const branch = await createBranchFromJump(chainId, workspace.activeBranch.id, branchJumpId, branchTitle);
      setNotice({
        tone: 'success',
        message: `Created branch "${branch.title}" from the selected jump.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create branch.',
      });
    }
  }

  async function handleNativeImportSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const raw = await readJsonFile(file);
      const detection = detectImportSource(raw);

      if (detection.sourceType !== 'native') {
        throw new Error('This file is not a native Jumpchain Tracker save.');
      }

      await importNativeSave(raw);
      setNotice({
        tone: 'success',
        message: `Imported "${file.name}" as non-destructive native copies.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to import native save.',
      });
    } finally {
      event.target.value = '';
    }
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Backups, Branches, and Recovery"
        description={
          simpleMode
            ? 'Safety tools for exports, snapshots, and branch forks. The main actions stay visible, and the ledgers stay tucked away until you want them.'
            : 'Full-chain export, branch-only export, native safe-copy import, branch forks, snapshots, and restore-to-new-branch flows.'
        }
        badge={workspace.activeBranch?.title ?? 'No branch'}
      />

      <StatusNoticeBanner notice={notice} />

      {simpleMode ? (
        <details className="details-panel">
          <summary className="details-panel__summary">
            <span>Find a branch or snapshot</span>
            <span className="pill">Optional</span>
          </summary>
          <div className="details-panel__body">
            <label className="field">
              <span>Search branches and snapshots</span>
              <input
                value={searchQuery}
                placeholder="branch titles, snapshot names, descriptions..."
                onChange={(event) =>
                  setSearchParams((currentParams) => {
                    const nextParams = new URLSearchParams(currentParams);

                    if (event.target.value.trim()) {
                      nextParams.set('search', event.target.value);
                    } else {
                      nextParams.delete('search');
                    }

                    return nextParams;
                  })
                }
              />
            </label>
          </div>
        </details>
      ) : (
        <section className="card stack stack--compact">
          <label className="field">
            <span>Search branches and snapshots</span>
            <input
              value={searchQuery}
              placeholder="branch titles, snapshot names, descriptions..."
              onChange={(event) =>
                setSearchParams((currentParams) => {
                  const nextParams = new URLSearchParams(currentParams);

                  if (event.target.value.trim()) {
                    nextParams.set('search', event.target.value);
                  } else {
                    nextParams.delete('search');
                  }

                  return nextParams;
                })
              }
            />
          </label>
        </section>
      )}

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>{simpleMode ? 'Safe copies' : 'Exports & Imports'}</h3>
            <span className="pill">Native envelope</span>
          </div>
          {simpleMode ? (
            <>
              <div className="actions">
                <button className="button" type="button" onClick={() => void handleExportFullChain()}>
                  Export Full Chain
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => nativeImportInputRef.current?.click()}
                >
                  Import Native Save
                </button>
              </div>
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>More backup actions</span>
                  <span className="pill">Optional</span>
                </summary>
                <div className="details-panel__body actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={!workspace.activeBranch}
                    onClick={() => void handleExportActiveBranch()}
                  >
                    Export Active Branch
                  </button>
                </div>
              </details>
            </>
          ) : (
            <div className="actions">
              <button className="button" type="button" onClick={() => void handleExportFullChain()}>
                Export Full Chain
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={!workspace.activeBranch}
                onClick={() => void handleExportActiveBranch()}
              >
                Export Active Branch
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => nativeImportInputRef.current?.click()}
              >
                Import Native Save
              </button>
            </div>
          )}
          <input
            ref={nativeImportInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleNativeImportSelection}
          />
          <p>
            {simpleMode
              ? 'These actions are safe. Imports create copies, and exports never change the stored chain.'
              : 'Native imports always create safe copies. Existing chains and branches are never overwritten.'}
          </p>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Fork Active Branch</h3>
            <span className="pill">{workspace.branches.length} total branches</span>
          </div>
          {simpleMode ? <p>Use this when you want to try a different path without changing the current line.</p> : null}
          <label className="field">
            <span>New branch title</span>
            <input value={branchTitle} onChange={(event) => setBranchTitle(event.target.value)} />
          </label>
          <label className="field">
            <span>Fork at jump</span>
            <select value={branchJumpId} onChange={(event) => setBranchJumpId(event.target.value)}>
              {workspace.jumps.map((jump) => (
                <option key={jump.id} value={jump.id}>
                  {jump.orderIndex + 1}. {jump.title}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button
              className="button"
              type="button"
              disabled={!workspace.activeBranch || !branchJumpId}
              onClick={() => void handleCreateBranch()}
            >
              Create Branch from Jump
            </button>
          </div>
        </article>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Snapshots</h3>
            <span className="pill">{workspace.snapshots.length} active-branch snapshots</span>
          </div>
          {simpleMode ? <p>Take a checkpoint before major edits. Restoring always creates a new branch instead of overwriting the current one.</p> : null}
          <label className="field">
            <span>Snapshot title</span>
            <input value={snapshotTitle} onChange={(event) => setSnapshotTitle(event.target.value)} />
          </label>
          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>Add a snapshot description</span>
                <span className="pill">Optional</span>
              </summary>
              <div className="details-panel__body">
                <label className="field">
                  <span>Description</span>
                  <textarea rows={4} value={snapshotDescription} onChange={(event) => setSnapshotDescription(event.target.value)} />
                </label>
              </div>
            </details>
          ) : (
            <label className="field">
              <span>Description</span>
              <textarea rows={4} value={snapshotDescription} onChange={(event) => setSnapshotDescription(event.target.value)} />
            </label>
          )}
          <div className="actions">
            <button
              className="button"
              type="button"
              disabled={!workspace.activeBranch}
              onClick={() => void handleCreateSnapshot()}
            >
              Create Snapshot
            </button>
          </div>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Branch Ledger</h3>
            <span className="pill">{filteredBranches.length} shown</span>
          </div>
          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>Show branch ledger</span>
                <span className="pill">{filteredBranches.length}</span>
              </summary>
              <div className="details-panel__body">
                {workspace.branches.length === 0 ? (
                  <p>No branches exist yet.</p>
                ) : filteredBranches.length === 0 ? (
                  <p>No branches match the current search.</p>
                ) : (
                  <ul className="list">
                    {filteredBranches.map((branch) => (
                      <li key={branch.id}>
                        <strong>
                          <SearchHighlight text={branch.title} query={searchQuery} />
                        </strong>
                        {branch.id === workspace.activeBranch?.id ? ' (active)' : ''}
                        {branch.forkedFromJumpId ? ' | forked from a jump' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ) : workspace.branches.length === 0 ? (
            <p>No branches exist yet.</p>
          ) : filteredBranches.length === 0 ? (
            <p>No branches match the current search.</p>
          ) : (
            <ul className="list">
              {filteredBranches.map((branch) => (
                <li key={branch.id}>
                  <strong>
                    <SearchHighlight text={branch.title} query={searchQuery} />
                  </strong>
                  {branch.id === workspace.activeBranch?.id ? ' (active)' : ''}
                  {branch.forkedFromJumpId ? ' | forked from a jump' : ''}
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Restore Snapshot into New Branch</h3>
          <span className="pill">{filteredSnapshots.length} shown</span>
        </div>
        {workspace.snapshots.length === 0 ? (
          <p>Create a snapshot first to make restore and rollback flows available.</p>
        ) : filteredSnapshots.length === 0 ? (
          <p>No snapshots match the current search.</p>
        ) : (
          <div className="grid">
            {filteredSnapshots.map((snapshot) => (
                <article className="entity-card" key={snapshot.id}>
                  <div className="section-heading">
                    <h4>
                      <SearchHighlight text={snapshot.title} query={searchQuery} />
                    </h4>
                    <span className="pill">{formatTimestamp(snapshot.createdAt)}</span>
                  </div>
                  <p>
                    <SearchHighlight text={snapshot.description || 'No snapshot description provided.'} query={searchQuery} />
                  </p>
                  {simpleMode ? (
                    <p>
                      {Number(snapshot.summary.jumpCount ?? 0)} jumps, {Number(snapshot.summary.jumperCount ?? 0)} jumpers, {Number(snapshot.summary.effectCount ?? 0)} effects.
                    </p>
                  ) : (
                    <div className="inline-meta">
                      <span className="metric">
                        <strong>{Number(snapshot.summary.jumpCount ?? 0)}</strong>
                        Jumps
                      </span>
                      <span className="metric">
                        <strong>{Number(snapshot.summary.jumperCount ?? 0)}</strong>
                        Jumpers
                      </span>
                      <span className="metric">
                        <strong>{Number(snapshot.summary.effectCount ?? 0)}</strong>
                        Effects
                      </span>
                    </div>
                  )}
                  <div className="entity-actions">
                    <button className="button button--secondary" type="button" onClick={() => void handleRestoreSnapshot(snapshot.id)}>
                      Restore Into New Branch
                    </button>
                  </div>
                </article>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
