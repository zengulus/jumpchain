import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { createBlankEffect, deleteChainRecord, saveChainEntity, saveChainRecord } from '../workspace/records';
import {
  AutosaveStatusIndicator,
  ConfirmActionDialog,
  EmptyWorkspaceCard,
  PlainLanguageHint,
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
  type SimpleModePageGuideState,
} from '../workspace/simpleModeGuides';
import { createSafetySnapshot } from '../workspace/safety';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  ALT_CHAIN_OPTION_GROUP_LABELS,
  altChainBuilderOptionCatalog,
  getAltChainBuilderSelectionLimit,
  isAltChainBuilderOptionRepeatable,
  type AltChainBuilderOption,
  type AltChainBuilderOptionGroup,
} from './catalog';
import {
  ALT_CHAIN_BUILDER_METADATA_KEY,
  ALT_CHAIN_EXCHANGE_RATE_CONFIGS,
  ALT_CHAIN_STARTING_POINT_CONFIGS,
  altChainTrackedSupplementIds,
  applyAltChainBuilderChosenStarterPackage,
  buildAltChainBuilderGeneratedEffectSpecs,
  buildAltChainBuilderSummary,
  describeAltChainBuilderSelection,
  formatAltChainBuilderSelection,
  getAltChainBuilderGeneratedEffectOptionId,
  getAltChainBuilderSelectionCount,
  getAltChainSupplementSelectionSummary,
  getAltChainTrackedSupplementLabel,
  hasAltChainBuilderBeenUsed,
  isAltChainBuilderGeneratedEffect,
  markAltChainBuilderSynced,
  parseAltChainBuilderState,
  setAltChainSupplementExtraSelectionCount,
  setAltChainBuilderSelectionCount,
  setAltChainTrackedSupplementSelected,
  updateAltChainBuilderMetadata,
  type AltChainTrackedSupplementId,
  type AltChainBuilderState,
  type AltChainExchangeRate,
  type AltChainStartingPoint,
} from './altChainBuilder';

type AltChainBuilderGuideStepId =
  | 'enable-builder'
  | 'starting-point'
  | 'exchange-rate'
  | 'accommodations'
  | 'complications'
  | 'review';

const GUIDE_STEPS: Array<{ id: AltChainBuilderGuideStepId; label: string; description: string }> = [
  {
    id: 'enable-builder',
    label: 'Use Builder',
    description: 'Decide whether this branch should track Alt-Chain through the actual builder worksheet.',
  },
  {
    id: 'starting-point',
    label: 'Starting Point',
    description: 'Pick the branch baseline before you start recording named Accommodations and Complications.',
  },
  {
    id: 'exchange-rate',
    label: 'Exchange Rate',
    description: 'Choose how recorded Complications translate into extra Accommodations and capture any branch notes.',
  },
  {
    id: 'accommodations',
    label: 'Accommodations',
    description: 'Record the named Accommodations this branch is actually keeping in play.',
  },
  {
    id: 'complications',
    label: 'Complications',
    description: 'Record the named Complications this branch is carrying forward.',
  },
  {
    id: 'review',
    label: 'Post Effects',
    description: 'Review the worksheet totals, then generate chainwide rules and drawbacks from the recorded picks.',
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function matchesQuery(option: AltChainBuilderOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return true;
  }

  return [option.title, option.description, option.note, option.group, option.kind]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not synced yet';
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

function getAltChainOptionKindLabel(kind: AltChainBuilderOption['kind']) {
  return kind === 'accommodation' ? 'Accommodation' : 'Complication';
}

function getAltChainSearchPlaceholder(kind?: AltChainBuilderOption['kind']) {
  if (!kind) {
    return 'Find an accommodation or complication by name, note, or group...';
  }

  return kind === 'accommodation'
    ? 'Find an accommodation by name, note, or group...'
    : 'Find a complication by name, note, or group...';
}

function AltChainOptionSection(props: {
  title: string;
  kind: AltChainBuilderOption['kind'];
  options: AltChainBuilderOption[];
  state: AltChainBuilderState;
  searchQuery: string;
  hideSelected: boolean;
  onCountChange: (optionId: string, nextValue: unknown) => void;
  onSupplementToggle: (supplementId: AltChainTrackedSupplementId, selected: boolean) => void;
  onSupplementExtraCountChange: (nextValue: unknown) => void;
}) {
  const matchingOptions = props.options
    .map((option, index) => ({
      option,
      index,
      count: getAltChainBuilderSelectionCount(props.state, option.id),
    }))
    .filter(({ option }) => matchesQuery(option, props.searchQuery));
  const visibleOptions = matchingOptions
    .filter(({ count }) => !props.hideSelected || count <= 0)
    .sort((left, right) => {
      const selectedDelta = Number(right.count > 0) - Number(left.count > 0);

      if (selectedDelta !== 0) {
        return selectedDelta;
      }

      return left.index - right.index;
    });
  const selectedCount = matchingOptions.reduce((total, entry) => total + entry.count, 0);

  if (visibleOptions.length === 0) {
    return null;
  }

  return (
    <details className={`details-panel alt-chain-option-section alt-chain-option-section--${props.kind}`}>
      <summary className="details-panel__summary">
        <span>{props.title}</span>
        <div className="inline-meta">
          <span className={`pill alt-chain-token alt-chain-token--${props.kind}`}>{selectedCount} selected</span>
          <span className="pill pill--soft">{visibleOptions.length} {props.hideSelected ? 'shown' : 'options'}</span>
        </div>
      </summary>

      <div className="details-panel__body stack stack--compact">
        {visibleOptions.map(({ option, count }) => {
          const isRepeatable = isAltChainBuilderOptionRepeatable(option);
          const selectionLimit = getAltChainBuilderSelectionLimit(option);
          const isSelected = count > 0;
          const supplementSummary = option.id === 'supplements' ? getAltChainSupplementSelectionSummary(props.state) : null;

          return (
            <article
              className={`selection-editor alt-chain-option alt-chain-option--${option.kind}${isSelected ? ' is-selected' : ''}`}
              key={option.id}
            >
              <div className="selection-editor__header">
                <div className="stack stack--compact">
                  <strong>{option.title}</strong>
                  <p className="editor-section__copy">{option.description}</p>
                </div>
                <div className="inline-meta alt-chain-option__meta">
                  <span className={`pill alt-chain-token alt-chain-token--${option.kind}`}>{getAltChainOptionKindLabel(option.kind)}</span>
                  <span className={`pill alt-chain-option__state-pill alt-chain-option__state-pill--${option.kind}${isSelected ? ' is-selected' : ''}`}>
                    {isSelected ? 'Selected' : 'Unselected'}
                  </span>
                  {isRepeatable && isSelected ? <span className="pill pill--soft">{count}x</span> : null}
                </div>
              </div>

              {option.note ? <p className="field-hint">{option.note}</p> : null}

              {option.id === 'supplements' && supplementSummary ? (
                <div className="stack stack--compact alt-chain-supplement-picker">
                  <p className="field-hint">
                    Each tracked unlock below spends one Supplements pick. Anything beyond those three can still be counted as an extra unnamed supplement pick.
                  </p>

                  <div className="checkbox-list">
                    {altChainTrackedSupplementIds.map((supplementId) => {
                      const checked = supplementSummary.unlockedSupplementIds.includes(supplementId);

                      return (
                        <label className="checkbox-row" key={supplementId}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => props.onSupplementToggle(supplementId, event.target.checked)}
                          />
                          <span>{getAltChainTrackedSupplementLabel(supplementId)}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="alt-chain-option__counter">
                    <div className="alt-chain-option__counter-row">
                      <button
                        aria-label="Decrease extra supplement count"
                        className="button button--secondary alt-chain-option__stepper"
                        disabled={supplementSummary.extraSelectionCount <= 0}
                        type="button"
                        onClick={() => props.onSupplementExtraCountChange(supplementSummary.extraSelectionCount - 1)}
                      >
                        -
                      </button>
                      <span className="pill pill--soft alt-chain-option__count">{supplementSummary.extraSelectionCount}</span>
                      <button
                        aria-label="Increase extra supplement count"
                        className="button button--secondary alt-chain-option__stepper"
                        type="button"
                        onClick={() => props.onSupplementExtraCountChange(supplementSummary.extraSelectionCount + 1)}
                      >
                        +
                      </button>
                      <span className="alt-chain-option__selection-summary">
                        {supplementSummary.totalSelectionCount} total selections | {supplementSummary.extraSelectionCount} extra
                      </span>
                    </div>
                  </div>
                </div>
              ) : isRepeatable ? (
                <div className="alt-chain-option__counter">
                  <div className="alt-chain-option__counter-row">
                    <button
                      aria-label={`Decrease ${option.title} count`}
                      className="button button--secondary alt-chain-option__stepper"
                      disabled={count <= 0}
                      type="button"
                      onClick={() => props.onCountChange(option.id, count - 1)}
                    >
                      -
                    </button>
                    <span className="pill pill--soft alt-chain-option__count">{count}</span>
                    <button
                      aria-label={`Increase ${option.title} count`}
                      className="button button--secondary alt-chain-option__stepper"
                      disabled={typeof selectionLimit === 'number' && count >= selectionLimit}
                      type="button"
                      onClick={() => props.onCountChange(option.id, count + 1)}
                    >
                      +
                    </button>
                    <span className="alt-chain-option__selection-summary">
                      {typeof selectionLimit === 'number' ? `${count} of ${selectionLimit} selected` : `${count} selected`}
                    </span>
                  </div>

                  {typeof selectionLimit === 'number' && selectionLimit <= 10 ? (
                    <div className="alt-chain-option__pips" aria-hidden="true">
                      {Array.from({ length: selectionLimit }).map((_, index) => (
                        <span className={`alt-chain-option__pip${index < count ? ' is-active' : ''}`} key={`${option.id}-pip-${index}`} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="alt-chain-option__toggle-row">
                  <button
                    aria-label={`${isSelected ? 'Unselect' : 'Select'} ${option.title}`}
                    aria-pressed={isSelected}
                    className={`alt-chain-option__toggle${isSelected ? ' is-selected' : ''}`}
                    type="button"
                    onClick={() => props.onCountChange(option.id, isSelected ? 0 : 1)}
                  >
                    {isSelected ? 'Selected' : 'Unselected'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}

function AltChainSelectionsReview(props: {
  title: string;
  kind: AltChainBuilderOption['kind'];
  entries: Array<{ option: AltChainBuilderOption; count: number }>;
  emptyText: string;
}) {
  return (
    <section className={`card stack stack--compact alt-chain-kind-card alt-chain-kind-card--${props.kind}`}>
      <div className="section-heading">
        <h3>{props.title}</h3>
        <span className={`pill alt-chain-token alt-chain-token--${props.kind}`}>{props.entries.length} entries</span>
      </div>

      {props.entries.length === 0 ? (
        <p>{props.emptyText}</p>
      ) : (
        <div className="selection-list">
          {props.entries.map(({ option, count }) => (
            <div className="selection-list__item" key={option.id}>
              <strong>{count > 1 ? `${option.title} x${count}` : option.title}</strong>
              <span>
                {ALT_CHAIN_OPTION_GROUP_LABELS[option.group]} | {option.kind}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function AltChainBuilderPage() {
  const navigate = useNavigate();
  const { simpleMode, getChainGuideState, updateChainGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [hideSelected, setHideSelected] = useState(false);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [confirmChosenStarterOpen, setConfirmChosenStarterOpen] = useState(false);
  const [isApplyingChosenStarter, setIsApplyingChosenStarter] = useState(false);
  const guideRequested = readGuideRequested(searchParams);
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save Alt-Chain builder changes.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const rawImportSourceMetadata = asRecord(draftChain.importSourceMetadata);
  const hasStoredBuilderMetadata = Object.prototype.hasOwnProperty.call(rawImportSourceMetadata, ALT_CHAIN_BUILDER_METADATA_KEY);
  const parsedBuilder = parseAltChainBuilderState(rawImportSourceMetadata[ALT_CHAIN_BUILDER_METADATA_KEY]);
  const shouldSeedChosenStarter =
    !hasStoredBuilderMetadata &&
    parsedBuilder.startingPoint === 'chosen' &&
    Object.keys(parsedBuilder.selectionCounts).length === 0;
  const builder = shouldSeedChosenStarter ? applyAltChainBuilderChosenStarterPackage(parsedBuilder) : parsedBuilder;
  const summary = buildAltChainBuilderSummary(builder);
  const guideState = getChainGuideState(chainId, 'alt-chain-builder', SIMPLE_MODE_GUIDE_DEFAULT_KEY);
  const currentGuideStepId = getFirstIncompleteGuideStep(
    GUIDE_STEPS.map((step) => step.id),
    guideState,
    (stepId) => guideState.acknowledgedStepIds.includes(stepId),
  ) as AltChainBuilderGuideStepId | null;
  const currentGuideStep =
    GUIDE_STEPS.find((step) => step.id === currentGuideStepId) ?? GUIDE_STEPS[0];
  const currentGuideStepNumber =
    currentGuideStep ? GUIDE_STEPS.findIndex((step) => step.id === currentGuideStep.id) + 1 : 0;
  const shouldAutoOpenGuide =
    simpleMode &&
    !guideState.dismissed &&
    guideState.updatedAt === null &&
    !hasAltChainBuilderBeenUsed(parsedBuilder);
  const guideVisible =
    simpleMode &&
    Boolean(currentGuideStepId) &&
    !guideState.dismissed &&
    (guideRequested || shouldAutoOpenGuide);
  const selectedAccommodations = useMemo(() => altChainBuilderOptionCatalog
    .filter((option) => option.kind === 'accommodation')
    .flatMap((option) => {
      const count = getAltChainBuilderSelectionCount(builder, option.id);
      return count > 0 ? [{ option, count }] : [];
    }), [builder]);
  const selectedComplications = useMemo(() => altChainBuilderOptionCatalog
    .filter((option) => option.kind === 'complication')
    .flatMap((option) => {
      const count = getAltChainBuilderSelectionCount(builder, option.id);
      return count > 0 ? [{ option, count }] : [];
    }), [builder]);

  useEffect(() => {
    if (!shouldAutoOpenGuide || guideRequested) {
      return;
    }

    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, true));
  }, [guideRequested, setSearchParams, shouldAutoOpenGuide]);

  useEffect(() => {
    if (!shouldSeedChosenStarter) {
      return;
    }

    updateBuilder(builder);
  }, [builder, shouldSeedChosenStarter]);

  function updateBuilder(nextValue: AltChainBuilderState) {
    chainAutosave.updateDraft({
      ...draftChain,
      importSourceMetadata: updateAltChainBuilderMetadata(rawImportSourceMetadata, nextValue),
    });
  }

  function updateBuilderField<K extends keyof AltChainBuilderState>(key: K, value: AltChainBuilderState[K]) {
    updateBuilder({
      ...builder,
      [key]: value,
    });
  }

  function handleCountChange(optionId: string, rawValue: unknown) {
    updateBuilder(setAltChainBuilderSelectionCount(builder, optionId, rawValue));
  }

  function handleStartingPointChange(nextStartingPoint: AltChainStartingPoint) {
    if (nextStartingPoint === builder.startingPoint) {
      return;
    }

    if (nextStartingPoint !== 'chosen' || builder.startingPoint === 'chosen') {
      updateBuilderField('startingPoint', nextStartingPoint);
      return;
    }

    setConfirmChosenStarterOpen(true);
  }

  async function confirmChosenStarterPackage() {
    if (!workspace.activeBranch) {
      return;
    }

    setIsApplyingChosenStarter(true);

    try {
      await saveChainEntity(draftChain);
      const snapshot = await createSafetySnapshot({
        chainId,
        branchId: workspace.activeBranch.id,
        actionLabel: 'Apply Alt-Chain Chosen Starter Package',
        details: 'Created before replacing the current Alt-Chain builder selections.',
      });

      updateBuilder(applyAltChainBuilderChosenStarterPackage(builder));
      setHideSelected(false);
      setNotice({
        tone: 'success',
        message: `Applied the Chosen starter package. "${snapshot.title}" was created first.`,
      });
      setConfirmChosenStarterOpen(false);
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to apply the Chosen starter package.',
      });
    } finally {
      setIsApplyingChosenStarter(false);
    }
  }

  function updateBuilderGuideState(updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState) {
    updateChainGuideState(chainId, 'alt-chain-builder', SIMPLE_MODE_GUIDE_DEFAULT_KEY, updater);
  }

  function setGuideRequestedState(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  function handleGuideDismiss() {
    updateBuilderGuideState((current) => setGuideDismissed(current, true));
    setGuideRequestedState(false);
  }

  function handleGuideStepChange(nextStepId: AltChainBuilderGuideStepId) {
    updateBuilderGuideState((current) => setGuideCurrentStep(current, nextStepId));
  }

  function handleGuideContinue() {
    if (!currentGuideStepId) {
      return;
    }

    if (currentGuideStepId === 'enable-builder') {
      if (!builder.enabled) {
        updateBuilderField('enabled', true);
      }

      updateBuilderGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'enable-builder'), 'starting-point'));
      return;
    }

    if (currentGuideStepId === 'starting-point') {
      updateBuilderGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'starting-point'), 'exchange-rate'));
      return;
    }

    if (currentGuideStepId === 'exchange-rate') {
      updateBuilderGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'exchange-rate'), 'accommodations'));
      return;
    }

    if (currentGuideStepId === 'accommodations') {
      updateBuilderGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'accommodations'), 'complications'));
      return;
    }

    if (currentGuideStepId === 'complications') {
      updateBuilderGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'complications'), 'review'));
      return;
    }

    updateBuilderGuideState((current) => setGuideDismissed(setGuideCurrentStep(markGuideStepAcknowledged(current, 'review'), 'review'), true));
    setGuideRequestedState(false);
  }

  async function handlePostToChainwideEffects(returnToRules = false) {
    if (!workspace.activeBranch) {
      return;
    }

    const generatedSpecs = buildAltChainBuilderGeneratedEffectSpecs(builder);
    const existingGeneratedEffects = workspace.effects.filter(
      (effect) =>
        effect.scopeType === 'chain' &&
        effect.ownerEntityType === 'chain' &&
        effect.ownerEntityId === workspace.chain.id &&
        isAltChainBuilderGeneratedEffect(effect),
    );
    const syncedState = markAltChainBuilderSynced(builder);
    const nextChain = {
      ...draftChain,
      importSourceMetadata: updateAltChainBuilderMetadata(asRecord(draftChain.importSourceMetadata), syncedState),
    };
    const desiredOptionIds = new Set(generatedSpecs.map((spec) => spec.optionId));
    const existingByOptionId = new Map<string, Effect>();

    for (const effect of existingGeneratedEffects) {
      const optionId = getAltChainBuilderGeneratedEffectOptionId(effect);

      if (optionId) {
        existingByOptionId.set(optionId, effect);
      }
    }

    try {
      await saveChainEntity(draftChain);
      const snapshot = await createSafetySnapshot({
        chainId,
        branchId: workspace.activeBranch.id,
        actionLabel: returnToRules ? 'Post Alt-Chain Builder Entries and Return to Rules' : 'Post Alt-Chain Builder Entries',
        details: 'Created before syncing generated Alt-Chain entries into chainwide effects.',
      });

      await saveChainEntity(nextChain);
      updateBuilder(syncedState);

      for (const spec of generatedSpecs) {
        const existingEffect = existingByOptionId.get(spec.optionId);
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
              ...createBlankEffect(chainId, workspace.activeBranch.id, workspace.chain.id),
              title: spec.title,
              description: spec.description,
              category: spec.category,
              state: 'active',
              importSourceMetadata: spec.importSourceMetadata,
            };

        await saveChainRecord(db.effects, nextEffect);
      }

      for (const effect of existingGeneratedEffects) {
        const optionId = getAltChainBuilderGeneratedEffectOptionId(effect);

        if (optionId && !desiredOptionIds.has(optionId)) {
          await deleteChainRecord(db.effects, effect.id, chainId);
        }
      }

      if (guideVisible) {
        updateBuilderGuideState((current) => setGuideDismissed(setGuideCurrentStep(markGuideStepAcknowledged(current, 'review'), 'review'), true));
        setGuideRequestedState(false);
      }

      setNotice({
        tone: 'success',
        message:
          generatedSpecs.length > 0
            ? `Posted ${generatedSpecs.length} Alt-Chain builder entries into chainwide effects. "${snapshot.title}" was created first.`
            : `Removed previously generated Alt-Chain builder entries because no named picks are recorded now. "${snapshot.title}" was created first.`,
      });

      if (returnToRules) {
        navigate(`/chains/${chainId}/rules`);
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to post Alt-Chain builder entries into chainwide effects.',
      });
    }
  }

  function renderStartingPointChoices() {
    return (
      <div className="summary-grid">
        {(Object.keys(ALT_CHAIN_STARTING_POINT_CONFIGS) as AltChainStartingPoint[]).map((startingPoint) => {
          const config = ALT_CHAIN_STARTING_POINT_CONFIGS[startingPoint];

          return (
            <button
              key={startingPoint}
              className={`selection-list__item${builder.startingPoint === startingPoint ? ' is-active' : ''}`}
              type="button"
              onClick={() => handleStartingPointChange(startingPoint)}
            >
              <strong>{config.title}</strong>
              <span>{simpleMode ? config.simpleSummary : config.description}</span>
              <span>{config.reviewNote}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderExchangeRateChoices() {
    return (
      <div className="summary-grid">
        {(Object.keys(ALT_CHAIN_EXCHANGE_RATE_CONFIGS) as AltChainExchangeRate[]).map((exchangeRate) => {
          const config = ALT_CHAIN_EXCHANGE_RATE_CONFIGS[exchangeRate];

          return (
            <button
              key={exchangeRate}
              className={`selection-list__item${builder.exchangeRate === exchangeRate ? ' is-active' : ''}`}
              type="button"
              onClick={() => updateBuilderField('exchangeRate', exchangeRate)}
            >
              <strong>
                {config.title} <span className="pill">{config.ratioLabel}</span>
              </strong>
              <span>{simpleMode ? config.simpleSummary : config.description}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderOptionsByKind(kind: AltChainBuilderOption['kind']) {
    const optionGroups = (Object.keys(ALT_CHAIN_OPTION_GROUP_LABELS) as AltChainBuilderOptionGroup[]).map((group) => ({
      group,
      options: altChainBuilderOptionCatalog.filter((option) => option.kind === kind && option.group === group),
    }));
    const matchingOptionCount = optionGroups.reduce(
      (total, { options }) => total + options.filter((option) => matchesQuery(option, searchQuery)).length,
      0,
    );
    const visibleOptionCount = optionGroups.reduce(
      (total, { options }) =>
        total +
        options.filter(
          (option) =>
            matchesQuery(option, searchQuery) && (!hideSelected || getAltChainBuilderSelectionCount(builder, option.id) <= 0),
        ).length,
      0,
    );
    const kindLabel = kind === 'accommodation' ? 'accommodations' : 'complications';

    return (
      <div className="stack stack--compact">
        {visibleOptionCount === 0 ? (
          <div className="section-surface alt-chain-builder__empty-state">
            <p>
              {matchingOptionCount > 0 && hideSelected
                ? `All matching ${kindLabel} are already selected. Turn off Hide Selected to edit them.`
                : `No ${kindLabel} match the current search.`}
            </p>
          </div>
        ) : null}

        {optionGroups.map(({ group, options }) => (
          <AltChainOptionSection
            key={`${kind}-${group}`}
            title={ALT_CHAIN_OPTION_GROUP_LABELS[group]}
            kind={kind}
            options={options}
            state={builder}
            searchQuery={searchQuery}
            hideSelected={hideSelected}
            onCountChange={handleCountChange}
            onSupplementToggle={(supplementId, selected) =>
              updateBuilder(setAltChainTrackedSupplementSelected(builder, supplementId, selected))
            }
            onSupplementExtraCountChange={(nextValue) =>
              updateBuilder(setAltChainSupplementExtraSelectionCount(builder, nextValue))
            }
          />
        ))}
      </div>
    );
  }

  function renderOptionToolbar(kind?: AltChainBuilderOption['kind']) {
    const matchingOptions = altChainBuilderOptionCatalog.filter(
      (option) => (!kind || option.kind === kind) && matchesQuery(option, searchQuery),
    );
    const matchingSelectedCount = matchingOptions.filter((option) => getAltChainBuilderSelectionCount(builder, option.id) > 0).length;

    return (
      <section className="alt-chain-builder__toolbar">
        <label className="field alt-chain-builder__toolbar-search">
          <span>Filter options</span>
          <input
            value={searchQuery}
            placeholder={getAltChainSearchPlaceholder(kind)}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <div className="alt-chain-builder__toolbar-actions">
          <button
            aria-pressed={hideSelected}
            className={`choice-chip alt-chain-builder__filter-toggle${hideSelected ? ' is-active' : ''}`}
            type="button"
            onClick={() => setHideSelected((currentValue) => !currentValue)}
          >
            <span>Hide Selected</span>
            <span>{hideSelected ? 'On' : 'Off'}</span>
          </button>
          <span className="pill pill--soft">{matchingSelectedCount} {hideSelected ? 'hidden' : 'selected'}</span>
        </div>
      </section>
    );
  }

  function renderGuideBody() {
    if (currentGuideStepId === 'enable-builder') {
      return (
        <section className="card stack">
          <div className="section-heading">
            <h3>Use Alt-Chain Builder</h3>
            <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
          </div>
          <p>{currentGuideStep.description}</p>
          <p className="field-hint">If this branch is just manual chainwide rules, skip this and go back to the rules page.</p>
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={handleGuideDismiss}>
              Skip for now
            </button>
            <button className="button" type="button" onClick={handleGuideContinue}>
              {builder.enabled ? 'Continue' : 'Use Builder'}
            </button>
          </div>
        </section>
      );
    }

    if (currentGuideStepId === 'starting-point') {
      return (
        <section className="card stack">
          <div className="section-heading">
            <h3>Pick the Starting Point</h3>
            <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
          </div>
          <p>{currentGuideStep.description}</p>
          {renderStartingPointChoices()}
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('enable-builder')}>
              Back
            </button>
            <button className="button" type="button" onClick={handleGuideContinue}>
              Continue
            </button>
          </div>
        </section>
      );
    }

    if (currentGuideStepId === 'exchange-rate') {
      return (
        <section className="card stack">
          <div className="section-heading">
            <h3>Pick the Exchange Rate</h3>
            <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
          </div>
          <p>{currentGuideStep.description}</p>
          {renderExchangeRateChoices()}
          <label className="field">
            <span>Builder notes</span>
            <textarea
              rows={5}
              value={builder.notes}
              placeholder="Package swaps, interpretation calls, and anything you do not want to forget later..."
              onChange={(event) => updateBuilderField('notes', event.target.value)}
            />
          </label>
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('starting-point')}>
              Back
            </button>
            <button className="button" type="button" onClick={handleGuideContinue}>
              Continue
            </button>
          </div>
        </section>
      );
    }

    if (currentGuideStepId === 'accommodations') {
      return (
        <section className="card stack">
          <div className="section-heading">
            <h3>Record Accommodations</h3>
            <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
          </div>
          <p>{currentGuideStep.description}</p>
          {renderOptionToolbar('accommodation')}
          {renderOptionsByKind('accommodation')}
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('exchange-rate')}>
              Back
            </button>
            <button className="button" type="button" onClick={handleGuideContinue}>
              Continue
            </button>
          </div>
        </section>
      );
    }

    if (currentGuideStepId === 'complications') {
      return (
        <section className="card stack">
          <div className="section-heading">
            <h3>Record Complications</h3>
            <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
          </div>
          <p>{currentGuideStep.description}</p>
          {renderOptionToolbar('complication')}
          {renderOptionsByKind('complication')}
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('accommodations')}>
              Back
            </button>
            <button className="button" type="button" onClick={handleGuideContinue}>
              Continue
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="card stack">
        <div className="section-heading">
          <h3>Review and Post</h3>
          <span className="pill">Step {currentGuideStepNumber} of {GUIDE_STEPS.length}</span>
        </div>
        <p>{currentGuideStep.description}</p>

        <div className="inline-meta">
          <span className="metric">
            <strong>{summary.recordedAccommodationCount}</strong>
            Accommodation load
          </span>
          <span className="metric">
            <strong>{summary.recordedComplicationCount}</strong>
            Complication load
          </span>
          <span className="metric">
            <strong>{summary.availableExtraAccommodationCredit}</strong>
            Extra A credit
          </span>
        </div>

        {summary.warnings.map((warning) => (
          <p className="field-hint" key={warning}>
            {warning}
          </p>
        ))}

        <AltChainSelectionsReview
          title="Accommodations to Post"
          kind="accommodation"
          entries={selectedAccommodations}
          emptyText="No named Accommodations are selected yet."
        />
        <AltChainSelectionsReview
          title="Complications to Post"
          kind="complication"
          entries={selectedComplications}
          emptyText="No named Complications are selected yet."
        />

        <div className="actions">
          <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('complications')}>
            Back
          </button>
          <button className="button button--secondary" type="button" onClick={handleGuideContinue}>
            Finish Guide Only
          </button>
          <button className="button" type="button" onClick={() => void handlePostToChainwideEffects(true)}>
            Post To Chainwide Effects
          </button>
        </div>
      </section>
    );
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before building Alt-Chain state." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Alt-Chain Builder"
        description={
          simpleMode
            ? 'Work through the actual Alt-Chain worksheet here, then push named picks into Chainwide Rules.'
            : 'Track Alt-Chain starting point, exchange rate, named Accommodations, named Complications, and generated chainwide rule entries.'
        }
        badge={formatAltChainBuilderSelection(builder)}
        actions={
          guideVisible ? (
            <Link className="button button--secondary" to={`/chains/${chainId}/rules`}>
              Back To Chainwide Rules
            </Link>
          ) : (
            <>
              <Link className="button button--secondary" to={`/chains/${chainId}/rules`}>
                Open Chainwide Rules
              </Link>
              <button className="button" type="button" onClick={() => void handlePostToChainwideEffects(false)}>
                Post To Chainwide Effects
              </button>
            </>
          )
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={chainAutosave.status} />

      {guideVisible ? (
        renderGuideBody()
      ) : (
        <>
          {simpleMode ? (
            <section className="section-surface stack stack--compact">
              <div className="section-heading">
                <h3>What This Page Does</h3>
                <span className="pill">Builder</span>
              </div>
              <PlainLanguageHint
                term="Post to chainwide effects"
                meaning="turn the named Accommodations into chain rules and the named Complications into chain drawbacks on the rules page."
              />
              <p>The starting point and exchange rate stay on the chain as builder metadata. Chosen starts from the usual starter package, but you can swap those picks around within the 22 Accommodation / 2 Complication budget, and the named options you select here get generated as rule entries.</p>
            </section>
          ) : null}

          <section className="grid grid--two">
            <article className="card stack">
              <div className="section-heading">
                <h3>Builder State</h3>
                <span className="pill">{builder.enabled ? 'Tracking on' : 'Tracking off'}</span>
              </div>
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={builder.enabled}
                  onChange={(event) => updateBuilderField('enabled', event.target.checked)}
                />
                <span>Track this branch with the Alt-Chain builder</span>
              </label>
              <p className="field-hint">{describeAltChainBuilderSelection(builder, simpleMode)}</p>
              <p className="field-hint">Last effect sync: {formatTimestamp(builder.lastSyncedAt)}</p>
            </article>

            <article className="card stack">
              <div className="section-heading">
                <h3>Worksheet Totals</h3>
                <span className="pill">{ALT_CHAIN_EXCHANGE_RATE_CONFIGS[builder.exchangeRate].ratioLabel}</span>
              </div>
              <div className="inline-meta">
                <span className="metric">
                  <strong>{summary.recordedAccommodationCount}</strong>
                  Accommodation load
                </span>
                <span className="metric">
                  <strong>{summary.recordedComplicationCount}</strong>
                  Complication load
                </span>
                <span className="metric">
                  <strong>{summary.availableExtraAccommodationCredit}</strong>
                  Extra A credit
                </span>
                <span className="metric">
                  <strong>{summary.extraAccommodationDelta >= 0 ? `+${summary.extraAccommodationDelta}` : String(summary.extraAccommodationDelta)}</strong>
                  A slot delta
                </span>
              </div>
              {summary.warnings.map((warning) => (
                <p className="field-hint" key={warning}>
                  {warning}
                </p>
              ))}
            </article>
          </section>

          <section className="card stack">
            <div className="section-heading">
              <h3>Starting Point</h3>
              <span className="pill">{ALT_CHAIN_STARTING_POINT_CONFIGS[builder.startingPoint].title}</span>
            </div>
            {renderStartingPointChoices()}
          </section>

          <section className="card stack">
            <div className="section-heading">
              <h3>Exchange Rate</h3>
              <span className="pill">{ALT_CHAIN_EXCHANGE_RATE_CONFIGS[builder.exchangeRate].ratioLabel}</span>
            </div>
            {renderExchangeRateChoices()}
            <label className="field">
              <span>Builder notes</span>
              <textarea
                rows={5}
                value={builder.notes}
                placeholder="Package swaps, interpretation calls, and branch-specific rulings..."
                onChange={(event) => updateBuilderField('notes', event.target.value)}
              />
            </label>
          </section>

          {renderOptionToolbar()}

          <section className="card stack alt-chain-kind-card alt-chain-kind-card--accommodation">
            <div className="section-heading">
              <h3>Accommodations</h3>
              <span className="pill alt-chain-token alt-chain-token--accommodation">{summary.selectedAccommodationCount} selected</span>
            </div>
            {renderOptionsByKind('accommodation')}
          </section>

          <section className="card stack alt-chain-kind-card alt-chain-kind-card--complication">
            <div className="section-heading">
              <h3>Complications</h3>
              <span className="pill alt-chain-token alt-chain-token--complication">{summary.selectedComplicationCount} selected</span>
            </div>
            {renderOptionsByKind('complication')}
          </section>

          <section className="grid grid--two">
            <AltChainSelectionsReview
              title="Accommodations To Post"
              kind="accommodation"
              entries={selectedAccommodations}
              emptyText="No named Accommodations are selected yet."
            />
            <AltChainSelectionsReview
              title="Complications To Post"
              kind="complication"
              entries={selectedComplications}
              emptyText="No named Complications are selected yet."
            />
          </section>
        </>
      )}

      <ConfirmActionDialog
        open={confirmChosenStarterOpen}
        tone="danger"
        title="Replace the current Alt-Chain picks with Chosen?"
        description="Switching to Chosen applies the starter package and replaces the current Alt-Chain selection progress."
        confirmLabel="Apply Chosen Starter"
        isBusy={isApplyingChosenStarter}
        details={<p>A safety snapshot of the active branch will be created before the current selections are replaced.</p>}
        onCancel={() => setConfirmChosenStarterOpen(false)}
        onConfirm={() => void confirmChosenStarterPackage()}
      />
    </div>
  );
}
