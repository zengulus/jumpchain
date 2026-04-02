import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { createBlankChain, deleteChain, exportNativeSave, importNativeSave, listChainOverviews, type ChainOverview } from '../../db/persistence';
import { downloadJson } from '../../utils/download';
import { readJsonFile } from '../../utils/file';
import { ConfirmActionDialog, ReadinessPill } from '../workspace/shared';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getDefaultChainPath(chainId: string) {
  return `/chains/${chainId}/overview`;
}

function getSimpleChainStatus(chain: ChainOverview) {
  if (chain.jumperCount === 0) {
    return {
      tone: 'start' as const,
      label: 'Needs jumper',
      message: 'Add the first jumper before the character-focused pages have anyone to work with.',
    };
  }

  if (chain.jumpCount === 0) {
    return {
      tone: 'core' as const,
      label: 'Needs jump',
      message: 'Add the first jump to unlock current context and participation work.',
    };
  }

  return {
    tone: 'optional' as const,
    label: 'Ready',
    message: 'Open the chain and jump back into whichever module you want next.',
  };
}

export function HomePage() {
  const { simpleMode, lastVisitedChainId, getLastChainRoute } = useUiPreferences();
  const [chains, setChains] = useState<ChainOverview[]>([]);
  const [draftTitle, setDraftTitle] = useState('Untitled Chain');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [busyChainId, setBusyChainId] = useState<string | null>(null);
  const [pendingDeleteChain, setPendingDeleteChain] = useState<ChainOverview | null>(null);
  const draftTitleInputRef = useRef<HTMLInputElement | null>(null);
  const nativeImportInputRef = useRef<HTMLInputElement | null>(null);
  const totalJumpers = chains.reduce((total, chain) => total + chain.jumperCount, 0);
  const totalJumps = chains.reduce((total, chain) => total + chain.jumpCount, 0);
  const importedChainCount = chains.filter((chain) => chain.importReportCount > 0).length;
  const latestChain = chains[0] ?? null;
  const lastVisitedChain = lastVisitedChainId ? chains.find((chain) => chain.chainId === lastVisitedChainId) ?? null : null;
  const resumeChain = lastVisitedChain ?? latestChain;
  const resumePath = resumeChain ? getLastChainRoute(resumeChain.chainId, getDefaultChainPath(resumeChain.chainId)) : null;
  const resumeLabel = lastVisitedChain ? 'Resume Last Workspace' : 'Resume Latest Chain';

  async function refreshChains() {
    const nextChains = await listChainOverviews();
    setChains(nextChains);
  }

  useEffect(() => {
    void refreshChains();
  }, []);

  async function handleCreateBlankChain() {
    setIsBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const bundle = await createBlankChain(draftTitle);
      setStatusMessage(`Created "${bundle.chain.title}" in IndexedDB.`);
      await refreshChains();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create chain.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport(chainId: string, title: string) {
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const envelope = await exportNativeSave(chainId);
      downloadJson(`${toFileSlug(title) || 'jumpchain-save'}.jumpchain.json`, envelope);
      setStatusMessage(`Exported "${title}" as a versioned native save.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to export chain.');
    }
  }

  function handleDeleteChain(chain: ChainOverview) {
    setPendingDeleteChain(chain);
  }

  async function confirmDeleteChain() {
    if (!pendingDeleteChain) {
      return;
    }

    setBusyChainId(pendingDeleteChain.chainId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await deleteChain(pendingDeleteChain.chainId);
      setStatusMessage(`Deleted "${pendingDeleteChain.title}" and all chain-owned records from IndexedDB.`);
      await refreshChains();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete chain.');
    } finally {
      setPendingDeleteChain(null);
      setBusyChainId(null);
    }
  }

  async function handleNativeImportSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const raw = await readJsonFile(file);
      const detection = detectImportSource(raw);

      if (detection.sourceType !== 'native') {
        throw new Error('This file is not a native Jumpchain Tracker save. Use the Import Review page for ChainMaker JSON.');
      }

      await importNativeSave(raw);
      setStatusMessage(`Imported native save from "${file.name}".`);
      await refreshChains();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to import native save.');
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  return (
    <div className="home-shell stack">
      <section className="home-stage">
        <section className="hero hero--split">
          <div className="hero__content stack stack--compact">
            <h2>Jumpchain Tracker</h2>
            <p>
              {simpleMode
                ? 'Open a stored chain, create a new one, or import a trusted save.'
                : 'Local-first continuity tracking with wide module workspaces, snapshots, imports, and page-by-page supplement planning.'}
            </p>
            <div className="actions">
              {simpleMode ? (
                <>
                  <button className="button" type="button" onClick={() => draftTitleInputRef.current?.focus()} disabled={isBusy}>
                    Create Chain
                  </button>
                  {resumePath ? (
                    <Link className="button button--secondary" to={resumePath}>
                      {resumeLabel}
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
                  {resumePath ? (
                    <Link className="button" to={resumePath}>
                      {resumeLabel}
                    </Link>
                  ) : null}
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => nativeImportInputRef.current?.click()}
                    disabled={isBusy}
                  >
                    Import Native Save
                  </button>
                  <Link className="button button--secondary" to="/import">
                    Open Import Review
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hero__stats summary-grid">
            {simpleMode ? (
              <>
                <div className="metric">
                  <strong>{chains.length}</strong>
                  Stored chains
                </div>
                <div className="metric">
                  <strong>{resumeChain ? resumeChain.title : 'No chain yet'}</strong>
                  {lastVisitedChain ? 'Last workspace' : 'Latest chain'}
                </div>
              </>
            ) : (
              <>
                <div className="metric">
                  <strong>{chains.length}</strong>
                  Stored chains
                </div>
                <div className="metric">
                  <strong>{importedChainCount}</strong>
                  Imported chains
                </div>
                <div className="metric">
                  <strong>{totalJumpers}</strong>
                  Total jumpers
                </div>
                <div className="metric">
                  <strong>{totalJumps}</strong>
                  Total jumps
                </div>
              </>
            )}
          </div>
        </section>
      </section>

      <section className="home-dashboard-grid">
        <article className="card stack">
          <div className="section-heading">
            <h3>{simpleMode ? 'New chain' : 'New Chain'}</h3>
          </div>
          <label className="field">
            <span>Chain title</span>
            <input
              ref={draftTitleInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Untitled Chain"
            />
          </label>
          <button className="button" type="button" onClick={handleCreateBlankChain} disabled={isBusy}>
            Create Chain
          </button>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>{simpleMode ? 'Import a save' : 'Native Save'}</h3>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => nativeImportInputRef.current?.click()}
            disabled={isBusy}
          >
            Import Native Save
          </button>
          <input
            ref={nativeImportInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleNativeImportSelection}
          />
          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>Import other JSON</span>
                <span className="pill">Optional</span>
              </summary>
              <div className="details-panel__body stack stack--compact">
                <p>Use Import Review for external JSON that is not already a native Jumpchain Tracker save.</p>
                <Link className="button button--secondary" to="/import">
                  Open Import Review
                </Link>
              </div>
            </details>
          ) : (
            <Link className="button button--secondary" to="/import">
              Open Import Review
            </Link>
          )}
        </article>
      </section>

      {statusMessage ? <div className="status status--success">{statusMessage}</div> : null}
      {errorMessage ? <div className="status status--error">{errorMessage}</div> : null}

      <section className="card stack">
        <div className="section-heading">
          <h3>Stored Chains</h3>
          <span className="pill">{chains.length} total</span>
        </div>

        {chains.length === 0 ? (
          <p>No chains yet. Create one or import a save.</p>
        ) : (
          <div className="entity-grid entity-grid--two">
            {chains.map((chain) => {
              const simpleChainStatus = getSimpleChainStatus(chain);
              const defaultChainPath = getDefaultChainPath(chain.chainId);
              const resumeChainPath = getLastChainRoute(chain.chainId, defaultChainPath);
              const hasResumeContext = resumeChainPath !== defaultChainPath;

              return (
                <article className="entity-card" key={chain.chainId}>
                  <div className="section-heading">
                    <h4>{chain.title}</h4>
                    <span className="pill">{chain.importReportCount > 0 ? 'imported' : 'native'}</span>
                  </div>
                  {simpleMode ? (
                    <div className="home-chain-status">
                      <ReadinessPill tone={simpleChainStatus.tone} label={simpleChainStatus.label} />
                    </div>
                  ) : null}
                  {simpleMode ? (
                    <>
                      <p>
                        {chain.jumperCount} jumpers, {chain.jumpCount} jumps, last updated {formatTimestamp(chain.updatedAt)}.
                      </p>
                      <p className="home-chain-copy">{simpleChainStatus.message}</p>
                    </>
                  ) : (
                    <div className="inline-meta">
                      <span className="metric">
                        <strong>{chain.jumperCount}</strong>
                        Jumpers
                      </span>
                      <span className="metric">
                        <strong>{chain.jumpCount}</strong>
                        Jumps
                      </span>
                      <span className="metric">
                        <strong>{chain.importReportCount}</strong>
                        Import reports
                      </span>
                    </div>
                  )}
                  {!simpleMode ? <p>Last updated {formatTimestamp(chain.updatedAt)}</p> : null}
                  <div className="entity-actions">
                    <Link className="button" to={resumeChainPath}>
                      {simpleMode ? (hasResumeContext ? 'Resume Chain' : 'Open Chain') : hasResumeContext ? 'Resume Workspace' : 'Open Workspace'}
                    </Link>
                    {simpleMode ? (
                      <details className="details-panel">
                        <summary className="details-panel__summary">
                          <span>More actions</span>
                          <span className="pill">Optional</span>
                        </summary>
                        <div className="details-panel__body actions">
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => void handleExport(chain.chainId, chain.title)}
                            disabled={busyChainId === chain.chainId}
                          >
                            Export Native Save
                          </button>
                          <button
                            className="button button--danger"
                            type="button"
                            onClick={() => handleDeleteChain(chain)}
                            disabled={busyChainId === chain.chainId}
                          >
                            {busyChainId === chain.chainId ? 'Deleting...' : 'Delete Chain'}
                          </button>
                        </div>
                      </details>
                    ) : (
                      <>
                        <button
                          className="button button--secondary"
                          type="button"
                          onClick={() => void handleExport(chain.chainId, chain.title)}
                          disabled={busyChainId === chain.chainId}
                        >
                          Export Native Save
                        </button>
                        <button
                          className="button button--danger"
                          type="button"
                          onClick={() => handleDeleteChain(chain)}
                          disabled={busyChainId === chain.chainId}
                        >
                          {busyChainId === chain.chainId ? 'Deleting...' : 'Delete Chain'}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmActionDialog
        open={pendingDeleteChain !== null}
        tone="danger"
        title={pendingDeleteChain ? `Delete "${pendingDeleteChain.title}"?` : 'Delete chain?'}
        description="This removes the chain and its branches, snapshots, notes, and imported data from IndexedDB."
        confirmLabel="Delete Chain"
        isBusy={pendingDeleteChain ? busyChainId === pendingDeleteChain.chainId : false}
        details={<p>This action cannot be undone from inside the app after the chain is removed.</p>}
        onCancel={() => setPendingDeleteChain(null)}
        onConfirm={() => void confirmDeleteChain()}
      />
    </div>
  );
}
