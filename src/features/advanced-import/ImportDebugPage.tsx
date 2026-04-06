import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { prepareChainMakerV2ImportSession } from '../../domain/import/chainmakerV2';
import { prepareJumpSummaryTextImportSession } from '../../domain/import/jumpSummaryText';
import { detectImportSource } from '../../domain/import/sourceDetection';
import type { PreparedImportSession } from '../../domain/import/types';
import { getChainBundle, listChainOverviews, saveImportedChainBundle, type ChainOverview } from '../../db/persistence';
import sampleChainMaker from '../../fixtures/chainmaker/chainmaker-v2.sample.json';
import { readTextFile } from '../../utils/file';
import { ConfirmActionDialog } from '../workspace/shared';
import { createSafetySnapshot } from '../workspace/safety';

function summarizeReasons(reasons: string[]) {
  return reasons.join(' ');
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getNumericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface TargetJumperOption {
  id: string;
  name: string;
}

function canImportAsSingleJump(session: PreparedImportSession) {
  return (
    session.bundle.jumps.length === 1 &&
    session.bundle.participations.length === 1 &&
    session.bundle.jumpers.length === 1 &&
    session.bundle.companionParticipations.length === 0 &&
    session.bundle.companions.length === 0 &&
    session.bundle.effects.length === 0 &&
    session.bundle.bodymodProfiles.length === 0
  );
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
  const { simpleMode } = useUiPreferences();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { importSession, setImportSession } = useAppStore();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [availableChains, setAvailableChains] = useState<ChainOverview[]>([]);
  const [importMode, setImportMode] = useState<'new-chain' | 'new-branch' | 'new-jumpers' | 'single-jump'>('new-chain');
  const [targetChainId, setTargetChainId] = useState('');
  const [branchTitle, setBranchTitle] = useState('');
  const [targetJumperOptions, setTargetJumperOptions] = useState<TargetJumperOption[]>([]);
  const [targetJumperId, setTargetJumperId] = useState('');
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadChains() {
      const chains = await listChainOverviews();

      if (!cancelled) {
        setAvailableChains(chains);
      }
    }

    void loadChains();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (availableChains.length === 0) {
      if (importMode !== 'new-chain') {
        setImportMode('new-chain');
      }

      if (targetChainId !== '') {
        setTargetChainId('');
      }

      return;
    }

    if (!availableChains.some((chain) => chain.chainId === targetChainId)) {
      setTargetChainId(availableChains[0]?.chainId ?? '');
    }
  }, [availableChains, importMode, targetChainId]);

  useEffect(() => {
    if (!importSession) {
      return;
    }

    if (importMode === 'single-jump') {
      return;
    }

    const suggestedBranchTitle =
      importMode === 'new-jumpers'
        ? `Imported Jumpers: ${importSession.normalized.summary.chainName}`
        : `Imported Branch: ${importSession.normalized.summary.chainName}`;

    setBranchTitle((currentTitle) => currentTitle || suggestedBranchTitle);
  }, [importMode, importSession]);

  useEffect(() => {
    if (!importSession || importMode !== 'single-jump') {
      setTargetJumperOptions([]);
      setTargetJumperId('');
      return;
    }

    let cancelled = false;

    async function loadTargetJumpers() {
      if (!targetChainId) {
        setTargetJumperOptions([]);
        setTargetJumperId('');
        return;
      }

      const bundle = await getChainBundle(targetChainId);

      if (!bundle || cancelled) {
        return;
      }

      const options = bundle.jumpers
        .filter((jumper) => jumper.branchId === bundle.chain.activeBranchId)
        .map((jumper) => ({
          id: jumper.id,
          name: jumper.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

      if (cancelled) {
        return;
      }

      setTargetJumperOptions(options);
      setTargetJumperId((currentValue) =>
        options.some((option) => option.id === currentValue) ? currentValue : (options[0]?.id ?? ''),
      );
    }

    void loadTargetJumpers();

    return () => {
      cancelled = true;
    };
  }, [importMode, importSession, targetChainId]);

  useEffect(() => {
    if (!importSession || importMode !== 'single-jump') {
      return;
    }

    if (!canImportAsSingleJump(importSession)) {
      setImportMode('new-chain');
    }
  }, [importMode, importSession]);

  function loadRawSource(raw: unknown, label: string, fileName?: string) {
    const detection = detectImportSource(raw);

    if (detection.sourceType === 'native') {
      throw new Error(
        `Detected "${detection.sourceType}" instead of a supported external import source. ${summarizeReasons(detection.reasons)}`,
      );
    }

    let nextSession;

    if (detection.sourceType === 'chainmaker-v2') {
      if (!detection.isSupported) {
        throw new Error(`ChainMaker source version ${detection.sourceVersion ?? 'unknown'} is not supported yet.`);
      }

      nextSession = prepareChainMakerV2ImportSession(raw);
    } else if (detection.sourceType === 'jump-summary-text') {
      if (typeof raw !== 'string') {
        throw new Error('Jump summary text imports must be loaded from plain text.');
      }

      nextSession = prepareJumpSummaryTextImportSession(raw, {
        fileName,
      });
    } else {
      throw new Error(`Detected "${detection.sourceType}". ${summarizeReasons(detection.reasons)}`);
    }

    setImportSession(nextSession);
    setBranchTitle('');
    setStatusMessage(`Loaded ${label} and built a typed import session.`);
    setErrorMessage(null);
  }

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);
      let raw: unknown = text;

      try {
        raw = JSON.parse(text);
      } catch {
        raw = text;
      }

      loadRawSource(raw, `"${file.name}"`, file.name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the import file.');
      setStatusMessage(null);
    } finally {
      event.target.value = '';
    }
  }

  async function commitImport() {
    if (!importSession) {
      return;
    }

    if (importMode !== 'new-chain' && !targetChainId) {
      setErrorMessage('Choose a target chain for staged imports.');
      return;
    }

    if (importMode === 'single-jump' && !targetJumperId) {
      setErrorMessage('Choose a target jumper for the imported jump.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      let snapshotTitle: string | null = null;

      if (importMode !== 'new-chain') {
        const targetChain = availableChains.find((chain) => chain.chainId === targetChainId) ?? null;

        if (!targetChain) {
          throw new Error('Choose a valid target chain for staged imports.');
        }

        const snapshot = await createSafetySnapshot({
          chainId: targetChain.chainId,
          branchId: targetChain.activeBranchId,
          actionLabel:
            importMode === 'new-jumpers'
              ? 'Stage Imported Jumpers'
              : importMode === 'single-jump'
                ? 'Import Single Jump'
                : 'Import ChainMaker Branch',
          details:
            importMode === 'single-jump'
              ? 'Created before appending the reviewed imported jump onto an existing jumper.'
              : 'Created before staging reviewed import data into an existing chain.',
        });
        snapshotTitle = snapshot.title;
      }

      const persisted = await saveImportedChainBundle(importSession.bundle, {
        importMode,
        targetChainId: importMode === 'new-chain' ? undefined : targetChainId,
        branchTitle: importMode === 'new-chain' || importMode === 'single-jump' ? undefined : branchTitle,
        targetJumperId: importMode === 'single-jump' ? targetJumperId : undefined,
      });
      setImportSession(null);
      setStatusMessage(
        importMode === 'new-chain'
          ? `Imported "${persisted.chain.title}" into IndexedDB as a new chain.`
          : importMode === 'single-jump'
            ? `Imported one jump into "${persisted.chain.title}" on the selected existing jumper.${snapshotTitle ? ` "${snapshotTitle}" was created first.` : ''}`
          : `Imported into "${persisted.chain.title}" as a non-destructive staged branch.${snapshotTitle ? ` "${snapshotTitle}" was created first.` : ''}`,
      );
      setConfirmImportOpen(false);
      navigate(`/chains/${persisted.chain.id}/overview`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to commit imported chain.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleImportAsNewChain() {
    if (importMode === 'new-chain') {
      void commitImport();
      return;
    }

    setConfirmImportOpen(true);
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
  const singleJumpEligible = importSession ? canImportAsSingleJump(importSession) : false;
  const commitButtonLabel =
    importMode === 'new-chain'
      ? 'Import as new chain'
      : importMode === 'single-jump'
        ? 'Import jump onto existing jumper'
      : importMode === 'new-jumpers'
        ? 'Stage as jumper branch'
        : 'Import as branch';

  return (
    <div className="stack import-review">
      <section className="hero">
        <span className="pill">Import Review</span>
        <h2>Detect, normalize, review, then commit</h2>
        <p>
          {simpleMode
            ? 'Load a supported import file, review the important checks, then import it safely.'
            : 'This screen is the importer foundation layer. It detects supported external formats, normalizes them into the native bundle shape, preserves unmapped details, and only then writes anything into IndexedDB.'}
        </p>
        <div className="actions">
          <button className="button" type="button" onClick={() => fileInputRef.current?.click()}>
            Choose Import File
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              try {
                loadRawSource(sampleChainMaker, 'the bundled ChainMaker sample');
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
          accept="application/json,.json,text/plain,.txt"
          hidden
          onChange={handleFileSelection}
        />
      </section>

      {simpleMode ? (
        <details className="details-panel">
          <summary className="details-panel__summary">
            <span>Where imported perks and items go</span>
            <span className="pill">Help</span>
          </summary>
          <div className="details-panel__body">
            <p>
              After import, open a jump&apos;s Participation page. ChainMaker perk and item selections are already stored on
              each jumper&apos;s participation record under purchases, and the editor groups them into perks, items, and other
              purchases instead of hiding them behind raw JSON.
            </p>
          </div>
        </details>
      ) : (
        <section className="guidance-strip">
          <strong>Where imported perks and items end up</strong>
          <p>
            After import, open a jump&apos;s Participation page. ChainMaker perk and item selections are already stored on
            each jumper&apos;s participation record under purchases, and the editor groups them into perks, items, and other
            purchases instead of hiding them behind raw JSON.
          </p>
        </section>
      )}

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
                <strong>{importSession.normalized.summary.jumperCount}</strong>
                Jumpers
              </div>
              <div className="metric">
                <strong>{importSession.normalized.summary.jumpCount}</strong>
                Jumps
              </div>
              <div className="metric">
                <strong>{importSession.normalized.warnings.length + actionableMappings.length}</strong>
                Things to review
              </div>
              {simpleMode ? null : (
                <>
                  <div className="metric">
                    <strong>{importSession.sourceDetection.sourceVersion}</strong>
                    Detected version
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
                </>
              )}
            </div>
            {simpleMode ? (
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>Why this file was recognized</span>
                  <span className="pill">Optional</span>
                </summary>
                <div className="details-panel__body">
                  <p>{summarizeReasons(importSession.sourceDetection.reasons)}</p>
                </div>
              </details>
            ) : (
              <p>{summarizeReasons(importSession.sourceDetection.reasons)}</p>
            )}
            <div className="section-grid section-grid--two">
              <section className="section-surface stack stack--compact">
                <div className="editor-section__header">
                  <h4>Import Target</h4>
                  <span className="pill">{importMode}</span>
                </div>

                <label className="field">
                  <span>Commit mode</span>
                  <select
                    value={importMode}
                    onChange={(event) => {
                      setImportMode(event.target.value as typeof importMode);
                      setBranchTitle('');
                    }}
                  >
                    <option value="new-chain">New chain</option>
                    <option value="new-branch" disabled={availableChains.length === 0}>
                      Existing chain as branch
                    </option>
                    <option value="new-jumpers" disabled={availableChains.length === 0}>
                      Existing chain as jumper staging branch
                    </option>
                    <option value="single-jump" disabled={availableChains.length === 0 || !singleJumpEligible}>
                      Existing jumper on active branch
                    </option>
                  </select>
                </label>

                {importMode !== 'new-chain' ? (
                  <>
                    <label className="field">
                      <span>Target chain</span>
                      <select value={targetChainId} onChange={(event) => setTargetChainId(event.target.value)}>
                        {availableChains.map((chain) => (
                          <option key={chain.chainId} value={chain.chainId}>
                            {chain.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {importMode === 'single-jump' ? (
                      <>
                        <label className="field">
                          <span>Target jumper on active branch</span>
                          <select value={targetJumperId} onChange={(event) => setTargetJumperId(event.target.value)}>
                            {targetJumperOptions.map((jumper) => (
                              <option key={jumper.id} value={jumper.id}>
                                {jumper.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {targetJumperOptions.length === 0 ? (
                          <p className="editor-section__copy">
                            The target chain&apos;s active branch does not have any jumpers yet, so there is nowhere to attach this imported jump.
                          </p>
                        ) : null}
                        <p className="editor-section__copy">
                          This mode appends the imported jump onto the selected jumper in the target chain&apos;s active branch. To avoid disrupting the chain&apos;s current workspace, the imported jump is added as completed unless the branch has no jumps yet.
                        </p>
                      </>
                    ) : (
                      <>
                        <label className="field">
                          <span>Imported branch title</span>
                          <input value={branchTitle} onChange={(event) => setBranchTitle(event.target.value)} />
                        </label>
                        <p className="editor-section__copy">
                          {importMode === 'new-jumpers'
                            ? 'This mode stages the import as its own branch inside the existing chain so imported jumpers stay non-destructive until you decide how to merge them.'
                            : 'This mode imports the reviewed payload as a new branch inside an existing chain without overwriting any current data.'}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="editor-section__copy">
                    Commits this reviewed payload into IndexedDB as a standalone chain with its own mainline branch.
                  </p>
                )}
              </section>
              {simpleMode ? (
                <details className="details-panel">
                  <summary className="details-panel__summary">
                    <span>Imported content overview</span>
                    <span className="pill">Reference</span>
                  </summary>
                  <div className="details-panel__body section-grid section-grid--two">
                    <PreviewPanel
                      title="Jumpers"
                      items={jumperNames}
                      emptyMessage="No jumpers were found in the current import session."
                      previewLimit={5}
                    />
                    <PreviewPanel
                      title="Jumps"
                      items={jumpTitles}
                      emptyMessage="No jumps were found in the current import session."
                      previewLimit={5}
                    />
                    <PreviewPanel
                      title="Chain drawbacks and effects"
                      items={effectTitles}
                      emptyMessage="No chain-scoped drawbacks or effects were created from this source."
                      previewLimit={5}
                    />
                    <PreviewPanel
                      title="Preserved source blocks"
                      items={preservedTopLevelBlocks}
                      emptyMessage="Everything mapped into the current native contract."
                      previewLimit={5}
                    />
                    <PreviewPanel
                      title="Cleaner touched fields"
                      items={cleanerTouchedPaths}
                      emptyMessage="No source cleanup was required before validation."
                      previewLimit={5}
                    />
                  </div>
                </details>
              ) : (
                <>
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
                </>
              )}
            </div>
            <div className="actions">
              <button
                className="button"
                type="button"
                onClick={handleImportAsNewChain}
                disabled={isSaving || (importMode === 'single-jump' && targetJumperOptions.length === 0)}
              >
                {commitButtonLabel}
              </button>
            </div>
          </section>

          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>Import checks</span>
                <span className="pill">{importSession.normalized.warnings.length + actionableMappings.length}</span>
              </summary>
              <div className="details-panel__body section-grid section-grid--two">
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
              </div>
            </details>
          ) : (
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
          )}
        </>
      )}

      <ConfirmActionDialog
        open={confirmImportOpen}
        title={importMode === 'single-jump' ? 'Import this jump onto an existing jumper?' : 'Stage this import into an existing chain?'}
        description={
          importMode === 'single-jump'
            ? 'This will append the reviewed imported jump onto the selected jumper in the target chain.'
            : 'This will add the reviewed import as a new staged branch inside the selected chain.'
        }
        confirmLabel={commitButtonLabel}
        isBusy={isSaving}
        details={
          <p>
            A safety snapshot of the target chain&apos;s active branch will be created before the import is written.
          </p>
        }
        onCancel={() => setConfirmImportOpen(false)}
        onConfirm={() => void commitImport()}
      />
    </div>
  );
}
