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
  createDefaultCosmicBackpackState,
  getCosmicBackpackMissingRequirementIds,
  readCosmicBackpackState,
  setCosmicBackpackOptionSelected,
  writeCosmicBackpackState,
} from './model';

function formatBudget(value: number) {
  return new Intl.NumberFormat().format(value);
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
}) {
  return (
    <section className="card stack">
      <div className="section-heading">
        <h3>{props.title}</h3>
        <span className="pill">{props.options.length}</span>
      </div>
      <p>{props.description}</p>
      <div className="checkbox-list">
        {props.options.map((option) => {
          const selected = props.selectedOptionIds.includes(option.id);
          const locked = props.lockedOptionIds?.includes(option.id) ?? false;
          const missingRequirementIds = getCosmicBackpackMissingRequirementIds(
            {
              version: 1,
              selectedOptionIds: props.selectedOptionIds,
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
    </section>
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
  const selectedOptions = selectedOptionIds.map((optionId) => cosmicBackpackOptionsById[optionId]).filter(Boolean);
  const userSelectedOptions = selectedOptions.filter(
    (option) =>
      !cosmicBackpackMandatoryOptionIds.includes(option.id as (typeof cosmicBackpackMandatoryOptionIds)[number]),
  );
  const hasStarted =
    userSelectedOptions.length > 0 ||
    state.appearanceNotes.trim().length > 0 ||
    state.containerForm.trim().length > 0 ||
    state.notes.trim().length > 0;

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before using the Cosmic Backpack workspace." />;
  }

  function updateState(updater: (currentState: ReturnType<typeof readCosmicBackpackState>) => ReturnType<typeof readCosmicBackpackState>) {
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

  const coreUpgrades = cosmicBackpackOptionCatalog.filter((option) => option.category === 'core-upgrade');
  const attachments = cosmicBackpackOptionCatalog.filter((option) => option.category === 'attachment');
  const modifiers = cosmicBackpackOptionCatalog.filter((option) => option.category === 'modifier');

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
            <strong>
              {formatBudget(summary.storageVolumeFt3)} ft^3 / {summary.storageVolumeM3} m^3
            </strong>
            <span>Interior volume</span>
          </article>
          <article className="metric">
            <strong>{summary.selectedOptionCount}</strong>
            <span>Chosen upgrades</span>
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
      />

      <CosmicBackpackOptionSection
        title="Attachments"
        description="These turn the bag into a portable survival kit, campsite, workshop, or support platform."
        options={attachments}
        selectedOptionIds={selectedOptionIds}
        highlightQuery={highlightQuery}
        onToggle={handleToggle}
      />

      <CosmicBackpackOptionSection
        title="Modifiers"
        description="These two modifiers are always included so warehouse add-ons from other supplements can collapse into portable items and be bought with Backpack BP."
        options={modifiers}
        selectedOptionIds={selectedOptionIds}
        highlightQuery={highlightQuery}
        onToggle={handleToggle}
        lockedOptionIds={[...cosmicBackpackMandatoryOptionIds]}
      />

      <section className="card stack">
        <div className="section-heading">
          <h3>Current Loadout</h3>
          <span className="pill pill--soft">{selectedOptions.length} active</span>
        </div>
        {userSelectedOptions.length === 0 ? (
          <p className="field-hint">
            The two warehouse-compression modifiers are already active. Add any other upgrades here only when the chain actually needs them.
          </p>
        ) : null}
        {selectedOptions.length > 0 ? (
          <ul className="list">
            {selectedOptions.map((option) => (
              <li key={option.id}>
                <strong>{option.title}</strong> {option.costBp === 0 ? '(Free)' : `(${option.costBp} BP)`}
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
