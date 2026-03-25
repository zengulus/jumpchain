import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { createBlankChain, exportNativeSave, importNativeSave, listChainOverviews, type ChainOverview } from '../../db/persistence';
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
    <div className="stack">
      <section className="hero">
        <span className="pill">Sprint 1 foundation</span>
        <h2>Native schema, IndexedDB persistence, and importer-first UI</h2>
        <p>
          This build is intentionally thin on presentation and heavy on real data flow. You can create blank chains,
          export native saves, import native saves, and run a ChainMaker v2 file through the review pipeline.
        </p>
        <div className="actions">
          <button className="button" type="button" onClick={handleCreateBlankChain} disabled={isBusy}>
            Create Blank Chain
          </button>
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
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Create Local Chain</h3>
            <span className="pill">IndexedDB authority</span>
          </div>
          <label className="field">
            <span>Chain title</span>
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Untitled Chain"
            />
          </label>
          <p>
            Blank chains start with a mainline branch and versioned native metadata so later migrations, branches,
            snapshots, and imports all have a stable base.
          </p>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Portable Save Flow</h3>
            <span className="pill">Native envelope</span>
          </div>
          <p>
            Exported files include format version, schema version, export timestamp, app version, and the full chain
            bundle. Native re-import writes back into IndexedDB without touching repository files.
          </p>
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
          <div className="grid">
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
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void handleExport(chain.chainId, chain.title)}
                  >
                    Export Native Save
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
