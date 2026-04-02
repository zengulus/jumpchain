import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { getActiveChainDrawbackBudgetContributions, getChainDrawbackBudgetGrants } from '../../domain/chain/selectors';
import { effectCategories, effectStates } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { createBlankEffect, deleteChainRecord, saveChainEntity, saveChainRecord } from '../workspace/records';
import {
  ALT_CHAIN_EXCHANGE_RATE_CONFIGS,
  ALT_CHAIN_STARTING_POINT_CONFIGS,
  altChainExchangeRates,
  altChainStartingPoints,
  describeAltChainBuilderSelection,
  formatAltChainBuilderSelection,
  hasAltChainBuilderBeenUsed,
  parseAltChainBuilderState,
  updateAltChainBuilderMetadata,
  type AltChainBuilderState,
} from './altChainBuilder';
import {
  AdvancedJsonDetails,
  AssistiveHint,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  PlainLanguageHint,
  ReadinessPill,
  SimpleModeGuideFrame,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import {
  SIMPLE_MODE_GUIDE_DEFAULT_KEY,
  getFirstIncompleteGuideStep,
  markGuideStepAcknowledged,
  readGuideRequested,
  setGuideCurrentStep,
  setGuideDismissed,
  updateGuideSearchParams,
  type ChainwideRulesGuideStepId,
  type SimpleModePageGuideState,
} from '../workspace/simpleModeGuides';
import { mergeAutosaveStatuses, useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type ChainwideCategoryFilter = 'all' | Effect['category'];
const CUSTOM_BUDGET_CURRENCY = '__custom__';
const CHAINWIDE_RULES_GUIDE_STEPS: Array<{ id: ChainwideRulesGuideStepId; label: string; description: string }> = [
  {
    id: 'enable-builder',
    label: 'Enable Builder',
    description: 'Start the Alt-Chain builder scaffold for this branch before you worry about the individual standing rules.',
  },
  {
    id: 'starting-point',
    label: 'Starting Point',
    description: 'Pick the branch baseline the builder starts from before you exchange complications for accommodations.',
  },
  {
    id: 'exchange-rate-and-notes',
    label: 'Exchange Rate',
    description: 'Choose how complications convert into accommodations, then capture any chain-specific notes that matter.',
  },
  {
    id: 'drawbacks',
    label: 'Chain Drawbacks',
    description: 'Finish by reviewing or creating the standing chainwide drawbacks that represent the builder complications you want to keep active.',
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatNumericValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatBudgetCurrencyLabel(currencyKey: string) {
  if (currencyKey === '0') {
    return 'Choice Points (CP)';
  }

  return currencyKey;
}

function getSingleBudgetGrant(effect: Effect) {
  const [currencyKey, amount] = Object.entries(getChainDrawbackBudgetGrants(effect))[0] ?? ['0', 0];
  return {
    currencyKey,
    amount,
  };
}

function setEffectBudgetGrant(effect: Effect, currencyKey: string, amount: number) {
  const metadata: Record<string, unknown> = {
    ...asRecord(effect.importSourceMetadata),
    budgetGrants: {
      [currencyKey]: amount,
    },
  };

  delete metadata.cpGrant;

  return {
    ...effect,
    importSourceMetadata: metadata,
  };
}

function isChainwideEffect(effect: Effect, chainId: string) {
  return effect.scopeType === 'chain' && effect.ownerEntityType === 'chain' && effect.ownerEntityId === chainId;
}

export function ChainwideRulesPage() {
  const { simpleMode, getChainGuideState, updateChainGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ChainwideCategoryFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const guideRequested = readGuideRequested(searchParams);
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save chainwide rule settings.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const chainwideEffects = workspace.effects.filter((effect) => isChainwideEffect(effect, workspace.chain.id));
  const activeBudgetContributions = getActiveChainDrawbackBudgetContributions(workspace);
  const chainwideDrawbackCount = chainwideEffects.filter((effect) => effect.category === 'drawback').length;
  const chainwideRuleCount = chainwideEffects.filter((effect) => effect.category === 'rule').length;
  const activeChoicePointGrant = activeBudgetContributions.reduce(
    (total, contribution) => total + (contribution.budgetGrants['0'] ?? 0),
    0,
  );
  const altChainBuilder = parseAltChainBuilderState(asRecord(draftChain.importSourceMetadata).altChainBuilder);
  const altChainStartingPoint = ALT_CHAIN_STARTING_POINT_CONFIGS[altChainBuilder.startingPoint];
  const altChainExchangeRate = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[altChainBuilder.exchangeRate];
  const chainwideGuideState = getChainGuideState(chainId, 'chainwide-rules', SIMPLE_MODE_GUIDE_DEFAULT_KEY);
  const currentGuideStepId = getFirstIncompleteGuideStep(
    CHAINWIDE_RULES_GUIDE_STEPS.map((step) => step.id),
    chainwideGuideState,
    (stepId) => chainwideGuideState.acknowledgedStepIds.includes(stepId),
  ) as ChainwideRulesGuideStepId | null;
  const shouldAutoOpenGuide =
    !chainwideGuideState.dismissed &&
    chainwideGuideState.updatedAt === null &&
    !hasAltChainBuilderBeenUsed(altChainBuilder);
  const activeGuideVisible = Boolean(currentGuideStepId) && !chainwideGuideState.dismissed && (guideRequested || shouldAutoOpenGuide);
  const guidedDrawbackStepActive = activeGuideVisible && currentGuideStepId === 'drawbacks';
  const visibleCategoryFilter = guidedDrawbackStepActive ? 'drawback' : categoryFilter;
  const filteredEffects = chainwideEffects.filter(
    (effect) => visibleCategoryFilter === 'all' || effect.category === visibleCategoryFilter,
  );
  const selectedEffect = filteredEffects.find((effect) => effect.id === selectedEffectId) ?? filteredEffects[0] ?? null;
  const showCategoryFilter = chainwideEffects.length > 1 || categoryFilter !== 'all' || guidedDrawbackStepActive;
  const effectAutosave = useAutosaveRecord(selectedEffect, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.effects, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save the chainwide rule entry.'),
  });
  const autosaveStatus = mergeAutosaveStatuses([chainAutosave.status, effectAutosave.status]);
  const draftEffect = effectAutosave.draft ?? selectedEffect;

  useEffect(() => {
    if (!shouldAutoOpenGuide || guideRequested) {
      return;
    }

    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, true));
  }, [guideRequested, setSearchParams, shouldAutoOpenGuide]);

  function updateChainSetting<K extends keyof typeof draftChain.chainSettings>(key: K, value: (typeof draftChain.chainSettings)[K]) {
    chainAutosave.updateDraft({
      ...draftChain,
      chainSettings: {
        ...draftChain.chainSettings,
        [key]: value,
      },
    });
  }

  function updateAltChainBuilder(nextValue: AltChainBuilderState) {
    chainAutosave.updateDraft({
      ...draftChain,
      importSourceMetadata: updateAltChainBuilderMetadata(asRecord(draftChain.importSourceMetadata), nextValue),
    });
  }

  function updateAltChainBuilderField<K extends keyof AltChainBuilderState>(key: K, value: AltChainBuilderState[K]) {
    updateAltChainBuilder({
      ...altChainBuilder,
      [key]: value,
    });
  }

  function updateChainwideGuideState(
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) {
    updateChainGuideState(chainId, 'chainwide-rules', SIMPLE_MODE_GUIDE_DEFAULT_KEY, updater);
  }

  function setGuideRequestedState(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  function handleGuideDismiss() {
    updateChainwideGuideState((current) => setGuideDismissed(current, true));
    setGuideRequestedState(false);
  }

  function handleGuideStepChange(nextStepId: ChainwideRulesGuideStepId) {
    updateChainwideGuideState((current) => setGuideCurrentStep(current, nextStepId));
  }

  function handleReopenGuide() {
    const stepId = currentGuideStepId ?? 'drawbacks';
    updateChainwideGuideState((current) => setGuideCurrentStep(setGuideDismissed(current, false), stepId));
    setGuideRequestedState(true);
  }

  function handleGuideContinue() {
    if (!currentGuideStepId) {
      return;
    }

    if (currentGuideStepId === 'enable-builder') {
      if (!altChainBuilder.enabled) {
        updateAltChainBuilderField('enabled', true);
      }

      updateChainwideGuideState((current) =>
        setGuideCurrentStep(markGuideStepAcknowledged(current, 'enable-builder'), 'starting-point'),
      );
      return;
    }

    if (currentGuideStepId === 'starting-point') {
      updateChainwideGuideState((current) =>
        setGuideCurrentStep(markGuideStepAcknowledged(current, 'starting-point'), 'exchange-rate-and-notes'),
      );
      return;
    }

    if (currentGuideStepId === 'exchange-rate-and-notes') {
      updateChainwideGuideState((current) =>
        setGuideCurrentStep(markGuideStepAcknowledged(current, 'exchange-rate-and-notes'), 'drawbacks'),
      );
      return;
    }

    updateChainwideGuideState((current) =>
      setGuideDismissed(setGuideCurrentStep(markGuideStepAcknowledged(current, 'drawbacks'), 'drawbacks'), true),
    );
    setGuideRequestedState(false);
  }

  function updateSelectedEffect(nextValue: Effect | null) {
    if (!nextValue) {
      return;
    }

    effectAutosave.updateDraft(nextValue);
  }

  async function handleCreateChainwideEffect(category: Effect['category']) {
    if (!workspace.activeBranch) {
      return;
    }

    const effect = {
      ...createBlankEffect(chainId, workspace.activeBranch.id, workspace.chain.id),
      title: category === 'drawback' ? 'New Chain Drawback' : category === 'rule' ? 'New Chain Rule' : 'New Chain Effect',
      category,
    };

    try {
      await saveChainRecord(db.effects, effect);
      setSelectedEffectId(effect.id);
      setNotice({
        tone: 'success',
        message: `Created a ${category} entry for the active chain.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a chainwide rule entry.',
      });
    }
  }

  async function handleDeleteEffect() {
    if (!selectedEffect) {
      return;
    }

    try {
      await deleteChainRecord(db.effects, selectedEffect.id, chainId);
      setSelectedEffectId(null);
      setNotice({
        tone: 'success',
        message: 'Chainwide rule entry deleted.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete the chainwide rule entry.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before editing chainwide rules." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Chainwide Rules"
        description={
          simpleMode
            ? 'Manage the branch-wide rule baseline, Alt-Chain progression, and drawbacks that should follow the whole branch.'
            : 'Chain-level rule flags, Alt-Chain progression, chainwide drawbacks, and branch-visible chain-owned rule effects live here.'
        }
        badge={`${chainwideEffects.length} entries`}
        actions={
          !activeGuideVisible ? (
            <>
              <button className="button button--secondary" type="button" onClick={handleReopenGuide}>
                Reopen Builder Flow
              </button>
              <Link className="button button--secondary" to={`/chains/${chainId}/current-jump-rules`}>
                Open Current Jump Rules
              </Link>
              <button className="button" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                Add Chain Drawback
              </button>
              <button className="button button--secondary" type="button" onClick={() => void handleCreateChainwideEffect('rule')}>
                Add Chain Rule
              </button>
            </>
          ) : undefined
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={autosaveStatus} />

      {activeGuideVisible ? (
        <SimpleModeGuideFrame
          title="Alt-Chain builder flow"
          steps={CHAINWIDE_RULES_GUIDE_STEPS}
          currentStepId={currentGuideStepId!}
          acknowledgedStepIds={chainwideGuideState.acknowledgedStepIds}
          onStepChange={(stepId) => handleGuideStepChange(stepId as ChainwideRulesGuideStepId)}
          onDismiss={handleGuideDismiss}
        >
          <div className="stack stack--compact">
            {currentGuideStepId === 'enable-builder' ? (
              <p>
                This flow records the branch-wide Alt-Chain scaffold first. Continue here to turn tracking on, then lock in the
                baseline progression choices before you review named drawbacks below.
              </p>
            ) : null}

            {currentGuideStepId === 'starting-point' ? (
              <p>
                Pick the opening builder posture for the branch. Leaving it on <strong>{altChainStartingPoint.title}</strong> is fine if
                that is your intended default.
              </p>
            ) : null}

            {currentGuideStepId === 'exchange-rate-and-notes' ? (
              <p>
                Set the complication exchange rate and capture any interpretation notes while the builder decisions are still fresh.
              </p>
            ) : null}

            {currentGuideStepId === 'drawbacks' ? (
              <p>
                The entry workspace below is now focused on chain drawbacks so you can translate the builder complications into standing
                branch rules. {chainwideDrawbackCount > 0 ? `${chainwideDrawbackCount} chain drawback${chainwideDrawbackCount === 1 ? '' : 's'} already exist.` : 'No chain drawbacks exist yet.'}
              </p>
            ) : null}

            <div className="actions">
              {currentGuideStepId !== 'enable-builder' ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    handleGuideStepChange(
                      currentGuideStepId === 'drawbacks'
                        ? 'exchange-rate-and-notes'
                        : currentGuideStepId === 'exchange-rate-and-notes'
                          ? 'starting-point'
                          : 'enable-builder',
                    )
                  }
                >
                  Back
                </button>
              ) : null}

              {currentGuideStepId === 'drawbacks' ? (
                <button className="button button--secondary" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                  Create Chain Drawback
                </button>
              ) : null}

              <button className="button" type="button" onClick={handleGuideContinue}>
                {currentGuideStepId === 'enable-builder'
                  ? altChainBuilder.enabled
                    ? 'Continue'
                    : 'Start Builder'
                  : currentGuideStepId === 'drawbacks'
                    ? 'Finish Builder Flow'
                    : 'Continue'}
              </button>
            </div>
          </div>
        </SimpleModeGuideFrame>
      ) : null}

      {simpleMode && !activeGuideVisible ? (
        <section className="section-surface stack stack--compact">
          <div className="section-heading">
            <h3>When to use this page</h3>
            <ReadinessPill tone="advanced" />
          </div>
          <PlainLanguageHint term="Chainwide rule" meaning="a rule or drawback that follows the whole active branch instead of one jump." />
          <p>Open Chainwide Rules when the whole branch needs a standing drawback, a standing rule entry, a chain-level flag change, or an Alt-Chain baseline.</p>
        </section>
      ) : null}

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Chain Flags</h3>
            <span className="pill">{workspace.activeBranch.title}</span>
          </div>

          <p className="field-hint">
            Companions now carry their own purchase tracks automatically. They use 80% of the usual CP baseline and 80% of
            chainwide drawback CP, while drawback value taken inside a jump pays out at full value.
          </p>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={draftChain.chainSettings.chainDrawbacksSupplements}
              onChange={(event) => updateChainSetting('chainDrawbacksSupplements', event.target.checked)}
            />
            <span>Chain drawbacks apply to supplements</span>
          </label>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Chainwide Inventory</h3>
            <span className="pill">{workspace.chain.title}</span>
          </div>

          {simpleMode ? (
            <>
              <p>
                {chainwideDrawbackCount} chain drawbacks, {chainwideRuleCount} chain rules, and{' '}
                {activeChoicePointGrant > 0 ? `+${formatNumericValue(activeChoicePointGrant)}` : formatNumericValue(activeChoicePointGrant)} jump CP from
                active chainwide entries.
              </p>
              <p>Chain-owned rule effects feed jump rules automatically. Chain drawbacks can also feed jump budgets.</p>
            </>
          ) : (
            <>
              <div className="inline-meta">
                <span className="metric">
                  <strong>{chainwideDrawbackCount}</strong>
                  Chain drawbacks
                </span>
                <span className="metric">
                  <strong>{chainwideRuleCount}</strong>
                  Chain rules
                </span>
                <span className="metric">
                  <strong>{chainwideEffects.length}</strong>
                  Total entries
                </span>
                <span className="metric">
                  <strong>{activeChoicePointGrant > 0 ? `+${formatNumericValue(activeChoicePointGrant)}` : formatNumericValue(activeChoicePointGrant)}</strong>
                  Jump CP grant
                </span>
              </div>

              <p>Active chain-owned rule effects contribute to jump rules automatically. Active chain drawbacks can also feed jump budgets.</p>
            </>
          )}
        </article>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Alt-Chain Progression</h3>
          <span className="pill">{formatAltChainBuilderSelection(altChainBuilder)}</span>
        </div>

        <div className="guidance-strip guidance-strip--accent">
          <strong>Set the branch scaffold here, then track named picks below.</strong>
          <p>
            Use the Alt-Chain builder progression here for the whole branch. Record standing Accommodations as chain rules and
            standing Complications as chain drawbacks in the entry list below.
          </p>
        </div>

        {simpleMode ? (
          <PlainLanguageHint
            term="Alt-Chain progression"
            meaning="the branch-wide start state and complication exchange rate from the Alt-Chain builder."
          />
        ) : null}

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={altChainBuilder.enabled}
            onChange={(event) => updateAltChainBuilderField('enabled', event.target.checked)}
          />
          <span>Track Alt-Chain builder progression for this branch</span>
        </label>

        <p className="field-hint">{describeAltChainBuilderSelection(altChainBuilder, simpleMode)}</p>

        {altChainBuilder.enabled ? (
          <>
            <section className="stack stack--compact">
              <div className="section-heading">
                <h4>Starting Point</h4>
                <span className="pill">{altChainStartingPoint.title}</span>
              </div>

              <div className="summary-grid">
                {altChainStartingPoints.map((startingPoint) => {
                  const config = ALT_CHAIN_STARTING_POINT_CONFIGS[startingPoint];

                  return (
                    <button
                      key={startingPoint}
                      className={`selection-list__item${altChainBuilder.startingPoint === startingPoint ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => updateAltChainBuilderField('startingPoint', startingPoint)}
                    >
                      <strong>{config.title}</strong>
                      <span>{simpleMode ? config.simpleSummary : config.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="stack stack--compact">
              <div className="section-heading">
                <h4>Exchange Rate</h4>
                <span className="pill">{altChainExchangeRate.ratioLabel}</span>
              </div>

              <div className="summary-grid">
                {altChainExchangeRates.map((exchangeRate) => {
                  const config = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[exchangeRate];

                  return (
                    <button
                      key={exchangeRate}
                      className={`selection-list__item${altChainBuilder.exchangeRate === exchangeRate ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => updateAltChainBuilderField('exchangeRate', exchangeRate)}
                    >
                      <strong>
                        {config.title} <span className="pill">{config.ratioLabel}</span>
                      </strong>
                      <span>{simpleMode ? config.simpleSummary : config.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="summary-panel stack stack--compact">
              <h4>
                {altChainStartingPoint.title} + {altChainExchangeRate.title}
              </h4>
              <p>{describeAltChainBuilderSelection(altChainBuilder, simpleMode)}</p>
              <p>
                {simpleMode
                  ? 'After locking this in, add each standing Accommodation as a chain rule and each standing Complication as a chain drawback.'
                  : 'This page tracks the builder progression choice. Use the chainwide entries below for the actual rules, drawbacks, and CP-impacting complications that stay active across jumps.'}
              </p>
            </div>

            {simpleMode ? (
              <details
                className="details-panel"
                open={activeGuideVisible && currentGuideStepId === 'exchange-rate-and-notes' ? true : undefined}
              >
                <summary className="details-panel__summary">
                  <span>Builder notes</span>
                  <span className="pill">Optional</span>
                </summary>
                <div className="details-panel__body">
                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={5}
                      value={altChainBuilder.notes}
                      placeholder="Standard package swaps, color-coded bundle notes, or chain-specific interpretation details..."
                      onChange={(event) => updateAltChainBuilderField('notes', event.target.value)}
                    />
                  </label>
                </div>
              </details>
            ) : (
              <label className="field">
                <span>Builder notes</span>
                <textarea
                  rows={5}
                  value={altChainBuilder.notes}
                  placeholder="Standard package swaps, color-coded bundle notes, or chain-specific interpretation details..."
                  onChange={(event) => updateAltChainBuilderField('notes', event.target.value)}
                />
              </label>
            )}
          </>
        ) : (
          <p>
            Leave this off if the branch is using ad hoc chainwide rules only. Turn it on when you want Chainwide Rules to carry the
            Alt-Chain builder progression alongside the individual rule and drawback entries.
          </p>
        )}
      </section>

      {chainwideEffects.length === 0 ? (
        <EmptyWorkspaceCard
          title={guidedDrawbackStepActive ? 'No chainwide drawbacks yet' : 'No chainwide entries yet'}
          body={
            guidedDrawbackStepActive
              ? 'Create the first chain drawback here to turn a standing Alt-Chain complication into a persistent branch-level rule.'
              : simpleMode
                ? 'Add a chainwide drawback or rule when the whole branch needs it to persist across jumps.'
                : 'Create chain drawbacks or chain-owned rule effects here, then use Current Jump Rules for per-jump overrides. The Alt-Chain progression above stays available even with an empty entry list.'
          }
          action={
            <div className="actions">
              <button className="button" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                {guidedDrawbackStepActive ? 'Create First Chain Drawback' : 'Create Chain Drawback'}
              </button>
              <button className="button button--secondary" type="button" onClick={() => void handleCreateChainwideEffect('rule')}>
                Create Chain Rule
              </button>
            </div>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Entries</h3>
              {visibleCategoryFilter !== 'all' ? <span className="pill">{filteredEffects.length} shown</span> : null}
            </div>

            {simpleMode && showCategoryFilter ? (
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>Category filter</span>
                  <span className="pill">Optional</span>
                </summary>
                <div className="details-panel__body">
                  <label className="field">
                    <span>Category</span>
                    <select
                      value={visibleCategoryFilter}
                      disabled={guidedDrawbackStepActive}
                      onChange={(event) => setCategoryFilter(event.target.value as ChainwideCategoryFilter)}
                    >
                      <option value="all">all</option>
                      {effectCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            ) : showCategoryFilter ? (
              <label className="field">
                <span>Category</span>
                <select
                  value={visibleCategoryFilter}
                  disabled={guidedDrawbackStepActive}
                  onChange={(event) => setCategoryFilter(event.target.value as ChainwideCategoryFilter)}
                >
                  <option value="all">all</option>
                  {effectCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {guidedDrawbackStepActive ? (
              <p className="field-hint">The builder flow is locking this list to chain drawbacks for the current step.</p>
            ) : null}

            <div className="selection-list">
              {filteredEffects.map((effect) => (
                <button
                  key={effect.id}
                  className={`selection-list__item${draftEffect?.id === effect.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedEffectId(effect.id)}
                >
                  <strong>{effect.title}</strong>
                  <span>
                    {effect.category} | {effect.state}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {draftEffect ? (
              <>
                <div className="section-heading">
                  <h3>{draftEffect.title}</h3>
                  <button className="button button--secondary" type="button" onClick={() => void handleDeleteEffect()}>
                    Delete
                  </button>
                </div>

                <section className="stack stack--compact">
                  <h4>Core</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={draftEffect.title}
                        onChange={(event) =>
                          updateSelectedEffect({
                            ...draftEffect,
                            title: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Category</span>
                      <select
                        value={draftEffect.category}
                        onChange={(event) =>
                          updateSelectedEffect({
                            ...draftEffect,
                            category: event.target.value as Effect['category'],
                          })
                        }
                      >
                        {effectCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>State</span>
                      <select
                        value={draftEffect.state}
                        onChange={(event) =>
                          updateSelectedEffect({
                            ...draftEffect,
                            state: event.target.value as Effect['state'],
                          })
                        }
                      >
                        {effectStates.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Owner</span>
                      <input value={workspace.chain.title} readOnly />
                    </label>
                  </div>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={8}
                      value={draftEffect.description}
                      onChange={(event) =>
                        updateSelectedEffect({
                          ...draftEffect,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                </section>

                {draftEffect.category === 'drawback' ? (
                  <section className="stack stack--compact">
                    <h4>Jump budget</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Grant amount</span>
                        <input
                          type="number"
                          value={getSingleBudgetGrant(draftEffect).amount}
                          onChange={(event) =>
                            updateSelectedEffect(
                              setEffectBudgetGrant(
                                draftEffect,
                                getSingleBudgetGrant(draftEffect).currencyKey,
                                event.target.value.trim().length > 0 ? Number(event.target.value) : 0,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Budget currency</span>
                        <select
                          value={getSingleBudgetGrant(draftEffect).currencyKey === '0' ? '0' : CUSTOM_BUDGET_CURRENCY}
                          onChange={(event) =>
                            updateSelectedEffect(
                              setEffectBudgetGrant(
                                draftEffect,
                                event.target.value === CUSTOM_BUDGET_CURRENCY ? getSingleBudgetGrant(draftEffect).currencyKey : event.target.value,
                                getSingleBudgetGrant(draftEffect).amount,
                              ),
                            )
                          }
                        >
                          <option value="0">Choice Points (CP)</option>
                          <option value={CUSTOM_BUDGET_CURRENCY}>Custom currency</option>
                        </select>
                      </label>
                    </div>
                    {getSingleBudgetGrant(draftEffect).currencyKey !== '0' ? (
                      <label className="field">
                        <span>Custom budget ID</span>
                        <input
                          value={getSingleBudgetGrant(draftEffect).currencyKey}
                          onChange={(event) =>
                            updateSelectedEffect(
                              setEffectBudgetGrant(
                                draftEffect,
                                event.target.value.trim().length > 0 ? event.target.value.trim() : '0',
                                getSingleBudgetGrant(draftEffect).amount,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : null}
                    <div className="field-label-row">
                      <strong>Budget behavior</strong>
                      <AssistiveHint
                        text={`Applied to each jump participation budget while this drawback is active. ${formatBudgetCurrencyLabel(
                          getSingleBudgetGrant(draftEffect).currencyKey,
                        )} is the pool being adjusted.`}
                        triggerLabel="Explain budget behavior"
                      />
                    </div>
                  </section>
                ) : null}

                {simpleMode ? (
                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Metadata</span>
                      <span className="pill">Reference</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Scope</span>
                          <input value={draftEffect.scopeType} readOnly />
                        </label>
                        <label className="field">
                          <span>Owner type</span>
                          <input value={draftEffect.ownerEntityType} readOnly />
                        </label>
                      </div>

                      <AdvancedJsonDetails
                        summary="Advanced JSON"
                        badge="import metadata"
                        hint="Keep raw effect metadata out of the main editing flow unless you need to inspect it directly."
                      >
                        <JsonEditorField
                          label="Import Source Metadata"
                          value={draftEffect.importSourceMetadata}
                          onValidChange={(value) =>
                            updateSelectedEffect({
                              ...draftEffect,
                              importSourceMetadata:
                                typeof value === 'object' && value !== null && !Array.isArray(value)
                                  ? (value as Record<string, unknown>)
                                  : {},
                            })
                          }
                        />
                      </AdvancedJsonDetails>
                    </div>
                  </details>
                ) : (
                  <section className="stack stack--compact">
                    <h4>Metadata</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Scope</span>
                        <input value={draftEffect.scopeType} readOnly />
                      </label>
                      <label className="field">
                        <span>Owner type</span>
                        <input value={draftEffect.ownerEntityType} readOnly />
                      </label>
                    </div>

                    <AdvancedJsonDetails
                      summary="Advanced JSON"
                      badge="import metadata"
                      hint="Keep raw effect metadata out of the main editing flow unless you need to inspect it directly."
                    >
                      <JsonEditorField
                        label="Import Source Metadata"
                        value={draftEffect.importSourceMetadata}
                        onValidChange={(value) =>
                          updateSelectedEffect({
                            ...draftEffect,
                            importSourceMetadata:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          })
                        }
                      />
                    </AdvancedJsonDetails>
                  </section>
                )}
              </>
            ) : (
              <>
                <p>
                  {guidedDrawbackStepActive
                    ? 'No chain drawbacks exist yet. Create one here to translate a standing builder complication into a persistent branch rule.'
                    : 'No chainwide entries match the current filter.'}
                </p>
                <div className="actions">
                  {guidedDrawbackStepActive ? (
                    <button className="button" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                      Create Chain Drawback
                    </button>
                  ) : null}
                  <button className="button button--secondary" type="button" onClick={() => void handleCreateChainwideEffect('rule')}>
                    Create Chain Rule
                  </button>
                </div>
              </>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
