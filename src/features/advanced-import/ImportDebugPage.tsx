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

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getNumericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function PreviewPanel(props: { title: string; items: string[]; emptyMessage: string; previewLimit?: number }) {
  const previewLimit = props.previewLimit ?? 10;
  const visibleItems = props.items.slice(0, previewLimit);
  const hiddenCount = Math.max(0, props.items.length - visibleItems.length);

  return (
    <section className="section-surface stack stack--compact">
      <div className="editor-section__header">
        <h4>{props.title}</h4>
        <span className="pill">{props.items.length}</span>
      </div>
      {props.items.length === 0 ? (
        <p className="editor-section__empty">{props.emptyMessage}</p>
      ) : (
        <div className="token-list">
          {visibleItems.map((item, index) => (
            <span className="token" key={`${props.title}-${item}-${index}`}>
              {item}
            </span>
          ))}
          {hiddenCount > 0 ? <span className="token token--muted">+{hiddenCount} more</span> : null}
        </div>
      )}
    </section>
  );
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

  const jumperNames = importSession?.bundle.jumpers.map((jumper) => jumper.name) ?? [];
  const jumpTitles = importSession?.bundle.jumps.map((jump) => jump.title) ?? [];
  const effectTitles = importSession?.bundle.effects.map((effect) => effect.title) ?? [];
  const preservedTopLevelBlocks = getStringList(importSession?.importReport.preservedSourceSummary.topLevelBlocks);
  const purchaseCatalogCount = getNumericValue(importSession?.importReport.preservedSourceSummary.purchaseCatalogCount) ?? 0;
  const cleanerChangeCount = importSession?.cleaning.changes.length ?? 0;
  const cleanerTouchedPaths = getStringList(importSession?.importReport.preservedSourceSummary.cleanerTouchedPaths);
  const visibleWarnings = importSession?.normalized.warnings.slice(0, 12) ?? [];
  const hiddenWarningCount = Math.max(0, (importSession?.normalized.warnings.length ?? 0) - visibleWarnings.length);
  const actionableMappings = importSession?.normalized.unresolvedMappings.filter((mapping) => mapping.severity !== 'info') ?? [];
  const preservedSourceNotes = importSession?.normalized.unresolvedMappings.filter((mapping) => mapping.severity === 'info') ?? [];
  const visibleMappings = actionableMappings.slice(0, 12);
  const hiddenMappingCount = Math.max(0, actionableMappings.length - visibleMappings.length);
  const visibleSourceNotes = preservedSourceNotes.slice(0, 12);
  const hiddenSourceNoteCount = Math.max(0, preservedSourceNotes.length - visibleSourceNotes.length);
  const visibleCleanerChanges = importSession?.cleaning.changes.slice(0, 12) ?? [];
  const hiddenCleanerChangeCount = Math.max(0, cleanerChangeCount - visibleCleanerChanges.length);

  return (
    <div className="stack import-review">
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

      <section className="guidance-strip">
        <strong>Where imported perks and items end up</strong>
        <p>
          After import, open a jump&apos;s Participation page. ChainMaker perk and item selections are already stored on
          each jumper&apos;s participation record under purchases, and the editor groups them into perks, items, and other
          purchases instead of hiding them behind raw JSON.
        </p>
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
              <div className="metric">
                <strong>{importSession.normalized.summary.participationCount}</strong>
                Participations
              </div>
              <div className="metric">
                <strong>{purchaseCatalogCount}</strong>
                Preserved purchase catalog entries
              </div>
              <div className="metric">
                <strong>{cleanerChangeCount}</strong>
                Cleaner adjustments
              </div>
            </div>
            <p>{summarizeReasons(importSession.sourceDetection.reasons)}</p>
            <div className="section-grid section-grid--two">
              <PreviewPanel
                title="Jumpers"
                items={jumperNames}
                emptyMessage="No jumpers were found in the current import session."
              />
              <PreviewPanel
                title="Jumps"
                items={jumpTitles}
                emptyMessage="No jumps were found in the current import session."
              />
              <PreviewPanel
                title="Chain drawbacks and effects"
                items={effectTitles}
                emptyMessage="No chain-scoped drawbacks or effects were created from this source."
              />
              <PreviewPanel
                title="Preserved source blocks"
                items={preservedTopLevelBlocks}
                emptyMessage="Everything mapped into the current native contract."
              />
              <PreviewPanel
                title="Cleaner touched fields"
                items={cleanerTouchedPaths}
                emptyMessage="No source cleanup was required before validation."
              />
            </div>
            <div className="actions">
              <button className="button" type="button" onClick={() => void handleImportAsNewChain()} disabled={isSaving}>
                Import As New Chain
              </button>
            </div>
          </section>

          <section className="section-grid section-grid--two">
            <article className="section-surface stack">
              <div className="editor-section__header">
                <h3>Cleaner Adjustments</h3>
                <span className="pill">{cleanerChangeCount}</span>
              </div>
              {cleanerChangeCount === 0 ? (
                <p>No cleanup was required for this source payload.</p>
              ) : (
                <ul className="list">
                  {visibleCleanerChanges.map((change) => (
                    <li key={change.path}>
                      <strong>{change.path}</strong>: {change.reason}
                    </li>
                  ))}
                  {hiddenCleanerChangeCount > 0 ? (
                    <li>+{hiddenCleanerChangeCount} more cleaner adjustments were applied before validation.</li>
                  ) : null}
                </ul>
              )}
            </article>

            <article className="section-surface stack">
              <div className="editor-section__header">
                <h3>Warnings</h3>
                <span className="pill">{importSession.normalized.warnings.length}</span>
              </div>
              {importSession.normalized.warnings.length === 0 ? (
                <p>No warnings for the current sample.</p>
              ) : (
                <ul className="list">
                  {visibleWarnings.map((warning) => (
                    <li key={`${warning.code}-${warning.path ?? 'root'}`}>
                      <strong>{warning.code}</strong>: {warning.message}
                    </li>
                  ))}
                  {hiddenWarningCount > 0 ? <li>+{hiddenWarningCount} more warnings in the full import report.</li> : null}
                </ul>
              )}
            </article>

            <article className="section-surface stack">
              <div className="editor-section__header">
                <h3>Mapping Warnings</h3>
                <span className="pill">{actionableMappings.length}</span>
              </div>
              {actionableMappings.length === 0 ? (
                <p>Everything mapped cleanly for this file.</p>
              ) : (
                <ul className="list">
                  {visibleMappings.map((mapping) => (
                    <li key={mapping.path}>
                      <strong>{mapping.path}</strong>: {mapping.reason}
                    </li>
                  ))}
                  {hiddenMappingCount > 0 ? <li>+{hiddenMappingCount} more mapping warnings in the full import report.</li> : null}
                </ul>
              )}
            </article>

            <article className="section-surface stack">
              <div className="editor-section__header">
                <h3>Preserved Source Notes</h3>
                <span className="pill">{preservedSourceNotes.length}</span>
              </div>
              {preservedSourceNotes.length === 0 ? (
                <p>No informational preservation notes were recorded for this source.</p>
              ) : (
                <ul className="list">
                  {visibleSourceNotes.map((mapping) => (
                    <li key={mapping.path}>
                      <strong>{mapping.path}</strong>: {mapping.reason}
                    </li>
                  ))}
                  {hiddenSourceNoteCount > 0 ? (
                    <li>+{hiddenSourceNoteCount} more preserved-source notes in the full import report.</li>
                  ) : null}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
