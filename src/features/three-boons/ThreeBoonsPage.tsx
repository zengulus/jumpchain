import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { getAltChainTrackedSupplementAvailability } from '../chainwide-rules/altChainBuilder';
import { createBlankEffect, deleteChainRecord, saveChainEntity, saveChainRecord } from '../workspace/records';
import { createSafetySnapshot } from '../workspace/safety';
import {
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  PlainLanguageHint,
  ReadinessPill,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  getThreeBoonsSelectionLimit,
  isThreeBoonsOptionRepeatable,
  threeBoonsCatalog,
  threeBoonsOptionsById,
  type ThreeBoonsOption,
} from './catalog';
import {
  applyThreeBoonsRoll,
  buildThreeBoonsSummary,
  buildThreeBoonsGeneratedEffectSpecs,
  clearThreeBoonsRollResult,
  getThreeBoonsBaseRollCount,
  getThreeBoonsChooseLimit,
  getThreeBoonsSelectionCount,
  getThreeBoonsGeneratedEffectBoonId,
  isThreeBoonsGeneratedEffect,
  readThreeBoonsState,
  rollThreeBoonsBoonSet,
  setThreeBoonsManualSelectionCount,
  writeThreeBoonsState,
} from './model';

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not rolled yet';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
}

function matchesSearch(option: ThreeBoonsOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return [option.title, option.description, option.note, String(option.number)]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getSelectionLimitLabel(option: ThreeBoonsOption) {
  if (option.rollOnly) {
    return 'Roll only';
  }

  const selectionLimit = getThreeBoonsSelectionLimit(option, false);

  if (typeof selectionLimit === 'number') {
    return selectionLimit === 1 ? 'Single pick' : `Up to ${selectionLimit} picks`;
  }

  return isThreeBoonsOptionRepeatable(option) ? 'Repeatable' : 'Single pick';
}

export function ThreeBoonsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save the Three Boons page.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const threeBoonsAvailability = getAltChainTrackedSupplementAvailability(draftChain, 'three-boons');
  const state = readThreeBoonsState(draftChain);
  const summary = buildThreeBoonsSummary(state);
  const manualSlotsRemaining = Math.max(0, getThreeBoonsChooseLimit() - summary.manualSelectionTotal);
  const filteredBoons = useMemo(
    () => threeBoonsCatalog.filter((option) => matchesSearch(option, searchQuery)),
    [searchQuery],
  );

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before using the Three Boons page." />;
  }

  const activeBranch = workspace.activeBranch;

  async function handlePostToChainwideEffects() {
    if (!activeBranch) {
      return;
    }

    const generatedSpecs = buildThreeBoonsGeneratedEffectSpecs(state);
    const existingGeneratedEffects = workspace.effects.filter(
      (effect) =>
        effect.scopeType === 'chain'
        && effect.ownerEntityType === 'chain'
        && effect.ownerEntityId === workspace.chain.id
        && isThreeBoonsGeneratedEffect(effect),
    );
    const desiredBoonIds = new Set(generatedSpecs.map((spec) => spec.boonId));
    const existingByBoonId = new Map<string, Effect>();

    for (const effect of existingGeneratedEffects) {
      const boonId = getThreeBoonsGeneratedEffectBoonId(effect);

      if (boonId) {
        existingByBoonId.set(boonId, effect);
      }
    }

    try {
      await saveChainEntity(draftChain);
      const snapshot = await createSafetySnapshot({
        chainId,
        branchId: activeBranch.id,
        actionLabel: 'Post Three Boons Entries',
        details: 'Created before syncing generated Three Boons entries into chainwide effects.',
      });

      for (const spec of generatedSpecs) {
        const existingEffect = existingByBoonId.get(spec.boonId);
        const nextEffect: Effect = existingEffect
          ? {
              ...existingEffect,
              title: spec.title,
              description: spec.description,
              category: spec.category,
              state: 'active',
              importSourceMetadata: spec.importSourceMetadata,
            }
          : {
              ...createBlankEffect(chainId, activeBranch.id, workspace.chain.id),
              title: spec.title,
              description: spec.description,
              category: spec.category,
              state: 'active',
              importSourceMetadata: spec.importSourceMetadata,
            };

        await saveChainRecord(db.effects, nextEffect);
      }

      for (const effect of existingGeneratedEffects) {
        const boonId = getThreeBoonsGeneratedEffectBoonId(effect);

        if (boonId && !desiredBoonIds.has(boonId)) {
          await deleteChainRecord(db.effects, effect.id, chainId);
        }
      }

      setNotice({
        tone: 'success',
        message:
          generatedSpecs.length > 0
            ? `Posted ${generatedSpecs.length} Three Boons entries into chainwide effects. "${snapshot.title}" was created first.`
            : `Removed previously generated Three Boons entries because no active boon set is recorded now. "${snapshot.title}" was created first.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to post Three Boons entries into chainwide effects.',
      });
    }
  }

  if (threeBoonsAvailability.locked) {
    return (
      <div className="stack">
        <WorkspaceModuleHeader
          title="Three Boons"
          description="This page is currently gated by the Alt-Chain Builder's Supplements picks for this branch."
          badge="Locked"
          actions={
            <>
              <Link className="button button--secondary" to={`/chains/${chainId}/alt-chain-builder`}>
                Open Alt-Chain Builder
              </Link>
              <Link className="button button--secondary" to={`/chains/${chainId}/overview`}>
                Chain Overview
              </Link>
            </>
          }
        />

        <section className="card stack">
          <div className="section-heading">
            <h3>Three Boons is locked for this branch</h3>
            <ReadinessPill tone="advanced" label="Builder-controlled" />
          </div>
          <p>Spend a Supplements pick on Three Boons in Alt-Chain Builder before editing or posting this page again.</p>
          <p>Any saved Three Boons selections are still preserved, and generated Three Boons effects stay hidden from rules surfaces while the supplement is locked.</p>
        </section>
      </div>
    );
  }

  function updateState(updater: (currentState: ReturnType<typeof readThreeBoonsState>) => ReturnType<typeof readThreeBoonsState>) {
    chainAutosave.updateDraft((currentChain) => {
      if (!currentChain) {
        return currentChain;
      }

      return writeThreeBoonsState(currentChain, updater(readThreeBoonsState(currentChain)));
    });
  }

  function handleModeChange(nextMode: 'choose' | 'roll') {
    updateState((currentState) => ({
      ...currentState,
      mode: nextMode,
    }));
  }

  function handleManualSelectionChange(boonId: string, nextCount: number) {
    const option = threeBoonsOptionsById[boonId];

    updateState((currentState) => setThreeBoonsManualSelectionCount(currentState, boonId, nextCount));

    if (option && nextCount > 0) {
      setNotice({
        tone: 'success',
        message: `${option.title} updated in choose mode.`,
      });
    }
  }

  function handleRoll() {
    const rollResult = rollThreeBoonsBoonSet();
    updateState((currentState) => applyThreeBoonsRoll(currentState, rollResult));
    setNotice({
      tone: 'success',
      message: `Recorded ${rollResult.acceptedRolls.length} resolved boon rolls with ${rollResult.rerollCount} automatic rerolls.`,
    });
  }

  function handleClearRoll() {
    updateState((currentState) => clearThreeBoonsRollResult(currentState));
    setNotice({
      tone: 'warning',
      message: 'Cleared the saved roll result. Choose mode picks were left alone.',
    });
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Three Boons"
        description={
          simpleMode
            ? 'Track the Super Sized Edition boon picks for this chain, either as three chosen boons or as a resolved roll set.'
            : 'A chain-level worksheet for the Three Boons of Jumpchain Alt-Chain Mode Super Sized Edition.'
        }
        badge={activeBranch.title}
        actions={
          <>
            <button className="button" type="button" onClick={() => void handlePostToChainwideEffects()}>
              Post To Chainwide Effects
            </button>
            <Link className="button button--secondary" to={`/chains/${chainId}/overview`}>
              Chain Overview
            </Link>
            <Link className="button button--secondary" to={`/chains/${chainId}/alt-chain-builder`}>
              Open Alt-Chain Builder
            </Link>
            <Link className="button button--secondary" to={`/chains/${chainId}/rules`}>
              Chainwide Rules
            </Link>
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />

      <details className="details-panel">
        <summary className="details-panel__summary">
          <span>Source Summary</span>
          <div className="inline-meta">
            <PlainLanguageHint
              term="Super Sized Edition"
              meaning="choose three boons manually, or give that up and resolve a four-roll random result with the source’s extra-roll boons."
            />
            <span className="pill">{getThreeBoonsChooseLimit()} chosen or {getThreeBoonsBaseRollCount()} rolled</span>
          </div>
        </summary>
        <div className="details-panel__body stack stack--compact">
          <p>
            The source offers two mutually exclusive entry paths for this page: choose three boons yourself, or roll
            four times on the thirty-boon table and accept the resulting set instead.
          </p>
          <p>
            Roll-only boons stay locked in choose mode. When a random result exceeds a boon’s allowed number of copies,
            this page rerolls it automatically, matching the closing note from the source text.
          </p>
        </div>
      </details>

      <section className="card stack">
        <div className="section-heading">
          <h3>Selection Summary</h3>
          <div className="inline-meta">
            <AutosaveStatusIndicator status={chainAutosave.status} />
            <span className="pill">{state.mode === 'roll' ? 'Roll mode' : 'Choose mode'}</span>
          </div>
        </div>

        <div className="summary-grid">
          <article className="metric">
            <strong>{summary.activeSelectionTotal}</strong>
            <span>{state.mode === 'roll' ? 'Active rolled boons' : 'Chosen boons'}</span>
          </article>
          <article className="metric">
            <strong>{summary.manualSelectionTotal}</strong>
            <span>Manual picks saved</span>
          </article>
          <article className="metric">
            <strong>{summary.rollSelectionTotal}</strong>
            <span>Rolled boons saved</span>
          </article>
          <article className="metric">
            <strong>{manualSlotsRemaining}</strong>
            <span>Choose-mode slots open</span>
          </article>
        </div>

        {summary.activeSelections.length > 0 ? (
          <div className="chip-grid">
            {summary.activeSelections.map(({ option, count }) => (
              <span className="pill pill--soft" key={option.id}>
                {option.title}{count > 1 ? ` x${count}` : ''}
              </span>
            ))}
          </div>
        ) : (
          <p className="editor-section__copy">No boon set is active yet.</p>
        )}

        {summary.warnings.length > 0 ? (
          <div className="stack stack--compact">
            {summary.warnings.map((warning) => (
              <div className="status status--warning" key={warning}>
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="section-surface stack">
        <div className="section-heading">
          <h3>Acquisition Mode</h3>
          <span className="pill">{state.mode === 'roll' ? 'Randomized' : 'Manual'}</span>
        </div>

        <div className="chip-grid">
          <button
            className={`choice-chip three-boons__mode-chip${state.mode === 'choose' ? ' is-active' : ''}`}
            type="button"
            onClick={() => handleModeChange('choose')}
          >
            <span>Choose {getThreeBoonsChooseLimit()}</span>
            <span>Pick the boons yourself.</span>
          </button>
          <button
            className={`choice-chip three-boons__mode-chip${state.mode === 'roll' ? ' is-active' : ''}`}
            type="button"
            onClick={() => handleModeChange('roll')}
          >
            <span>Roll {getThreeBoonsBaseRollCount()}d{threeBoonsCatalog.length}</span>
            <span>Resolve the source’s random route instead.</span>
          </button>
        </div>

        <p className="editor-section__copy">
          Switching modes only changes which saved set is treated as active. Manual picks and the latest roll result are both kept until you change or clear them.
        </p>

        <div className="actions">
          <button className="button" type="button" onClick={handleRoll}>
            {state.rollResult ? 'Reroll Boons' : 'Roll Boons'}
          </button>
          <button className="button button--secondary" type="button" onClick={handleClearRoll} disabled={!state.rollResult}>
            Clear Saved Roll
          </button>
        </div>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Roll History</h3>
          <span className="pill">{state.rollResult ? `${state.rollResult.acceptedRolls.length} accepted` : 'No roll yet'}</span>
        </div>

        <div className="summary-grid">
          <article className="metric">
            <strong>{state.rollResult?.acceptedRolls.length ?? 0}</strong>
            <span>Accepted rolls</span>
          </article>
          <article className="metric">
            <strong>{summary.extraRollCount}</strong>
            <span>Extra rolls granted</span>
          </article>
          <article className="metric">
            <strong>{state.rollResult?.rerollCount ?? 0}</strong>
            <span>Auto-rerolls</span>
          </article>
          <article className="metric">
            <strong>{formatTimestamp(state.rollResult?.rolledAt ?? null)}</strong>
            <span>Last roll</span>
          </article>
        </div>

        {state.rollResult?.acceptedRolls.length ? (
          <div className="selection-editor-list">
            {state.rollResult.acceptedRolls.map((entry) => {
              const option = threeBoonsOptionsById[entry.boonId];

              if (!option) {
                return null;
              }

              return (
                <article className="selection-editor three-boons__roll-entry" key={`${entry.step}-${entry.boonId}`}>
                  <div className="selection-editor__header">
                    <div className="stack stack--compact">
                      <strong>Roll {entry.step}: #{option.number} {option.title}</strong>
                      <p className="editor-section__copy">{option.description}</p>
                    </div>
                    <div className="inline-meta">
                      <span className="pill pill--soft">Owned: {entry.totalOwnedAfterRoll}</span>
                      {entry.extraRollsGranted > 0 ? <span className="pill">+{entry.extraRollsGranted} rolls</span> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="editor-section__copy">Use the roll action above when this chain is taking the random route instead of choosing boons manually.</p>
        )}
      </section>

      <section className="section-surface stack">
        <div className="section-heading">
          <h3>Chain Notes</h3>
          <span className="pill">Saved on the chain</span>
        </div>

        <label className="field">
          <span>Interpretation notes</span>
          <textarea
            rows={4}
            value={state.notes}
            onChange={(event) =>
              updateState((currentState) => ({
                ...currentState,
                notes: event.target.value,
              }))
            }
          />
        </label>
      </section>

      <section className="stack">
        <div className="section-heading">
          <h3>Boon Catalog</h3>
          <div className="inline-meta">
            <span className="pill">{filteredBoons.length} shown</span>
            <span className="pill pill--soft">30 total</span>
          </div>
        </div>

        <label className="field">
          <span>Search boons</span>
          <input
            type="search"
            placeholder="Search by number, title, or rule text..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <div className="selection-editor-list">
          {filteredBoons.map((option) => {
            const manualCount = getThreeBoonsSelectionCount(state.manualSelectionCounts, option.id);
            const activeCount = getThreeBoonsSelectionCount(summary.activeSelectionCounts, option.id);
            const selectionLimit = getThreeBoonsSelectionLimit(option, false);
            const canIncrease =
              !option.rollOnly
              && manualSlotsRemaining > 0
              && (typeof selectionLimit !== 'number' || manualCount < selectionLimit);
            const canDecrease = manualCount > 0;
            const selectedInActiveSet = activeCount > 0;

            return (
              <article
                className={`selection-editor three-boons__option${selectedInActiveSet ? ' is-selected' : ''}${option.rollOnly ? ' is-roll-only' : ''}`}
                key={option.id}
              >
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>#{option.number} {option.title}</strong>
                    <p className="editor-section__copy">{option.description}</p>
                  </div>
                  <div className="inline-meta three-boons__option-meta">
                    <span className="pill pill--soft">{getSelectionLimitLabel(option)}</span>
                    <span className={`pill three-boons__state-pill${selectedInActiveSet ? ' is-selected' : ''}`}>
                      {selectedInActiveSet ? `Active${activeCount > 1 ? ` x${activeCount}` : ''}` : 'Inactive'}
                    </span>
                  </div>
                </div>

                {option.note ? <p className="field-hint">{option.note}</p> : null}

                {option.rollOnly ? (
                  <p className="editor-section__copy">This boon can only be obtained through random rolling.</p>
                ) : (
                  <div className="three-boons__count-row">
                    <div className="three-boons__count-controls">
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => handleManualSelectionChange(option.id, manualCount - 1)}
                        disabled={!canDecrease}
                      >
                        -
                      </button>
                      <span className="pill pill--soft">{manualCount}</span>
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={() => handleManualSelectionChange(option.id, manualCount + 1)}
                        disabled={!canIncrease}
                      >
                        +
                      </button>
                    </div>
                    <span className="editor-section__copy">
                      {state.mode === 'choose'
                        ? `${manualSlotsRemaining} choose-mode slots still open.`
                        : 'Manual picks stay saved even while roll mode is active.'}
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
