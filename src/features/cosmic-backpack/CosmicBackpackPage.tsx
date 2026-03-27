import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { saveChainEntity } from '../workspace/records';
import {
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  PlainLanguageHint,
  ReadinessPill,
  SimpleModeAffirmation,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { SearchHighlight } from '../search/SearchHighlight';
import { SetupGuidePanels, cosmicBackpackSetupGuide } from '../supplement-guides/SetupGuidePanels';
import {
  COSMIC_BACKPACK_BASE_VOLUME_FT3,
  COSMIC_BACKPACK_TOTAL_BP,
  cosmicBackpackMandatoryOptionIds,
  cosmicBackpackBaseDescription,
  cosmicBackpackOptionCatalog,
  cosmicBackpackOptionsById,
  type CosmicBackpackOption,
} from './catalog';
import {
  COSMIC_BACKPACK_BP_CURRENCY_KEY,
  buildCosmicBackpackSummary,
  createBlankCosmicBackpackCustomUpgrade,
  createDefaultCosmicBackpackState,
  getCosmicBackpackMissingRequirementIds,
  readCosmicBackpackState,
  setCosmicBackpackOptionSelected,
  type CosmicBackpackCustomUpgrade,
  writeCosmicBackpackState,
} from './model';

const CUBIC_FEET_TO_CUBIC_METERS = 0.028316846592;
const SIDE_LENGTH_UNITS: Array<{ label: string; sizeFt: number }> = [
  { label: 'ft', sizeFt: 1 },
  { label: 'mi', sizeFt: 5_280 },
  { label: 'Earth diameters', sizeFt: 41_804_000 },
  { label: 'AU', sizeFt: 4.90806624e11 },
  { label: 'ly', sizeFt: 3.10399e16 },
  { label: 'pc', sizeFt: 1.0117e17 },
  { label: 'kpc', sizeFt: 1.0117e20 },
  { label: 'Mpc', sizeFt: 1.0117e23 },
  { label: 'Gpc', sizeFt: 1.0117e26 },
  { label: 'observable-universe diameters', sizeFt: 2.9e27 },
] as const;

function formatBudget(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedBudget(value: number) {
  if (value > 0) {
    return `+${formatBudget(value)}`;
  }

  if (value < 0) {
    return `-${formatBudget(Math.abs(value))}`;
  }

  return '0';
}

function formatVolumePair(valueFt3: number) {
  return `${formatDecimal(valueFt3)} ft^3 / ${formatDecimal(valueFt3 * CUBIC_FEET_TO_CUBIC_METERS)} m^3`;
}

function formatScaledRange(lower: number, upper: number) {
  const formatter =
    upper >= 100
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
      : upper >= 10
        ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
        : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return 'very large';
  }

  if (upper >= 1e6) {
    return `${lower.toExponential(2)}-${upper.toExponential(2)}`;
  }

  return `${formatter.format(lower)}-${formatter.format(upper)}`;
}

function getVolumeReference(storageVolumeFt3: number) {
  if (!Number.isFinite(storageVolumeFt3) || storageVolumeFt3 <= 0) {
    return {
      text: 'a cube about 8-17 ft on a side',
      oom: 0,
    };
  }

  const relativeOom = Math.max(
    0,
    Math.floor(Math.log10(storageVolumeFt3 / COSMIC_BACKPACK_BASE_VOLUME_FT3)),
  );

  if (relativeOom > 100) {
    return {
      text: 'Big enough',
      oom: relativeOom,
    };
  }

  const lowerVolumeFt3 = COSMIC_BACKPACK_BASE_VOLUME_FT3 * 10 ** relativeOom;
  const upperVolumeFt3 = COSMIC_BACKPACK_BASE_VOLUME_FT3 * 10 ** (relativeOom + 1);
  const lowerSideFt = Math.cbrt(lowerVolumeFt3);
  const upperSideFt = Math.cbrt(upperVolumeFt3);
  const midpointSideFt = Math.sqrt(lowerSideFt * upperSideFt);
  const unit =
    [...SIDE_LENGTH_UNITS]
      .reverse()
      .find((candidate) => midpointSideFt >= candidate.sizeFt)
    ?? SIDE_LENGTH_UNITS[0];
  const lowerInUnit = lowerSideFt / unit.sizeFt;
  const upperInUnit = upperSideFt / unit.sizeFt;

  return {
    text: `a cube about ${formatScaledRange(lowerInUnit, upperInUnit)} ${unit.label} on a side`,
    oom: relativeOom,
  };
}

function getRequirementText(option: CosmicBackpackOption) {
  if (!option.requirementIds?.length) {
    return null;
  }

  return option.requirementIds
    .map((requirementId) => cosmicBackpackOptionsById[requirementId]?.title ?? requirementId)
    .join(', ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getRecordStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getRecordNumberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsedValue = Number(value);

      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

function getNetTransferredBackpackBp(exchanges: unknown[]) {
  return exchanges.reduce<number>((total, exchange) => {
    const record = asRecord(exchange);
    const toCurrency = getRecordStringValue(record, ['toCurrency', 'targetCurrency', 'currencyTo', 'targetCurrencyKey', 'to', 'target']);
    const fromCurrency =
      getRecordStringValue(record, ['fromCurrency', 'sourceCurrency', 'currencyFrom', 'sourceCurrencyKey', 'from', 'source']) ??
      getRecordStringValue(record, ['currency']);
    const toAmount = getRecordNumberValue(record, ['toAmount', 'targetAmount', 'receivedAmount', 'convertedAmount', 'received']) ?? 0;
    const fromAmount = getRecordNumberValue(record, ['fromAmount', 'sourceAmount', 'spent', 'amount', 'value']) ?? 0;

    return total
      + (toCurrency === COSMIC_BACKPACK_BP_CURRENCY_KEY ? toAmount : 0)
      - (fromCurrency === COSMIC_BACKPACK_BP_CURRENCY_KEY ? fromAmount : 0);
  }, 0);
}

function CosmicBackpackOptionSection(props: {
  title: string;
  description: string;
  options: CosmicBackpackOption[];
  selectedOptionIds: string[];
  highlightQuery: string;
  onToggle: (optionId: string, checked: boolean) => void;
  lockedOptionIds?: string[];
  defaultOpen?: boolean;
}) {
  const selectedCount = props.options.filter((option) => props.selectedOptionIds.includes(option.id)).length;

  return (
    <details className="details-panel" open={props.defaultOpen ? true : undefined}>
      <summary className="details-panel__summary">
        <span>{props.title}</span>
        <div className="inline-meta">
          <span className="pill">{selectedCount} selected</span>
          <span className="pill pill--soft">{props.options.length} total</span>
        </div>
      </summary>
      <div className="details-panel__body stack stack--compact">
        <p>{props.description}</p>
        <div className="checkbox-list">
          {props.options.map((option) => {
            const selected = props.selectedOptionIds.includes(option.id);
            const locked = props.lockedOptionIds?.includes(option.id) ?? false;
            const missingRequirementIds = getCosmicBackpackMissingRequirementIds(
              {
                version: 1,
                selectedOptionIds: props.selectedOptionIds,
                customUpgrades: [],
                appearanceNotes: '',
                containerForm: '',
                notes: '',
              },
              option.id,
            );
            const disabled = missingRequirementIds.length > 0 && !selected;
            const requirementText = getRequirementText(option);

            return (
              <article className="selection-editor" key={option.id}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>
                      <SearchHighlight text={option.title} query={props.highlightQuery} />
                    </strong>
                    <p className="editor-section__copy">
                      <SearchHighlight text={option.description} query={props.highlightQuery} />
                    </p>
                  </div>
                  <span className="pill pill--soft">{option.costBp === 0 ? 'Free' : `${option.costBp} BP`}</span>
                </div>

                {option.note ? (
                  <p className="editor-section__copy">
                    <SearchHighlight text={option.note} query={props.highlightQuery} />
                  </p>
                ) : null}

                {requirementText ? (
                  <p className="field-hint">
                    Requires <SearchHighlight text={requirementText} query={props.highlightQuery} />.
                  </p>
                ) : null}

                {disabled ? (
                  <p className="field-hint">
                    Buy{' '}
                    <SearchHighlight
                      text={missingRequirementIds
                        .map((requirementId) => cosmicBackpackOptionsById[requirementId]?.title ?? requirementId)
                        .join(', ')}
                      query={props.highlightQuery}
                    />{' '}
                    first.
                  </p>
                ) : null}

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled || locked}
                    onChange={(event) => props.onToggle(option.id, event.target.checked)}
                  />
                  <span>
                    {locked
                      ? 'Always included'
                      : selected
                        ? 'Selected'
                        : option.costBp === 0
                          ? 'Take this free option'
                          : 'Buy this upgrade'}
                  </span>
                </label>
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function CosmicBackpackCustomUpgradeSection(props: {
  customUpgrades: CosmicBackpackCustomUpgrade[];
  onChange: (nextCustomUpgrades: CosmicBackpackCustomUpgrade[]) => void;
  highlightQuery: string;
  defaultOpen?: boolean;
}) {
  function updateUpgrade(
    upgradeId: string,
    updater: (currentUpgrade: CosmicBackpackCustomUpgrade) => CosmicBackpackCustomUpgrade,
  ) {
    props.onChange(
      props.customUpgrades.map((upgrade) => (upgrade.id === upgradeId ? updater(upgrade) : upgrade)),
    );
  }

  return (
    <details className="details-panel" open={props.defaultOpen ? true : undefined}>
      <summary className="details-panel__summary">
        <span>Custom Upgrades</span>
        <div className="inline-meta">
          <span className="pill">{props.customUpgrades.length} custom</span>
          <span className="pill pill--soft">BP + volume edits</span>
        </div>
      </summary>
      <div className="details-panel__body stack stack--compact">
        <p>
          Use this for warehouse add-ons or rulings that are not in the stock list. <strong>Add volume</strong> extends the bag directly.
          <strong> Scale current volume</strong> multiplies whatever interior total you already have. Leave scale at <code>1</code> if
          it should not change the size.
        </p>

        {props.customUpgrades.length > 0 ? (
          <div className="selection-editor-list">
            {props.customUpgrades.map((upgrade, index) => (
              <article className="selection-editor" key={upgrade.id}>
                <div className="selection-editor__header">
                  <div className="stack stack--compact">
                    <strong>
                      <SearchHighlight text={upgrade.title} query={props.highlightQuery} />
                    </strong>
                    {upgrade.notes.trim().length > 0 ? (
                      <p className="editor-section__copy">
                        <SearchHighlight text={upgrade.notes} query={props.highlightQuery} />
                      </p>
                    ) : (
                      <p className="editor-section__copy">
                        Custom BP and volume adjustment for anything the printed list does not cover cleanly.
                      </p>
                    )}
                  </div>
                  <div className="inline-meta">
                    <span className="pill pill--soft">{upgrade.costBp === 0 ? 'Free' : `${formatDecimal(upgrade.costBp)} BP`}</span>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() =>
                        props.onChange(props.customUpgrades.filter((currentUpgrade) => currentUpgrade.id !== upgrade.id))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={upgrade.title}
                      placeholder={`Custom upgrade ${index + 1}`}
                      onChange={(event) =>
                        updateUpgrade(upgrade.id, (currentUpgrade) => ({
                          ...currentUpgrade,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span>BP cost</span>
                    <input
                      type="number"
                      value={upgrade.costBp}
                      onChange={(event) =>
                        updateUpgrade(upgrade.id, (currentUpgrade) => ({
                          ...currentUpgrade,
                          costBp: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="field-grid field-grid--two">
                  <label className="field">
                    <span>Add volume (ft^3)</span>
                    <input
                      type="number"
                      min={0}
                      value={upgrade.addedVolumeFt3}
                      onChange={(event) =>
                        updateUpgrade(upgrade.id, (currentUpgrade) => ({
                          ...currentUpgrade,
                          addedVolumeFt3: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                    />
                    <small className="field-hint">
                      {upgrade.addedVolumeFt3 > 0
                        ? `Adds ${formatVolumePair(upgrade.addedVolumeFt3)}.`
                        : 'Leave at 0 if this upgrade does not add raw space.'}
                    </small>
                  </label>

                  <label className="field">
                    <span>Scale current volume (x)</span>
                    <input
                      type="number"
                      min={0.01}
                      step={0.1}
                      value={upgrade.volumeMultiplier}
                      onChange={(event) =>
                        updateUpgrade(upgrade.id, (currentUpgrade) => ({
                          ...currentUpgrade,
                          volumeMultiplier: Math.max(0.01, Number(event.target.value) || 1),
                        }))
                      }
                    />
                    <small className="field-hint">
                      {upgrade.volumeMultiplier !== 1
                        ? `Scales the current bag size by x${formatDecimal(upgrade.volumeMultiplier)}.`
                        : 'Leave at 1 if this upgrade should not scale the bag.'}
                    </small>
                  </label>
                </div>

                <label className="field">
                  <span>Notes / source</span>
                  <textarea
                    rows={3}
                    value={upgrade.notes}
                    placeholder="What supplement or ruling is this representing?"
                    onChange={(event) =>
                      updateUpgrade(upgrade.id, (currentUpgrade) => ({
                        ...currentUpgrade,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </article>
            ))}
          </div>
        ) : (
          <p className="editor-section__empty">
            No custom upgrades yet. Add one when another warehouse supplement or house ruling should live on the Backpack BP budget.
          </p>
        )}

        <div className="actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => props.onChange([...props.customUpgrades, createBlankCosmicBackpackCustomUpgrade()])}
          >
            Add Custom Upgrade
          </button>
        </div>
      </div>
    </details>
  );
}

export function CosmicBackpackPage() {
  const { chainId, workspace } = useChainWorkspace();
  const { simpleMode } = useUiPreferences();
  const [searchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const { message: simpleAffirmation, showAffirmation } = useSimpleModeAffirmation();
  const highlightQuery = searchParams.get('highlight') ?? '';
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save Cosmic Backpack changes.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const state = readCosmicBackpackState(draftChain);
  const transferredBp = workspace.participations.reduce<number>(
    (total, participation) =>
      total
      + getNetTransferredBackpackBp(
        Array.isArray(asRecord(participation).currencyExchanges)
          ? (asRecord(participation).currencyExchanges as unknown[])
          : [],
      ),
    0,
  );
  const summary = buildCosmicBackpackSummary(state, { transferredBp });
  const selectedOptionIds = state.selectedOptionIds;
  const selectedOptions = selectedOptionIds
    .map((optionId) => cosmicBackpackOptionsById[optionId])
    .filter((option): option is CosmicBackpackOption => Boolean(option));
  const userSelectedOptions = selectedOptions.filter(
    (option) =>
      !cosmicBackpackMandatoryOptionIds.includes(option.id as (typeof cosmicBackpackMandatoryOptionIds)[number]),
  );
  const hasStarted =
    userSelectedOptions.length > 0 ||
    state.customUpgrades.length > 0 ||
    state.appearanceNotes.trim().length > 0 ||
    state.containerForm.trim().length > 0 ||
    state.notes.trim().length > 0;
  const volumeReference = getVolumeReference(summary.storageVolumeFt3);
  const coreUpgrades = cosmicBackpackOptionCatalog.filter((option) => option.category === 'core-upgrade');
  const attachments = cosmicBackpackOptionCatalog.filter((option) => option.category === 'attachment');
  const modifiers = cosmicBackpackOptionCatalog.filter((option) => option.category === 'modifier');
  const selectedCoreUpgradeCount = coreUpgrades.filter((option) => selectedOptionIds.includes(option.id)).length;
  const selectedAttachmentCount = attachments.filter((option) => selectedOptionIds.includes(option.id)).length;
  const selectedModifierCount = modifiers.filter((option) => selectedOptionIds.includes(option.id)).length;
  const activeLoadoutCount = selectedOptions.length + state.customUpgrades.length;

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before using the Cosmic Backpack workspace." />;
  }

  function updateState(
    updater: (currentState: ReturnType<typeof readCosmicBackpackState>) => ReturnType<typeof readCosmicBackpackState>,
  ) {
    chainAutosave.updateDraft((currentChain) => {
      if (!currentChain) {
        return currentChain;
      }

      return writeCosmicBackpackState(currentChain, updater(readCosmicBackpackState(currentChain)));
    });
  }

  function handleToggle(optionId: string, checked: boolean) {
    const option = cosmicBackpackOptionsById[optionId];
    updateState((currentState) => setCosmicBackpackOptionSelected(currentState, optionId, checked));

    if (checked && option) {
      showAffirmation(`${option.title} added to the Backpack plan.`);
    }
  }

  function handleReset() {
    if (!window.confirm('Reset the Cosmic Backpack plan for this branch? This clears the current selections and notes.')) {
      return;
    }

    updateState(() => createDefaultCosmicBackpackState());
    setNotice({
      tone: 'success',
      message: 'Cosmic Backpack plan reset.',
    });
    showAffirmation('Cosmic Backpack reset. You can rebuild it a piece at a time whenever you want.');
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Cosmic Backpack"
        description={
          simpleMode
            ? hasStarted
              ? 'Optional supplement workspace in progress. Build a lighter warehouse alternative around one bag and a short list of upgrades.'
              : 'Optional supplement workspace. Use it when you want a compact warehouse replacement instead of a large infrastructure planner.'
            : 'A compact supplement workbench for the Cosmic Backpack warehouse alternative.'
        }
        badge={workspace.activeBranch.title}
        actions={
          <>
            <Link className="button button--secondary" to={`/chains/${chainId}/overview`}>
              Chain Overview
            </Link>
            <Link className="button button--secondary" to={`/chains/${chainId}/notes?ownerType=chain&ownerId=${workspace.chain.id}`}>
              Chain Notes
            </Link>
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />

      {simpleMode ? (
        <details className="details-panel" open={hasStarted}>
          <summary className="details-panel__summary">
            <span>{cosmicBackpackSetupGuide.title}</span>
            <div className="inline-meta">
              <ReadinessPill tone="optional" label={hasStarted ? 'In progress' : 'Optional later'} />
              <span className="pill">Simple page guide</span>
            </div>
          </summary>
          <div className="details-panel__body stack stack--compact">
            <PlainLanguageHint
              term="Cosmic Backpack"
              meaning="an optional warehouse replacement built around one indestructible bag and a short list of upgrades."
            />
            <p>{cosmicBackpackSetupGuide.summary}</p>
            <SetupGuidePanels guide={cosmicBackpackSetupGuide} />
          </div>
        </details>
      ) : null}

      <section className="card stack">
        <div className="section-heading">
          <h3>Backpack Summary</h3>
          <div className="inline-meta">
            <AutosaveStatusIndicator status={chainAutosave.status} />
            <span className="pill">{COSMIC_BACKPACK_TOTAL_BP} base BP</span>
          </div>
        </div>

        <div className="summary-grid">
          <article className="metric">
            <strong>{formatBudget(summary.totalBp)}</strong>
            <span>Total BP available</span>
          </article>
          <article className="metric">
            <strong>{formatBudget(summary.spentBp)}</strong>
            <span>Spent BP</span>
          </article>
          <article className="metric">
            <strong>{formatSignedBudget(summary.remainingBp)}</strong>
            <span>{summary.remainingBp < 0 ? 'Over budget' : 'Remaining BP'}</span>
          </article>
          <article className="metric">
            <strong>{formatBudget(summary.transferredBp)}</strong>
            <span>Net transferred BP</span>
          </article>
          <article className="metric">
            <strong>{formatVolumePair(summary.storageVolumeFt3)}</strong>
            <span>Interior volume</span>
            <small className="field-hint">
              {volumeReference.text === 'Big enough'
                ? 'As much space as... well, big enough.'
                : `As much space as... ${volumeReference.text} (OoM +${volumeReference.oom}).`}
            </small>
          </article>
          <article className="metric">
            <strong>{summary.selectedOptionCount}</strong>
            <span>Catalog upgrades</span>
          </article>
          <article className="metric">
            <strong>{summary.customUpgradeCount}</strong>
            <span>Custom upgrades</span>
            {summary.customUpgradeCount > 0 ? (
              <small className="field-hint">
                x{formatDecimal(summary.customVolumeMultiplier)} scaling and +{formatDecimal(summary.customAddedVolumeFt3)} ft^3 custom volume.
              </small>
            ) : null}
          </article>
        </div>

        <p className="field-hint">
          Warehouse add-ons from any supplement can be bought with Backpack BP. Use participation currency exchanges to move CP into
          the Backpack budget when you want cross-supplement warehouse purchases to land here.
        </p>

        <SimpleModeAffirmation message={simpleAffirmation} />

        {summary.warnings.length > 0 ? (
          <div className="status status--warning">
            <strong>Things to check</strong>
            <ul className="list">
              {summary.warnings.map((warning) => (
                <li key={warning}>
                  <SearchHighlight text={warning} query={highlightQuery} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Base Item</h3>
            <span className="pill pill--soft">Free</span>
          </div>
          <p>
            <SearchHighlight text={cosmicBackpackBaseDescription} query={highlightQuery} />
          </p>
          <p>The base bag is always light, comfortable to carry, and returns within a day if it is lost or stolen.</p>
          <div className="inline-meta">
            <span className="pill pill--soft">8 x 8 x 8 feet</span>
            <span className="pill pill--soft">Indestructible</span>
            <span className="pill pill--soft">Always returns</span>
          </div>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Bag Notes</h3>
            <div className="actions">
              <button className="button button--secondary" type="button" onClick={handleReset}>
                Reset Backpack Plan
              </button>
            </div>
          </div>

          {selectedOptionIds.includes('custom-appearance') ? (
            <label className="field">
              <span>Appearance notes</span>
              <textarea
                rows={3}
                value={state.appearanceNotes}
                onChange={(event) =>
                  updateState((currentState) => ({
                    ...currentState,
                    appearanceNotes: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          {selectedOptionIds.includes('not-a-backpack') ? (
            <label className="field">
              <span>Container form</span>
              <input
                value={state.containerForm}
                placeholder="Satchel, purse, luggage..."
                onChange={(event) =>
                  updateState((currentState) => ({
                    ...currentState,
                    containerForm: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          <label className="field">
            <span>Planning notes</span>
            <small className="field-hint">Use this for how the Backpack fits your chain, what it replaces, or what you plan to buy later.</small>
            <textarea
              rows={6}
              value={state.notes}
              onChange={(event) =>
                updateState((currentState) => ({
                  ...currentState,
                  notes: event.target.value,
                }))
              }
            />
          </label>

          <div className="stack stack--compact">
            <strong>Reference notes from the supplement</strong>
            <ul className="list">
              <li>Sentient living beings cannot be stored in the bag.</li>
              <li>Visible attachments can be hidden away with a thought when not in use.</li>
              <li>Food Supply leftovers and Crafting Tools byproducts can simply deteriorate away when left behind.</li>
            </ul>
          </div>
        </article>
      </section>

      <CosmicBackpackOptionSection
        title="Core Upgrades"
        description="These shape how the bag behaves before you start layering on shelter and utility attachments."
        options={coreUpgrades}
        selectedOptionIds={selectedOptionIds}
        highlightQuery={highlightQuery}
        onToggle={handleToggle}
        defaultOpen={selectedCoreUpgradeCount > 0 || (!hasStarted && highlightQuery.trim().length === 0)}
      />

      <CosmicBackpackOptionSection
        title="Attachments"
        description="These turn the bag into a portable survival kit, campsite, workshop, or support platform."
        options={attachments}
        selectedOptionIds={selectedOptionIds}
        highlightQuery={highlightQuery}
        onToggle={handleToggle}
        defaultOpen={selectedAttachmentCount > 0 || highlightQuery.trim().length > 0}
      />

      <CosmicBackpackOptionSection
        title="Modifiers"
        description="These two modifiers are always included so warehouse add-ons from other supplements can collapse into portable items and be bought with Backpack BP."
        options={modifiers}
        selectedOptionIds={selectedOptionIds}
        highlightQuery={highlightQuery}
        onToggle={handleToggle}
        lockedOptionIds={[...cosmicBackpackMandatoryOptionIds]}
        defaultOpen={selectedModifierCount > 0 && highlightQuery.trim().length > 0}
      />

      <CosmicBackpackCustomUpgradeSection
        customUpgrades={state.customUpgrades}
        highlightQuery={highlightQuery}
        defaultOpen={state.customUpgrades.length > 0}
        onChange={(nextCustomUpgrades) =>
          updateState((currentState) => ({
            ...currentState,
            customUpgrades: nextCustomUpgrades,
          }))
        }
      />

      <section className="card stack">
        <div className="section-heading">
          <h3>Current Loadout</h3>
          <span className="pill pill--soft">{activeLoadoutCount} active</span>
        </div>
        {userSelectedOptions.length === 0 && state.customUpgrades.length === 0 ? (
          <p className="field-hint">
            The two warehouse-compression modifiers are already active. Add any other upgrades here only when the chain actually needs them.
          </p>
        ) : null}
        {activeLoadoutCount > 0 ? (
          <ul className="list">
            {selectedOptions.map((option) => (
              <li key={option.id}>
                <strong>{option.title}</strong> {option.costBp === 0 ? '(Free)' : `(${option.costBp} BP)`}
              </li>
            ))}
            {state.customUpgrades.map((upgrade) => (
              <li key={upgrade.id}>
                <strong>{upgrade.title}</strong> {upgrade.costBp === 0 ? '(Free)' : `(${formatDecimal(upgrade.costBp)} BP)`}
                {upgrade.addedVolumeFt3 > 0 || upgrade.volumeMultiplier !== 1
                  ? ` | ${upgrade.addedVolumeFt3 > 0 ? `+${formatDecimal(upgrade.addedVolumeFt3)} ft^3` : ''}${upgrade.addedVolumeFt3 > 0 && upgrade.volumeMultiplier !== 1 ? ', ' : ''}${upgrade.volumeMultiplier !== 1 ? `x${formatDecimal(upgrade.volumeMultiplier)} scale` : ''}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No upgrades selected yet. The free base bag is still a valid starting point.</p>
        )}
      </section>
    </div>
  );
}
