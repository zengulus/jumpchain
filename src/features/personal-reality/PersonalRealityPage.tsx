import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  personalRealityCoreModes,
  personalRealityExtraModes,
  personalRealityOptionCatalog,
  personalRealityOptionsById,
  personalRealityPages,
  personalRealitySections,
  type PersonalRealityExtraModeId,
  type PersonalRealityOption,
} from './catalog';
import {
  buildPersonalRealityPlanSummary,
  createDefaultPersonalRealityState,
  createDefaultSelectionState,
  isLimitationOption,
  readPersonalRealityState,
  writePersonalRealityState,
  type PersonalRealitySelectionState,
  type PersonalRealityState,
} from './model';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { SearchHighlight } from '../search/SearchHighlight';
import { SetupGuidePanels, personalRealitySetupGuide } from '../supplement-guides/SetupGuidePanels';
import {
  AssistiveHint,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  PlainLanguageHint,
  ReadinessPill,
  SimpleModeAffirmation,
  TooltipFrame,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { saveChainEntity } from '../workspace/records';

const PERSONAL_REALITY_WP_CURRENCY_KEY = 'personal-reality-wp';

interface CoreModeGuideRow {
  id: PersonalRealityState['coreModeId'];
  title: string;
  startingBudget: string;
  ongoingBudget: string;
  purchaseRule: string;
  planningRead: string;
}

interface ExtraModeGuideRow {
  id: PersonalRealityExtraModeId;
  title: string;
  effect: string;
  planningRead: string;
}

type PersonalRealityPlanSummary = ReturnType<typeof buildPersonalRealityPlanSummary>;

const coreModeGuideRows: CoreModeGuideRow[] = [
  {
    id: 'upfront',
    title: 'Upfront',
    startingBudget: '1500 WP',
    ongoingBudget: 'None',
    purchaseRule: 'Pick any 3 purchase groups and all entries in those groups are half price.',
    planningRead: 'Best when you want a stable, front-loaded build and know the main facilities you want now.',
  },
  {
    id: 'incremental',
    title: 'Incremental',
    startingBudget: '500 WP',
    ongoingBudget: '+50 WP per completed jump or gauntlet',
    purchaseRule: 'Normal purchase rules. Budget grows steadily with chain length.',
    planningRead: 'Best when you want to start small and add infrastructure as the chain continues.',
  },
  {
    id: 'unlimited',
    title: 'Unlimited',
    startingBudget: '0 WP',
    ongoingBudget: 'Up to 100 CP -> 100 WP per eligible jump',
    purchaseRule: 'Separate from the general page-1 50 CP -> 2 WP exchange. Track actual transferred WP.',
    planningRead: 'Best when Personal Reality spending should compete directly with jump CP on a jump-by-jump basis.',
  },
  {
    id: 'reasonable',
    title: 'Reasonable',
    startingBudget: '3000 WP',
    ongoingBudget: '+100 WP every 5th completed jump',
    purchaseRule: 'Cannot buy any single entry costing more than 100 WP.',
    planningRead: 'Best when you want a broad but intentionally grounded build without giant headline purchases.',
  },
  {
    id: 'therehouse',
    title: 'Therehouse',
    startingBudget: '5000 WP',
    ongoingBudget: '+200 CP per jump',
    purchaseRule: 'Your Personal Reality becomes a real, vulnerable in-setting location.',
    planningRead: 'Best when you want the reality itself to be part of the story, logistics, and threats.',
  },
];

const extraModeGuideRows: ExtraModeGuideRow[] = [
  {
    id: 'patient-jumper',
    title: 'Patient Jumper',
    effect: '+100 WP for each jump after the first where you delayed taking the Personal Reality.',
    planningRead: 'Use this when the supplement is entering an already-running chain or intentionally late start.',
  },
  {
    id: 'swap-out',
    title: 'Swap-Out',
    effect: 'Rebuild an old warehouse-style chain into this supplement. The 25+ jump Incremental case starts at 700 WP.',
    planningRead: 'Use this when you are converting a mature chain rather than starting fresh.',
  },
  {
    id: 'cross-roads',
    title: 'Cross-Roads',
    effect: 'Each qualifying drawback trigger adds 5 collective WP to the shared Crossroads Tavern, not your own build.',
    planningRead: 'Use this when you want inter-jumper metaplay tracked alongside your own Personal Reality.',
  },
];

const purchaseGuideItems = [
  'Freebies listed by the supplement are treated as already included. Optional freebies still need you to opt in.',
  'Repeatable purchases use counters. WP-side and CP-side counts can be tracked separately when the supplement allows both.',
  'Upfront discounts are applied by purchase group, not just one row. Discounting Medical Bay also discounts its upgrades.',
  'Limitations add WP only while active. If you mark one as bought off, the builder adds the 150% buyoff cost.',
  'The builder tracks CP commitments here, but it does not yet subtract that CP from jump participation budgets automatically.',
];

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatSignedNumber(value: number) {
  return value < 0 ? `-${formatNumber(Math.abs(value))}` : formatNumber(value);
}

function parseIntegerInput(value: string) {
  if (value.trim().length === 0) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function parseNullableIntegerInput(value: string) {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function parseSignedNumberInput(value: string) {
  if (value.trim().length === 0) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRecordStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
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

function getJumpTrackedPersonalRealityBudget(workspace: ReturnType<typeof useChainWorkspace>['workspace']) {
  return workspace.participations.reduce(
    (totals, participation) => {
      const rawCurrencyDefinitions =
        typeof participation.importSourceMetadata === 'object' &&
        participation.importSourceMetadata !== null &&
        !Array.isArray(participation.importSourceMetadata)
          ? (participation.importSourceMetadata.currencies as Record<string, unknown> | undefined)
          : undefined;

      for (const exchange of participation.currencyExchanges) {
        const record =
          typeof exchange === 'object' && exchange !== null && !Array.isArray(exchange)
            ? (exchange as Record<string, unknown>)
            : {};
        const fromCurrency =
          getRecordStringValue(record, ['fromCurrency', 'sourceCurrency', 'currencyFrom', 'sourceCurrencyKey', 'from', 'source']) ??
          getRecordStringValue(record, ['currency']) ??
          '0';
        const toCurrency = getRecordStringValue(record, ['toCurrency', 'targetCurrency', 'currencyTo', 'targetCurrencyKey', 'to', 'target']);
        const fromAmount = getRecordNumberValue(record, ['fromAmount', 'sourceAmount', 'spent', 'amount', 'value']) ?? 0;
        const toAmount = getRecordNumberValue(record, ['toAmount', 'targetAmount', 'receivedAmount', 'convertedAmount', 'received']) ?? 0;

        if (toCurrency !== PERSONAL_REALITY_WP_CURRENCY_KEY || toAmount === 0) {
          continue;
        }

        totals.jumpTrackedWp += toAmount;

        const fromCurrencyDefinition =
          rawCurrencyDefinitions && typeof rawCurrencyDefinitions === 'object' && fromCurrency in rawCurrencyDefinitions
            ? (rawCurrencyDefinitions[fromCurrency] as Record<string, unknown> | undefined)
            : undefined;
        const fromCurrencyName =
          fromCurrencyDefinition && typeof fromCurrencyDefinition.name === 'string'
            ? fromCurrencyDefinition.name.toLowerCase()
            : '';
        const fromCurrencyAbbrev =
          fromCurrencyDefinition && typeof fromCurrencyDefinition.abbrev === 'string'
            ? fromCurrencyDefinition.abbrev.toLowerCase()
            : '';
        const countsAsCp =
          fromCurrency === '0' ||
          fromCurrency.toLowerCase() === 'cp' ||
          fromCurrencyName.includes('choice point') ||
          fromCurrencyAbbrev === 'cp';

        if (countsAsCp) {
          totals.jumpTrackedCpSpent += fromAmount;
        }
      }

      return totals;
    },
    {
      jumpTrackedWp: 0,
      jumpTrackedCpSpent: 0,
    },
  );
}

function getPageSummaryCount(counts: Record<number, number>, pageNumber: number) {
  return counts[pageNumber] ?? 0;
}

function getDiscountGroupId(option: PersonalRealityOption) {
  return option.discountGroupId ?? option.id;
}

function getDiscountGroupLabel(option: PersonalRealityOption) {
  return option.discountGroupLabel ?? option.title;
}

function getDiscountGroups() {
  const groups = new Map<string, { id: string; label: string }>();

  for (const option of personalRealityOptionCatalog) {
    const cost = option.wpCost ?? 0;

    if (cost <= 0) {
      continue;
    }

    const id = getDiscountGroupId(option);

    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: getDiscountGroupLabel(option),
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function describeCounterState(option: PersonalRealityOption, selection: PersonalRealitySelectionState) {
  if (option.id === 'personal-mod-pods') {
    return selection.units > 0 ? `${2 ** Math.max(0, selection.units - 1)} total pod(s)` : 'No pods';
  }

  if (option.id === 'starting-collection') {
    return selection.units > 0 ? `${selection.units} collection tier(s)` : 'No tiers';
  }

  if (option.id === 'pod-rack') {
    return selection.units > 0 ? `${selection.units} pod(s)` : 'No pods';
  }

  if (option.id === 'personal-realty') {
    return selection.units > 0 ? `${selection.units} galaxy copy/copies` : 'No galaxies selected';
  }

  const unitLabel = option.unitLabel ?? 'purchases';

  if (option.cpCost) {
    return `${selection.units} ${unitLabel} with WP | ${selection.cpUnits} with CP`;
  }

  return `${selection.units} ${unitLabel}`;
}

function getPageNumber(searchParams: URLSearchParams) {
  const requestedPage = Number(searchParams.get('page'));

  if (personalRealityPages.some((entry) => entry.number === requestedPage)) {
    return requestedPage;
  }

  return 2;
}

function getSectionForPage(pageNumber: number) {
  const page = personalRealityPages.find((entry) => entry.number === pageNumber);
  return personalRealitySections.find((entry) => entry.id === page?.sectionId) ?? personalRealitySections[0];
}

function getPreviousPage(pageNumber: number) {
  const currentIndex = personalRealityPages.findIndex((entry) => entry.number === pageNumber);
  return currentIndex > 0 ? personalRealityPages[currentIndex - 1] : null;
}

function getNextPage(pageNumber: number) {
  const currentIndex = personalRealityPages.findIndex((entry) => entry.number === pageNumber);
  return currentIndex >= 0 && currentIndex < personalRealityPages.length - 1 ? personalRealityPages[currentIndex + 1] : null;
}

function coreModeSummaryText(coreModeId: PersonalRealityState['coreModeId']) {
  const coreMode = personalRealityCoreModes.find((entry) => entry.id === coreModeId);
  return coreMode ? coreMode.summary : 'Choose one core mode first. That choice defines the whole budget model for this supplement.';
}

function getRequirementTitles(option: PersonalRealityOption) {
  const requirementIds = option.requiresOptionIds ?? [];

  if (requirementIds.length > 0) {
    return requirementIds
      .map((requirementId) => personalRealityOptionsById[requirementId]?.title ?? requirementId)
      .join(', ');
  }

  return option.requirementsText ?? 'None listed.';
}

function isDiscounted(state: PersonalRealityState, option: PersonalRealityOption) {
  return state.coreModeId === 'upfront' && state.discountedGroupIds.includes(getDiscountGroupId(option));
}

function getCurrentModeGuide(coreModeId: PersonalRealityState['coreModeId']) {
  return coreModeGuideRows.find((entry) => entry.id === coreModeId) ?? null;
}

function getPageGuideLines(pageNumber: number, options: PersonalRealityOption[]) {
  const lines: string[] = [];

  if (pageNumber === 2) {
    lines.push('Choose exactly one core mode. Everything else in the supplement uses that budget model.');
  }

  if (pageNumber === 3) {
    lines.push('Extra modes stack on top of the selected core mode. None of them replace the core mode.');
  }

  if (pageNumber === 4) {
    lines.push('This is the baseline foundation page. Most of the listed freebies are treated as already included.');
  }

  if (options.some((option) => option.kind === 'counter')) {
    lines.push('Rows with counters are repeatable purchases. Use the purchase count fields instead of treating them as one-off toggles.');
  }

  if (options.some((option) => option.cpCost)) {
    lines.push('Some entries can be bought with CP as well as WP. The builder tracks that split, but it does not deduct jump CP automatically yet.');
  }

  if (options.some((option) => isLimitationOption(option))) {
    lines.push('Limitations add WP when active. Buying them off costs 150% of their listed value.');
  }

  if (pageNumber >= 20 && pageNumber <= 38) {
    lines.push('These pages are mostly facilities and extensions. Think of them as physical infrastructure rather than abstract rules.');
  }

  if (pageNumber >= 39 && pageNumber <= 47) {
    lines.push('These pages mix item support, companion logistics, and special rule modules. They are less foundational and more interpretive.');
  }

  return Array.from(new Set(lines));
}

function BudgetEditor(props: {
  state: PersonalRealityState;
  summary: PersonalRealityPlanSummary;
  currentModeGuide: CoreModeGuideRow | null;
  completedJumpCountFromChain: number;
  jumpTrackedBudget: {
    jumpTrackedWp: number;
    jumpTrackedCpSpent: number;
  };
  onStateChange: (updater: (state: PersonalRealityState) => PersonalRealityState) => void;
}) {
  const { simpleMode } = useUiPreferences();
  const discountGroups = getDiscountGroups();
  const isOverBudget = props.summary.remainingWp < 0;

  function setDiscountGroup(index: number, nextGroupId: string) {
    props.onStateChange((currentState) => {
      const discountedGroupIds = currentState.discountedGroupIds.slice(0, 3);

      while (discountedGroupIds.length < 3) {
        discountedGroupIds.push('');
      }

      discountedGroupIds[index] = nextGroupId;

      return {
        ...currentState,
        discountedGroupIds: discountedGroupIds.filter((value, entryIndex, array) => value.length > 0 && array.indexOf(value) === entryIndex),
      };
    });
  }

  return (
    <section className="personal-reality-panel personal-reality-budget-panel">
      <div className="personal-reality-panel__header">
        <div>
          <h3>Budget And Mode Ledger</h3>
          <p>
            {simpleMode
              ? 'Pick the budget model first. After that, the worksheet can stay focused on one page at a time.'
              : 'Set the budget model once, then keep transfers and adjustments here without crowding the worksheet.'}
          </p>
        </div>
        <span className="pill">Pages 2-3</span>
      </div>

      <div className="personal-reality-panel__body stack">
        <div className="personal-reality-summary-strip personal-reality-summary-strip--compact">
          <div className="personal-reality-summary-stat">
            <strong>{props.currentModeGuide?.title ?? 'Choose a mode'}</strong>
            <span>Current mode</span>
          </div>
          <div className="personal-reality-summary-stat">
            <strong>{formatNumber(props.summary.availableWp)}</strong>
            <span>{simpleMode ? 'Total WP' : 'Available WP'}</span>
          </div>
          {!simpleMode ? (
            <div className="personal-reality-summary-stat">
              <strong>{formatNumber(props.summary.wpSpent)}</strong>
              <span>Spent WP</span>
            </div>
          ) : null}
          <div className={`personal-reality-summary-stat${isOverBudget ? ' is-negative' : ''}`}>
            <strong>{formatSignedNumber(props.summary.remainingWp)}</strong>
            <span>{isOverBudget ? 'Over budget' : 'Remaining WP'}</span>
          </div>
          <div className="personal-reality-summary-stat">
            <strong>{formatNumber(props.summary.completedJumpCount)}</strong>
            <span>Counted jumps</span>
          </div>
        </div>

        {simpleMode ? (
          <section className="section-surface stack stack--compact personal-reality-budget-intro">
            <strong>Start with the mode, not the whole supplement</strong>
            <p className="workspace-sidebar-copy">
              Pick one core mode first. Then only turn on extra modes that truly apply to this chain. If you are unsure, leave an extra mode off and keep moving.
            </p>
          </section>
        ) : (
          <div className="guidance-strip">
            <strong>Budget math stays here.</strong>
            <p>References stay beside the controls so the important inputs are visible immediately.</p>
          </div>
        )}

        <div className="personal-reality-budget-layout">
          <div className="stack personal-reality-budget-layout__controls">
            <div className="personal-reality-control-panel">
              <div className="personal-reality-control-panel__title">Mode and funding inputs</div>

              <div className="field-grid field-grid--two">
                <label className="field">
                  <span className="field-label-row">
                    <span>Core mode</span>
                    <AssistiveHint text={coreModeSummaryText(props.state.coreModeId)} triggerLabel="Explain Personal Reality core modes" />
                  </span>
                  <select
                    value={props.state.coreModeId}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        coreModeId: event.target.value as PersonalRealityState['coreModeId'],
                        discountedGroupIds: event.target.value === 'upfront' ? currentState.discountedGroupIds.slice(0, 3) : [],
                      }))
                    }
                  >
                    <option value="">Select a core mode</option>
                    {personalRealityCoreModes.map((coreMode) => (
                      <option key={coreMode.id} value={coreMode.id}>
                        {coreMode.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field-label-row">
                    <span>Completed jumps override</span>
                    <AssistiveHint
                      text={`Chain currently shows ${formatNumber(props.completedJumpCountFromChain)} completed jumps.`}
                      triggerLabel="Explain completed jumps override"
                    />
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={props.state.budget.completedJumpCountOverride ?? ''}
                    placeholder={String(props.completedJumpCountFromChain)}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          completedJumpCountOverride: parseNullableIntegerInput(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="field">
                <span>Extra modes</span>
                <div className="checkbox-list">
                  {personalRealityExtraModes.map((extraMode) => {
                    const checked = props.state.extraModeIds.includes(extraMode.id);

                    return (
                      <label className="checkbox-row" key={extraMode.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            props.onStateChange((currentState) => ({
                              ...currentState,
                              extraModeIds: event.target.checked
                                ? Array.from(new Set([...currentState.extraModeIds, extraMode.id]))
                                : currentState.extraModeIds.filter((entry) => entry !== extraMode.id),
                            }))
                          }
                        />
                        <span>
                          <strong>{extraMode.title}</strong> | {extraMode.summary}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {props.state.coreModeId === 'upfront' ? (
                <div className="field-grid field-grid--three">
                  {[0, 1, 2].map((index) => (
                    <label className="field" key={index}>
                      <span>Discount slot {index + 1}</span>
                      <select value={props.state.discountedGroupIds[index] ?? ''} onChange={(event) => setDiscountGroup(index, event.target.value)}>
                        <option value="">No discount</option>
                        {discountGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="field-grid field-grid--two">
                {props.state.extraModeIds.includes('patient-jumper') ? (
                  <label className="field">
                    <span>Patient Jumper delayed jumps</span>
                    <input
                      type="number"
                      min={0}
                      value={props.state.budget.patientJumperDelayedJumps}
                      onChange={(event) =>
                        props.onStateChange((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            patientJumperDelayedJumps: parseIntegerInput(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                {props.state.extraModeIds.includes('swap-out') ? (
                  <label className="field">
                    <span className="field-label-row">
                      <span>Swap-Out experienced jumps</span>
                      <AssistiveHint
                        text="The documented 700 WP Incremental case unlocks at 25+ jumps."
                        triggerLabel="Explain Swap-Out experienced jumps"
                      />
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={props.state.budget.swapOutExperiencedJumps}
                      onChange={(event) =>
                        props.onStateChange((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            swapOutExperiencedJumps: parseIntegerInput(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                {props.state.extraModeIds.includes('cross-roads') ? (
                  <label className="field">
                    <span className="field-label-row">
                      <span>Crossroads triggered jumps</span>
                      <AssistiveHint
                        text="This tracks shared collective WP, not your own spendable pool."
                        triggerLabel="Explain Crossroads triggered jumps"
                      />
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={props.state.budget.crossroadsTriggeredJumps}
                      onChange={(event) =>
                        props.onStateChange((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            crossroadsTriggeredJumps: parseIntegerInput(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                {props.state.coreModeId === 'unlimited' ? (
                  <label className="field">
                    <span className="field-label-row">
                      <span>Unlimited mode transferred WP</span>
                      <AssistiveHint
                        text="Track the actual 1:1 CP-to-WP transfers you made in Unlimited mode."
                        triggerLabel="Explain Unlimited mode transferred WP"
                      />
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={props.state.budget.unlimitedTransferredWp}
                      onChange={(event) =>
                        props.onStateChange((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            unlimitedTransferredWp: parseIntegerInput(event.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                <label className="field">
                  <span className="field-label-row">
                    <span>Generic CP to WP purchases</span>
                    <AssistiveHint
                      text="Uses the supplement’s generic 50 CP to 2 WP exchange from page 1."
                      triggerLabel="Explain generic CP to WP purchases"
                    />
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={props.state.budget.generalCpToWpPurchases}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          generalCpToWpPurchases: parseIntegerInput(event.target.value),
                        },
                      }))
                    }
                  />
                </label>

                {props.jumpTrackedBudget.jumpTrackedWp > 0 || props.jumpTrackedBudget.jumpTrackedCpSpent > 0 ? (
                  <>
                    <label className="field">
                      <span>Jump-tracked WP transfers</span>
                      <input type="number" readOnly value={props.jumpTrackedBudget.jumpTrackedWp} />
                    </label>

                    <label className="field">
                      <span>Jump-tracked CP spent</span>
                      <input type="number" readOnly value={props.jumpTrackedBudget.jumpTrackedCpSpent} />
                    </label>
                  </>
                ) : null}

                <label className="field">
                  <span>UDS warehouse WP</span>
                  <input
                    type="number"
                    value={props.state.budget.udsWarehouseWp}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          udsWarehouseWp: parseSignedNumberInput(event.target.value),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Manual WP adjustment</span>
                  <input
                    type="number"
                    value={props.state.budget.manualWpAdjustment}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          manualWpAdjustment: parseSignedNumberInput(event.target.value),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Adjustment reason</span>
                  <input
                    type="text"
                    value={props.state.budget.manualWpAdjustmentReason}
                    onChange={(event) =>
                      props.onStateChange((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          manualWpAdjustmentReason: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="stack personal-reality-budget-layout__reference">
            <details className="details-panel" open={simpleMode ? undefined : true}>
              <summary className="details-panel__summary">
                <span>Core mode reference</span>
                <span className="pill">{simpleMode ? 'When you need it' : 'Lookup'}</span>
              </summary>
              <div className="details-panel__body">
                <div className="personal-reality-reference-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Mode</th>
                        <th>Start</th>
                        <th>Growth</th>
                        <th>Purchase rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coreModeGuideRows.map((row) => (
                        <tr className={props.state.coreModeId === row.id ? 'is-active' : ''} key={row.id}>
                          <td>
                            <strong>{row.title}</strong>
                            <span>{row.planningRead}</span>
                          </td>
                          <td>{row.startingBudget}</td>
                          <td>{row.ongoingBudget}</td>
                          <td>{row.purchaseRule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>

            <details className="details-panel" open={simpleMode ? undefined : true}>
              <summary className="details-panel__summary">
                <span>Extra mode reference</span>
                <span className="pill">{simpleMode ? 'When you need it' : 'Lookup'}</span>
              </summary>
              <div className="details-panel__body">
                <div className="personal-reality-reference-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Extra mode</th>
                        <th>Effect</th>
                        <th>Planning read</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraModeGuideRows.map((row) => (
                        <tr className={props.state.extraModeIds.includes(row.id) ? 'is-active' : ''} key={row.id}>
                          <td>
                            <strong>{row.title}</strong>
                          </td>
                          <td>{row.effect}</td>
                          <td>{row.planningRead}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function SelectionControl(props: {
  option: PersonalRealityOption;
  selection: PersonalRealitySelectionState;
  onSelectionChange: (updater: (selection: PersonalRealitySelectionState) => PersonalRealitySelectionState) => void;
}) {
  const { option, selection } = props;

  if (option.defaultSelected && option.wpCost === 0) {
    return (
      <div className="field">
        <span className="field-label-row">
          <span>Included</span>
          <AssistiveHint
            text="This freebie is part of the supplement’s built-in baseline."
            triggerLabel={`Explain ${option.title}`}
          />
        </span>
      </div>
    );
  }

  if (option.kind === 'variant') {
    return (
      <div className="stack stack--compact">
        <label className="field">
          <span>Selection</span>
          <select
            value={selection.variantId}
            onChange={(event) =>
              props.onSelectionChange((currentSelection) => {
                const nextVariantId = event.target.value;

                if (nextVariantId.length === 0) {
                  return createDefaultSelectionState();
                }

                if (option.id === 'all-your-peeps') {
                  return {
                    ...currentSelection,
                    variantId: nextVariantId,
                    units: nextVariantId === 'attempt-packs' ? Math.max(1, currentSelection.units) : currentSelection.units,
                    cpUnits: 0,
                  };
                }

                return {
                  ...currentSelection,
                  variantId: nextVariantId,
                  units: 0,
                  cpUnits: 0,
                };
              })
            }
          >
            <option value="">Not selected</option>
            {option.variants?.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        </label>

        {option.id === 'all-your-peeps' && selection.variantId === 'attempt-packs' ? (
          <label className="field">
            <span>Attempt packs</span>
            <input
              type="number"
              min={0}
              value={selection.units}
              onChange={(event) =>
                props.onSelectionChange((currentSelection) => ({
                  ...currentSelection,
                  units: parseIntegerInput(event.target.value),
                }))
              }
            />
          </label>
        ) : null}

        {option.id === 'all-your-peeps' && selection.variantId === 'unlimited-plan' ? (
          <label className="field">
            <span className="field-label-row">
              <span>Extra same-person retries</span>
              <AssistiveHint
                text="These extra retries still cost 50 WP each after taking the unlimited plan."
                triggerLabel="Explain extra same-person retries"
              />
            </span>
            <input
              type="number"
              min={0}
              value={selection.units}
              onChange={(event) =>
                props.onSelectionChange((currentSelection) => ({
                  ...currentSelection,
                  units: parseIntegerInput(event.target.value),
                }))
              }
            />
          </label>
        ) : null}
      </div>
    );
  }

  if (option.kind === 'counter') {
    return (
      <div className="field-grid field-grid--two">
        <label className="field">
          <span>{option.unitLabel ?? 'Purchases'}</span>
          <input
            type="number"
            min={0}
            value={selection.units}
            onChange={(event) =>
              props.onSelectionChange((currentSelection) => ({
                ...currentSelection,
                units: parseIntegerInput(event.target.value),
              }))
            }
          />
        </label>
        {option.cpCost ? (
          <label className="field">
            <span>{option.cpUnitLabel ?? 'CP purchases'}</span>
            <input
              type="number"
              min={0}
              value={selection.cpUnits}
              onChange={(event) =>
                props.onSelectionChange((currentSelection) => ({
                  ...currentSelection,
                  cpUnits: parseIntegerInput(event.target.value),
                }))
              }
            />
          </label>
        ) : null}
      </div>
    );
  }

  if (option.cpCost) {
    const value = selection.cpUnits > 0 ? 'cp' : selection.units > 0 ? 'wp' : '';

    return (
      <label className="field">
        <span>Purchase mode</span>
        <select
          value={value}
          onChange={(event) =>
            props.onSelectionChange(() => {
              switch (event.target.value) {
                case 'wp':
                  return {
                    units: 1,
                    cpUnits: 0,
                    variantId: '',
                    limitationStatus: 'active',
                  };
                case 'cp':
                  return {
                    units: 0,
                    cpUnits: 1,
                    variantId: '',
                    limitationStatus: 'active',
                  };
                default:
                  return createDefaultSelectionState();
              }
            })
          }
        >
          <option value="">Not purchased</option>
          <option value="wp">Buy with WP</option>
          <option value="cp">Buy with CP</option>
        </select>
      </label>
    );
  }

  return (
    <label className="checkbox-row">
      <input
        type="checkbox"
        checked={selection.units > 0}
        onChange={(event) =>
          props.onSelectionChange(() => ({
            units: event.target.checked ? 1 : 0,
            cpUnits: 0,
            variantId: '',
            limitationStatus: 'active',
          }))
        }
      />
      <span>{option.optionalFree ? 'Take this free option' : 'Mark as purchased'}</span>
    </label>
  );
}

function WorksheetRow(props: {
  option: PersonalRealityOption;
  state: PersonalRealityState;
  selection: PersonalRealitySelectionState;
  summary: ReturnType<typeof buildPersonalRealityPlanSummary>['selectionSummaries'][string];
  highlightQuery: string;
  onSelectionChange: (optionId: string, updater: (selection: PersonalRealitySelectionState) => PersonalRealitySelectionState) => void;
}) {
  const { option, selection, summary, state } = props;
  const missingRequirementTitles = summary.missingRequirementIds
    .map((requirementId) => personalRealityOptionsById[requirementId]?.title ?? requirementId)
    .join(', ');

  return (
    <article className={`personal-reality-row${summary.selected ? ' is-selected' : ''}`}>
      <div className="personal-reality-row__info">
        <div className="personal-reality-row__titleline">
          <strong>
            <SearchHighlight text={option.title} query={props.highlightQuery} />
          </strong>
          <div className="personal-reality-badge-strip">
            <span className="pill">{option.costText}</span>
            {option.kind === 'counter' ? <span className="pill pill--soft">Repeatable</span> : null}
            {option.cpCost ? <span className="pill pill--soft">WP / CP</span> : null}
            {isLimitationOption(option) ? <span className="pill pill--soft">Limitation</span> : null}
            {isDiscounted(state, option) ? <span className="pill pill--soft">Upfront discount</span> : null}
            {option.defaultSelected ? <span className="pill pill--soft">Default freebie</span> : null}
          </div>
        </div>
        <p>
          <SearchHighlight text={option.description} query={props.highlightQuery} />
        </p>
        <div className="personal-reality-row__rules">
          <div>
            <span>Requirements</span>
            <strong>{getRequirementTitles(option)}</strong>
          </div>
          {summary.selected && missingRequirementTitles.length > 0 ? (
            <div className="personal-reality-row__warning">
              <span>Missing</span>
              <strong>{missingRequirementTitles}</strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="personal-reality-row__controls">
        <SelectionControl option={option} selection={selection} onSelectionChange={(updater) => props.onSelectionChange(option.id, updater)} />
      </div>

      <div className="personal-reality-row__state">
        <div className="personal-reality-state-list">
          <div>
            <span>Status</span>
            <strong>{summary.selected ? 'Tracked' : 'Not selected'}</strong>
          </div>
          {summary.wpSpent > 0 ? (
            <div>
              <span>WP spent</span>
              <strong>{formatNumber(summary.wpSpent)}</strong>
            </div>
          ) : null}
          {summary.wpGain > 0 ? (
            <div>
              <span>WP gain</span>
              <strong>{formatNumber(summary.wpGain)}</strong>
            </div>
          ) : null}
          {summary.cpSpent > 0 ? (
            <div>
              <span>CP committed</span>
              <strong>{formatNumber(summary.cpSpent)}</strong>
            </div>
          ) : null}
          {option.kind === 'counter' && summary.selected ? (
            <div>
              <span>Count</span>
              <strong>{describeCounterState(option, selection)}</strong>
            </div>
          ) : null}
          {isLimitationOption(option) && summary.selected ? (
            <label className="field">
              <span>Limitation state</span>
              <select
                value={selection.limitationStatus}
                onChange={(event) =>
                  props.onSelectionChange(option.id, (currentSelection) => ({
                    ...currentSelection,
                    limitationStatus: event.target.value as PersonalRealitySelectionState['limitationStatus'],
                  }))
                }
              >
                <option value="active">Active now</option>
                <option value="resolved-by-time">Resolved by time and play</option>
                <option value="paid-off-wp">Bought off with WP</option>
                <option value="paid-off-cp">Bought off with CP</option>
              </select>
            </label>
          ) : null}
        </div>

        {option.kind === 'variant' && selection.variantId.length > 0 ? (
          <AssistiveHint
            text={option.variants?.find((variant) => variant.id === selection.variantId)?.summary ?? ''}
            triggerLabel={`Explain ${option.title} selection`}
          />
        ) : null}
      </div>
    </article>
  );
}

function BudgetSummaryPanel(props: {
  state: PersonalRealityState;
  summary: ReturnType<typeof buildPersonalRealityPlanSummary>;
  currentModeGuide: CoreModeGuideRow | null;
  onEditBudgetModes: () => void;
}) {
  const isOverBudget = props.summary.remainingWp < 0;

  return (
    <section className="personal-reality-panel">
      <div className="personal-reality-panel__header">
        <div>
          <h3>Budget &amp; Modes</h3>
          <p>The full ledger lives on pages 2-3. Jump back there when you need to adjust modes, discounts, or transfers.</p>
        </div>
        <span className="pill">Pages 2-3</span>
      </div>

      <div className="personal-reality-panel__body stack stack--compact">
        <div className="personal-reality-summary-strip personal-reality-summary-strip--compact">
          <div className="personal-reality-summary-stat">
            <strong>{props.currentModeGuide?.title ?? 'Choose a mode'}</strong>
            <span>Current mode</span>
          </div>
          <div className="personal-reality-summary-stat">
            <strong>{formatNumber(props.state.extraModeIds.length)}</strong>
            <span>Extra modes</span>
          </div>
          <div className="personal-reality-summary-stat">
            <strong>{formatNumber(props.summary.availableWp)}</strong>
            <span>Available WP</span>
          </div>
          <div className={`personal-reality-summary-stat${isOverBudget ? ' is-negative' : ''}`}>
            <strong>{formatSignedNumber(props.summary.remainingWp)}</strong>
            <span>{isOverBudget ? 'Over budget' : 'Remaining WP'}</span>
          </div>
        </div>

        <div className="actions">
          <button className="button button--secondary" type="button" onClick={props.onEditBudgetModes}>
            Edit Budget &amp; Modes
          </button>
        </div>
      </div>
    </section>
  );
}

export function PersonalRealityPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const { simpleMode } = useUiPreferences();
  const [resetUndoState, setResetUndoState] = useState<{
    pageNumber: number;
    state: PersonalRealityState;
  } | null>(null);
  const pageNumber = getPageNumber(searchParams);
  const currentPage = personalRealityPages.find((entry) => entry.number === pageNumber) ?? personalRealityPages[0];
  const currentSection = getSectionForPage(currentPage.number);
  const previousPage = getPreviousPage(currentPage.number);
  const nextPage = getNextPage(currentPage.number);
  const completedJumpCountFromChain = workspace.jumps.filter((jump) => jump.status === 'completed').length;
  const currentPageOptions = personalRealityOptionCatalog.filter((entry) => entry.page === currentPage.number);
  const pageGuideLines = getPageGuideLines(currentPage.number, currentPageOptions);
  const pageNoteKey = String(currentPage.number);
  const highlightQuery = searchParams.get('highlight') ?? '';
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextChain) => {
      await saveChainEntity(nextChain);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save the Personal Reality build.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const state = readPersonalRealityState(draftChain);
  const jumpTrackedBudget = getJumpTrackedPersonalRealityBudget(workspace);
  const summary = buildPersonalRealityPlanSummary(state, completedJumpCountFromChain, jumpTrackedBudget);
  const currentModeGuide = getCurrentModeGuide(state.coreModeId);
  const isOverBudget = summary.remainingWp < 0;
  const overBudgetAmount = Math.abs(summary.remainingWp);
  const showBudgetEditor = currentPage.number === 2 || currentPage.number === 3;
  const hasPersonalRealityStarted =
    Boolean(state.coreModeId) ||
    state.extraModeIds.length > 0 ||
    summary.selectedOptionCount > 0 ||
    state.notes.trim().length > 0 ||
    Object.values(state.pageNotes).some((note) => note.trim().length > 0) ||
    state.budget.completedJumpCountOverride !== null ||
    state.budget.patientJumperDelayedJumps > 0 ||
    state.budget.swapOutExperiencedJumps > 0 ||
    state.budget.crossroadsTriggeredJumps > 0 ||
    state.budget.generalCpToWpPurchases > 0 ||
    state.budget.unlimitedTransferredWp > 0 ||
    state.budget.udsWarehouseWp !== 0 ||
    state.budget.manualWpAdjustment !== 0 ||
    state.budget.manualWpAdjustmentReason.trim().length > 0;
  const { message: simpleAffirmation, showAffirmation, clearAffirmation } = useSimpleModeAffirmation();

  if (!workspace.activeBranch) {
    return (
      <EmptyWorkspaceCard
        title="No active branch"
        body="Create or restore a branch before using the Personal Reality workspace."
      />
    );
  }

  function updateState(
    updater: (currentState: PersonalRealityState) => PersonalRealityState,
    options?: {
      preserveResetUndo?: boolean;
    },
  ) {
    if (!options?.preserveResetUndo && resetUndoState) {
      setResetUndoState(null);
    }

    chainAutosave.updateDraft((currentChain) => {
      if (!currentChain) {
        return currentChain;
      }

      const nextState = updater(readPersonalRealityState(currentChain));
      return writePersonalRealityState(currentChain, nextState);
    });
  }

  function updateSelection(optionId: string, updater: (selection: PersonalRealitySelectionState) => PersonalRealitySelectionState) {
    updateState((currentState) => ({
      ...currentState,
      selections: {
        ...currentState.selections,
        [optionId]: updater(currentState.selections[optionId] ?? createDefaultSelectionState()),
      },
    }));
  }

  function navigateToPage(nextPageNumber: number, options?: { affirmation?: string }) {
    if (options?.affirmation) {
      showAffirmation(options.affirmation);
    } else {
      clearAffirmation();
    }

    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set('page', String(nextPageNumber));
      return nextParams;
    });
  }

  function handleResetBuild() {
    const confirmed = window.confirm(
      'Reset the Personal Reality build for this branch? This clears the current worksheet, page notes, and global notes.',
    );

    if (!confirmed) {
      return;
    }

    setResetUndoState({
      pageNumber: currentPage.number,
      state,
    });
    updateState(() => createDefaultPersonalRealityState(), { preserveResetUndo: true });
    navigateToPage(2);
  }

  function handleUndoReset() {
    if (!resetUndoState) {
      return;
    }

    const snapshot = resetUndoState;

    setResetUndoState(null);
    updateState(() => snapshot.state, { preserveResetUndo: true });
    navigateToPage(snapshot.pageNumber);
  }

  return (
    <div className="stack personal-reality-shell">
      <WorkspaceModuleHeader
        title="Personal Reality"
        description={
          simpleMode
            ? 'Plan warehouse-style housing, facilities, and long-term infrastructure here.'
            : 'A denser supplement workbench for planning the full Personal Reality build page by page.'
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

      {simpleMode ? (
        <details className="details-panel" open={hasPersonalRealityStarted}>
          <summary className="details-panel__summary">
            <span>{personalRealitySetupGuide.title}</span>
            <div className="inline-meta">
              <ReadinessPill tone="optional" label={hasPersonalRealityStarted ? 'In progress' : 'Optional later'} />
              <span className="pill">Simple page guide</span>
            </div>
          </summary>
          <div className="details-panel__body stack stack--compact">
            <PlainLanguageHint
              term="Personal Reality"
              meaning="an optional warehouse-style supplement workspace for long-term housing, facilities, and budget planning."
            />
            <p>{personalRealitySetupGuide.summary}</p>
            <SetupGuidePanels guide={personalRealitySetupGuide} />
          </div>
        </details>
      ) : null}

      <section className="personal-reality-panel personal-reality-toolbar">
        <div className="personal-reality-panel__header">
          <div>
            <h3>
              Page {currentPage.number}: <SearchHighlight text={currentPage.title} query={highlightQuery} />
            </h3>
            <p>
              <SearchHighlight text={`${currentSection.title} | ${currentPage.summary}`} query={highlightQuery} />
            </p>
          </div>
          <div className="personal-reality-toolbar__status">
            <AutosaveStatusIndicator status={chainAutosave.status} />
          </div>
        </div>

        <div className="personal-reality-toolbar__body">
          <div className="personal-reality-page-nav">
            <button className="button button--secondary" disabled={!previousPage} type="button" onClick={() => previousPage && navigateToPage(previousPage.number)}>
              Previous Page
            </button>
            <button
              className="button button--secondary"
              disabled={!nextPage}
              type="button"
              onClick={() =>
                nextPage &&
                navigateToPage(nextPage.number, {
                  affirmation:
                    simpleMode && currentPage.number === 2 && nextPage.number === 3 && state.coreModeId
                      ? 'The budget model is set. From here the worksheet can stay focused on one page at a time.'
                      : undefined,
                })
              }
            >
              Next Page
            </button>
            <button className="button button--secondary" type="button" onClick={() => navigateToPage(2)}>
              Modes
            </button>
            <button className="button button--secondary" type="button" onClick={() => navigateToPage(48)}>
              Limitations
            </button>
            <button
              className="button button--danger"
              type="button"
              onClick={handleResetBuild}
            >
              Reset Build
            </button>
          </div>

          {resetUndoState ? (
            <div className="status status--warning personal-reality-inline-status" role="status">
              <div className="stack stack--compact">
                <strong>Build reset for this branch.</strong>
                <p>Undo restores the previous worksheet, notes, and page position.</p>
              </div>
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={handleUndoReset}>
                  Undo reset
                </button>
              </div>
            </div>
          ) : null}

          {isOverBudget ? (
            <div className="status status--error personal-reality-inline-status" role="alert">
              <div className="stack stack--compact">
                <strong>Over budget by {formatNumber(overBudgetAmount)} WP.</strong>
                <p>Remove purchases or add more funding before you trust the current plan total.</p>
              </div>
            </div>
          ) : null}

          <SimpleModeAffirmation message={simpleAffirmation} />

          <div className="personal-reality-summary-strip">
            {simpleMode ? (
              <>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.availableWp)}</strong>
                  <span>Total WP</span>
                </div>
                <div className={`personal-reality-summary-stat${isOverBudget ? ' is-negative' : ''}`}>
                  <strong>{formatSignedNumber(summary.remainingWp)}</strong>
                  <span>{isOverBudget ? 'Over budget' : 'Still available'}</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{currentModeGuide?.title ?? 'Choose a mode'}</strong>
                  <span>Current mode</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.warnings.length)}</strong>
                  <span>Things to check</span>
                </div>
              </>
            ) : (
              <>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.availableWp)}</strong>
                  <span>Available WP</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.wpSpent)}</strong>
                  <span>Spent WP</span>
                </div>
                <div className={`personal-reality-summary-stat${isOverBudget ? ' is-negative' : ''}`}>
                  <strong>{formatSignedNumber(summary.remainingWp)}</strong>
                  <span>{isOverBudget ? 'Over budget' : 'Remaining WP'}</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.cpSpent)}</strong>
                  <span>Committed CP</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.selectedOptionCount)}</strong>
                  <span>Tracked rows</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.activeLimitationCount)}</strong>
                  <span>Active limitations</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.collectiveWp)}</strong>
                  <span>Crossroads C-WP</span>
                </div>
                <div className="personal-reality-summary-stat">
                  <strong>{formatNumber(summary.completedJumpCount)}</strong>
                  <span>Counted jumps</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="personal-reality-workspace">
        <aside className="personal-reality-panel personal-reality-rail">
          <div className="personal-reality-panel__header">
            <TooltipFrame tooltip={!simpleMode ? 'Move through the supplement the way it is written.' : undefined} placement="right">
              <div>
                <h3>Page Rail</h3>
                {simpleMode ? <p>Move through the supplement the way it is written.</p> : null}
              </div>
            </TooltipFrame>
            <span className="pill">1-56</span>
          </div>

          <div className="personal-reality-rail__body">
            {personalRealitySections.map((section) => (
              simpleMode ? (
                <details
                  className="personal-reality-rail__section personal-reality-rail__section--simple"
                  key={`${section.id}-${currentSection.id}`}
                  open={section.id === currentSection.id ? true : undefined}
                >
                  <summary className="personal-reality-rail__section-summary">
                    <strong>{section.title}</strong>
                    <span>
                      {section.pageStart}-{section.pageEnd}
                    </span>
                  </summary>
                  <p>{section.summary}</p>
                  <div className="personal-reality-rail__pages">
                    {personalRealityPages
                      .filter((page) => page.sectionId === section.id)
                      .map((page) => (
                        <button
                          className={`personal-reality-rail__page${page.number === currentPage.number ? ' is-active' : ''}`}
                          key={page.number}
                          type="button"
                          onClick={() => navigateToPage(page.number)}
                        >
                          <span className="personal-reality-rail__page-label">
                            {page.number}. <SearchHighlight text={page.title} query={highlightQuery} />
                          </span>
                          <span className="personal-reality-rail__page-summary">
                            <SearchHighlight text={page.summary} query={highlightQuery} />
                          </span>
                          <span className="personal-reality-rail__page-count">
                            {getPageSummaryCount(summary.pageSelectionCounts, page.number)} tracked
                          </span>
                        </button>
                      ))}
                  </div>
                </details>
              ) : (
                <section className="personal-reality-rail__section" key={section.id}>
                  <TooltipFrame tooltip={section.summary} placement="right">
                    <header>
                      <strong>{section.title}</strong>
                      <span>
                        {section.pageStart}-{section.pageEnd}
                      </span>
                    </header>
                  </TooltipFrame>
                  <div className="personal-reality-rail__pages">
                    {personalRealityPages
                      .filter((page) => page.sectionId === section.id)
                      .map((page) => (
                        <TooltipFrame
                          key={page.number}
                          tooltip={`${page.summary} ${getPageSummaryCount(summary.pageSelectionCounts, page.number)} tracked`}
                          placement="right"
                        >
                          <button
                            className={`personal-reality-rail__page${page.number === currentPage.number ? ' is-active' : ''}`}
                            type="button"
                            onClick={() => navigateToPage(page.number)}
                          >
                            <span className="personal-reality-rail__page-label">
                              {page.number}. <SearchHighlight text={page.title} query={highlightQuery} />
                            </span>
                          </button>
                        </TooltipFrame>
                      ))}
                  </div>
                </section>
              )
            ))}
          </div>
        </aside>

        <div className="stack personal-reality-center">
          {showBudgetEditor ? (
            <BudgetEditor
              state={state}
              summary={summary}
              currentModeGuide={currentModeGuide}
              completedJumpCountFromChain={completedJumpCountFromChain}
              jumpTrackedBudget={jumpTrackedBudget}
              onStateChange={updateState}
            />
          ) : (
            <BudgetSummaryPanel
              state={state}
              summary={summary}
              currentModeGuide={currentModeGuide}
              onEditBudgetModes={() => navigateToPage(2)}
            />
          )}

          <section className="personal-reality-panel">
            <div className="personal-reality-panel__header">
              <div>
                <h3>Current Page Worksheet</h3>
                <p>
                  {currentPageOptions.length > 0
                    ? `This page has ${currentPageOptions.length} tracked purchase row${currentPageOptions.length === 1 ? '' : 's'}.`
                    : 'This page is reference-only in the builder right now.'}
                </p>
              </div>
              <span className="pill">{currentSection.title}</span>
            </div>

            {currentPageOptions.length > 0 ? (
              <div className="personal-reality-worksheet">
                <div className="personal-reality-worksheet__header">
                  <span>Purchase and rules</span>
                  <span>Selection</span>
                  <span>State and accounting</span>
                </div>

                <div className="personal-reality-worksheet__body">
                  {currentPageOptions.map((option) => {
                    const optionSummary = summary.selectionSummaries[option.id];

                    return (
                      <WorksheetRow
                        key={option.id}
                        option={option}
                        state={state}
                        selection={optionSummary.selection}
                        summary={optionSummary}
                        highlightQuery={highlightQuery}
                        onSelectionChange={updateSelection}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="personal-reality-empty-state">
                <p>This page does not contain direct tracked purchases in the current builder model.</p>
                <p>Use the page notes in the right inspector to capture rulings, clarifications, or supplement text you care about here.</p>
              </div>
            )}
          </section>

          <section className="personal-reality-panel">
            <div className="personal-reality-panel__header">
              <div>
                <h3>Master Plan And Standing Rulings</h3>
                <p>Keep cross-page layout decisions, standing rulings, and long-term planning here. Use page notes only for page-specific calls.</p>
              </div>
              <span className="pill">Chain metadata</span>
            </div>
            <div className="personal-reality-panel__body">
              <label className="field">
                <span>Cross-page notes</span>
                <small className="field-hint">Use this for decisions that affect multiple pages or the whole Personal Reality build.</small>
                <textarea
                  rows={8}
                  value={state.notes}
                  onChange={(event) =>
                    updateState((currentState) => ({
                      ...currentState,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <aside className="stack personal-reality-inspector">
          <section className="personal-reality-panel">
            <div className="personal-reality-panel__header">
              <div>
                <h3>Current Page Context</h3>
                <p>Use this space like a right-hand inspector for page-specific context, rules, and notes while you work the worksheet.</p>
              </div>
            </div>

            <div className="personal-reality-panel__body stack">
              <div className="personal-reality-state-list">
                <div>
                  <span>Section</span>
                  <strong>
                    <SearchHighlight text={currentSection.title} query={highlightQuery} />
                  </strong>
                </div>
                <div>
                  <span>Tracked rows</span>
                  <strong>{formatNumber(getPageSummaryCount(summary.pageSelectionCounts, currentPage.number))}</strong>
                </div>
                <div>
                  <span>Current core mode</span>
                  <strong>{currentModeGuide?.title ?? 'None selected yet'}</strong>
                </div>
              </div>

              {currentModeGuide ? (
                <div className="personal-reality-brief">
                  <strong>{currentModeGuide.title}</strong>
                  <p>{currentModeGuide.planningRead}</p>
                  <p>
                    Start: {currentModeGuide.startingBudget} | Growth: {currentModeGuide.ongoingBudget}
                  </p>
                </div>
              ) : null}

              <div className="stack stack--compact">
                <strong>Page reading guide</strong>
                <ul className="list">
                  {pageGuideLines.map((line) => (
                    <li key={line}>
                      <SearchHighlight text={line} query={highlightQuery} />
                    </li>
                  ))}
                </ul>
              </div>

              <label className="field">
                <span>Notes for page {currentPage.number}</span>
                <small className="field-hint">Only use this for clarifications or reminders that belong to this page.</small>
                <textarea
                  rows={7}
                  value={state.pageNotes[pageNoteKey] ?? ''}
                  onChange={(event) =>
                    updateState((currentState) => ({
                      ...currentState,
                      pageNotes: {
                        ...currentState.pageNotes,
                        [pageNoteKey]: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>
          </section>

          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>Purchase rules</span>
                <span className="pill">Reference</span>
              </summary>
              <div className="details-panel__body">
                <ul className="list">
                  {purchaseGuideItems.map((item) => (
                    <li key={item}>
                      <SearchHighlight text={item} query={highlightQuery} />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : (
            <section className="personal-reality-panel">
              <div className="personal-reality-panel__header">
                <div>
                  <h3>Purchase Rules</h3>
                  <p>These are the interpretation rules the worksheet is following.</p>
                </div>
              </div>
              <div className="personal-reality-panel__body">
                <ul className="list">
                  {purchaseGuideItems.map((item) => (
                    <li key={item}>
                      <SearchHighlight text={item} query={highlightQuery} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {summary.therehouseCpPerCompletedJump > 0 ? (
            simpleMode ? (
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>Therehouse accounting</span>
                  <span className="pill">Reference</span>
                </summary>
                <div className="details-panel__body personal-reality-state-list">
                  <div>
                    <span>CP per jump</span>
                    <strong>{formatNumber(summary.therehouseCpPerCompletedJump)}</strong>
                  </div>
                  <div>
                    <span>Earned so far</span>
                    <strong>{formatNumber(summary.therehouseEarnedCp)}</strong>
                  </div>
                </div>
              </details>
            ) : (
              <section className="personal-reality-panel">
                <div className="personal-reality-panel__header">
                  <div>
                    <h3>Therehouse Accounting</h3>
                    <p>Tracked separately from the WP pool.</p>
                  </div>
                  <span className="pill">Page 2 / 56</span>
                </div>
                <div className="personal-reality-panel__body personal-reality-state-list">
                  <div>
                    <span>CP per jump</span>
                    <strong>{formatNumber(summary.therehouseCpPerCompletedJump)}</strong>
                  </div>
                  <div>
                    <span>Earned so far</span>
                    <strong>{formatNumber(summary.therehouseEarnedCp)}</strong>
                  </div>
                </div>
              </section>
            )
          ) : null}

          {summary.warnings.length > 0 ? (
            <section className="personal-reality-panel">
              <div className="personal-reality-panel__header">
                <div>
                  <h3>Warnings</h3>
                  <p>Things worth checking before you trust the current total.</p>
                </div>
                <span className="pill">{summary.warnings.length}</span>
              </div>
              <div className="personal-reality-panel__body">
                <ul className="list">
                  {summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
