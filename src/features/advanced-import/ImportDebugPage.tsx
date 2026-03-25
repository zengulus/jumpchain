import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store';
import { prepareChainMakerV2ImportSession } from '../../domain/import/chainmakerV2';
import { detectImportSource } from '../../domain/import/sourceDetection';
import { saveImportedChainBundle } from '../../db/persistence';
import sampleChainMaker from '../../fixtures/chainmaker/chainmaker-v2.sample.json';
import { readJsonFile } from '../../utils/file';

function summarizeReasons(reasons: string[]) {
  return reasons.join(' ');
}

export function ImportDebugPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { importSession, setImportSession } = useAppStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function loadRawSource(raw: unknown, label: string) {
    const detection = detectImportSource(raw);

    if (detection.sourceType !== 'chainmaker-v2') {
      throw new Error(
        `Detected "${detection.sourceType}" instead of ChainMaker v2. ${summarizeReasons(detection.reasons)}`,
      );
    }

    if (!detection.isSupported) {
      throw new Error(`ChainMaker source version ${detection.sourceVersion ?? 'unknown'} is not supported yet.`);
    }

    const nextSession = prepareChainMakerV2ImportSession(raw);
    setImportSession(nextSession);
    setStatusMessage(`Loaded ${label} and built a typed import session.`);
    setErrorMessage(null);
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const raw = await readJsonFile(file);
      loadRawSource(raw, `"${file.name}"`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load ChainMaker file.');
      setStatusMessage(null);
    } finally {
      event.target.value = '';
    }
  }

  async function handleImportAsNewChain() {
    if (!importSession) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const persisted = await saveImportedChainBundle(importSession.bundle);
      setImportSession(null);
      setStatusMessage(`Imported "${persisted.chain.title}" into IndexedDB as a new chain.`);
      navigate(`/chains/${persisted.chain.id}/overview`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to commit imported chain.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="stack">
      <section className="hero">
        <span className="pill">ChainMaker v2 adapter</span>
        <h2>Detect, normalize, review, then commit</h2>
        <p>
          This screen is the importer foundation layer. It runs a real JSON payload through source detection, DTO
          validation, normalized mapping, unresolved-field preservation, and native bundle generation before anything
          touches IndexedDB.
        </p>
        <div className="actions">
          <button className="button" type="button" onClick={() => fileInputRef.current?.click()}>
            Choose ChainMaker JSON
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              try {
                loadRawSource(sampleChainMaker, 'the bundled sample fixture');
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Unable to load bundled sample.');
              }
            }}
          >
            Load Bundled Sample
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setImportSession(null)}
            disabled={!importSession}
          >
            Clear Review
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleFileSelection}
        />
      </section>

      {statusMessage ? <div className="status status--success">{statusMessage}</div> : null}
      {errorMessage ? <div className="status status--error">{errorMessage}</div> : null}

      {!importSession ? (
        <section className="card stack">
          <h3>No import loaded</h3>
          <p>
            Select a ChainMaker export or load the bundled fixture to see the typed debug summary and unresolved
            mapping report.
          </p>
        </section>
      ) : (
        <>
          <section className="card stack">
            <div className="section-heading">
              <h3>Debug Summary</h3>
              <span className="pill">{importSession.sourceDetection.sourceVersion}</span>
            </div>
            <div className="grid grid--two">
              <div className="metric">
                <strong>{importSession.normalized.summary.chainName}</strong>
                Chain name
              </div>
              <div className="metric">
                <strong>{importSession.sourceDetection.sourceVersion}</strong>
                Detected version
              </div>
              <div className="metric">
                <strong>{importSession.normalized.summary.jumperCount}</strong>
                Jumpers
              </div>
              <div className="metric">
                <strong>{importSession.normalized.summary.jumpCount}</strong>
                Jumps
              </div>
              <div className="metric">
                <strong>{importSession.normalized.summary.chainDrawbackCount}</strong>
                Chain drawbacks
              </div>
              <div className="metric">
                <strong>{importSession.normalized.summary.altformCount}</strong>
                Altforms
              </div>
            </div>
            <p>{summarizeReasons(importSession.sourceDetection.reasons)}</p>
            <div className="actions">
              <button className="button" type="button" onClick={() => void handleImportAsNewChain()} disabled={isSaving}>
                Import As New Chain
              </button>
            </div>
          </section>

          <section className="grid grid--two">
            <article className="card stack">
              <div className="section-heading">
                <h3>Warnings</h3>
                <span className="pill">{importSession.normalized.warnings.length}</span>
              </div>
              {importSession.normalized.warnings.length === 0 ? (
                <p>No warnings for the current sample.</p>
              ) : (
                <ul className="list">
                  {importSession.normalized.warnings.map((warning) => (
                    <li key={`${warning.code}-${warning.path ?? 'root'}`}>
                      <strong>{warning.code}</strong>: {warning.message}
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="card stack">
              <div className="section-heading">
                <h3>Unresolved Mappings</h3>
                <span className="pill">{importSession.normalized.unresolvedMappings.length}</span>
              </div>
              {importSession.normalized.unresolvedMappings.length === 0 ? (
                <p>Everything mapped cleanly for this file.</p>
              ) : (
                <ul className="list">
                  {importSession.normalized.unresolvedMappings.map((mapping) => (
                    <li key={mapping.path}>
                      <strong>{mapping.path}</strong>: {mapping.reason}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
