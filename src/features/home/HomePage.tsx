import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { createBlankChain, deleteChain, exportNativeSave, importNativeSave, listChainOverviews, type ChainOverview } from '../../db/persistence';
import { downloadJson } from '../../utils/download';
import { readJsonFile } from '../../utils/file';
import { ReadinessPill } from '../workspace/shared';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getSimpleChainStatus(chain: ChainOverview) {
  if (chain.jumperCount === 0) {
    return {
      tone: 'start' as const,
      label: 'Start here',
      message: 'Guided setup is still waiting for the first jumper.',
    };
  }

  if (chain.jumpCount === 0) {
    return {
      tone: 'core' as const,
      label: 'Core setup',
      message: 'Guided setup can help create the first jump and set current context.',
    };
  }

  return {
    tone: 'optional' as const,
    label: 'Ready to explore',
    message: 'Overview is still the calmest place to re-enter this chain when you want a refresher.',
  };
}

export function HomePage() {
  const { simpleMode } = useUiPreferences();
  const [chains, setChains] = useState<ChainOverview[]>([]);
  const [draftTitle, setDraftTitle] = useState('Untitled Chain');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [busyChainId, setBusyChainId] = useState<string | null>(null);
  const draftTitleInputRef = useRef<HTMLInputElement | null>(null);
  const nativeImportInputRef = useRef<HTMLInputElement | null>(null);
  const totalJumpers = chains.reduce((total, chain) => total + chain.jumperCount, 0);
  const totalJumps = chains.reduce((total, chain) => total + chain.jumpCount, 0);
  const importedChainCount = chains.filter((chain) => chain.importReportCount > 0).length;
  const latestChain = chains[0] ?? null;

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

  async function handleDeleteChain(chain: ChainOverview) {
    const confirmed = window.confirm(
      `Delete "${chain.title}" from IndexedDB? This removes the chain, its branches, snapshots, notes, and imported data.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyChainId(chain.chainId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await deleteChain(chain.chainId);
      setStatusMessage(`Deleted "${chain.title}" and all chain-owned records from IndexedDB.`);
      await refreshChains();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete chain.');
    } finally {
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
                ? 'Start fresh if you are learning, or return to guided setup for a chain that already exists here. The more technical import tools can wait.'
                : 'Local-first continuity tracking with wide module workspaces, snapshots, imports, and page-by-page supplement planning.'}
            </p>
            <div className="actions">
              {simpleMode ? (
                <>
                  <button className="button" type="button" onClick={() => draftTitleInputRef.current?.focus()} disabled={isBusy}>
                    Start Blank Chain
                  </button>
                  {latestChain ? (
                    <Link className="button button--secondary" to={`/chains/${latestChain.chainId}/overview`}>
                      Continue Guided Setup
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
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
                  <strong>{latestChain ? latestChain.title : 'Start here'}</strong>
                  {latestChain ? 'Latest guided setup' : 'Create or open a chain'}
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
            <h3>{simpleMode ? 'Create a new chain' : 'New Chain'}</h3>
            {simpleMode ? <ReadinessPill tone="start" /> : null}
          </div>
          {simpleMode ? <p>Give the chain a name. You can change the details later once the workspace exists.</p> : null}
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
            Create Blank Chain
          </button>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>{simpleMode ? 'Already have data?' : 'Native Save'}</h3>
          </div>
          {simpleMode ? <p>Bring in a native save when you already trust the file. More technical import cleanup can stay tucked away.</p> : null}
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
                <span>Other import tools</span>
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
          <p>No chains are stored yet. Create a blank chain or import one from the review flow.</p>
        ) : (
          <div className="entity-grid entity-grid--two">
            {chains.map((chain) => {
              const simpleChainStatus = getSimpleChainStatus(chain);

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
                    <Link className="button" to={`/chains/${chain.chainId}/overview`}>
                      {simpleMode ? 'Open Guided Setup' : 'Open Workspace'}
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
                            onClick={() => void handleDeleteChain(chain)}
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
                          onClick={() => void handleDeleteChain(chain)}
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
    </div>
  );
}
