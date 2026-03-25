import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { createBlankChain, deleteChain, exportNativeSave, importNativeSave, listChainOverviews, type ChainOverview } from '../../db/persistence';
import { downloadJson } from '../../utils/download';
import { readJsonFile } from '../../utils/file';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function HomePage() {
  const [chains, setChains] = useState<ChainOverview[]>([]);
  const [draftTitle, setDraftTitle] = useState('Untitled Chain');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [busyChainId, setBusyChainId] = useState<string | null>(null);
  const nativeImportInputRef = useRef<HTMLInputElement | null>(null);

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
            <div className="actions">
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
            </div>
          </div>
          <div className="hero__stats summary-grid">
            <div className="metric">
              <strong>{chains.length}</strong>
              Stored chains
            </div>
            <div className="metric">
              <strong>IndexedDB</strong>
              Authoritative store
            </div>
            <div className="metric">
              <strong>Native saves</strong>
              Portable round-trip
            </div>
            <div className="metric">
              <strong>ChainMaker v2</strong>
              Import foundation
            </div>
          </div>
        </section>
      </section>

      <section className="home-dashboard-grid">
        <article className="card stack">
          <div className="section-heading">
            <h3>New Chain</h3>
          </div>
          <label className="field">
            <span>Chain title</span>
            <input
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
            <h3>Native Save</h3>
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
            {chains.map((chain) => (
              <article className="entity-card" key={chain.chainId}>
                <div className="section-heading">
                  <h4>{chain.title}</h4>
                  <span className="pill">{chain.importReportCount > 0 ? 'imported' : 'native'}</span>
                </div>
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
                <p>Last updated {formatTimestamp(chain.updatedAt)}</p>
                <div className="entity-actions">
                  <Link className="button" to={`/chains/${chain.chainId}/overview`}>
                    Open Workspace
                  </Link>
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
