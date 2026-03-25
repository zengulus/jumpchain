import { Link, useSearchParams } from 'react-router-dom';
import {
  personalRealityCoreModes,
  personalRealityExtraModes,
  personalRealityOptionCatalog,
  personalRealityPages,
  personalRealitySections,
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
import { EmptyWorkspaceCard, AutosaveStatusIndicator, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { saveChainEntity } from '../workspace/records';

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
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

function coreModeSummaryText(coreModeId: PersonalRealityState['coreModeId']) {
  const coreMode = personalRealityCoreModes.find((entry) => entry.id === coreModeId);
  return coreMode ? coreMode.summary : 'Pick a core mode to start tracking your Personal Reality budget.';
}

function BudgetEditor(props: {
  state: PersonalRealityState;
  completedJumpCountFromChain: number;
  onStateChange: (updater: (state: PersonalRealityState) => PersonalRealityState) => void;
}) {
  const discountGroups = getDiscountGroups();

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
    <section className="card stack">
      <div className="section-heading">
        <h3>Budget Controls</h3>
        <span className="pill">Pages 2-3</span>
      </div>
      <p>{coreModeSummaryText(props.state.coreModeId)}</p>

      <div className="field-grid field-grid--two">
        <label className="field">
          <span>Core mode</span>
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
          <small className="field-hint">
            Completed jumps currently observed in this chain: <strong>{formatNumber(props.completedJumpCountFromChain)}</strong>
          </small>
        </label>

        <label className="field">
          <span>Completed jumps override</span>
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
          <small className="field-hint">Leave blank to use the chain’s completed jump count automatically.</small>
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
              <select
                value={props.state.discountedGroupIds[index] ?? ''}
                onChange={(event) => setDiscountGroup(index, event.target.value)}
              >
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
            <span>Swap-Out experienced jumps</span>
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
            <small className="field-hint">Used to unlock the documented Incremental 700 WP swap-out case.</small>
          </label>
        ) : null}

        {props.state.extraModeIds.includes('cross-roads') ? (
          <label className="field">
            <span>Crossroads triggered jumps</span>
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
            <small className="field-hint">Tracks collective WP, not your own spendable WP.</small>
          </label>
        ) : null}

        {props.state.coreModeId === 'unlimited' ? (
          <label className="field">
            <span>Unlimited mode transferred WP</span>
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
            <small className="field-hint">Enter the actual WP gained from the mode’s 1:1 per-jump CP transfer.</small>
          </label>
        ) : null}

        <label className="field">
          <span>Generic CP to WP purchases</span>
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
          <small className="field-hint">Uses the supplement’s baseline 50 CP to 2 WP exchange rate from page 1.</small>
        </label>

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
          <small className="field-hint">Use this for the multiplied UDS warehouse drawback payouts mentioned on page 1.</small>
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
        <span>Included</span>
        <small className="field-hint">This freebie is part of the supplement’s default baseline.</small>
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
            <span>Extra same-person retries</span>
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
            <small className="field-hint">Extra retries after the unlimited plan still cost 50 WP each.</small>
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

function OptionCard(props: {
  option: PersonalRealityOption;
  state: PersonalRealityState;
  selection: PersonalRealitySelectionState;
  summary: ReturnType<typeof buildPersonalRealityPlanSummary>['selectionSummaries'][string];
  onSelectionChange: (optionId: string, updater: (selection: PersonalRealitySelectionState) => PersonalRealitySelectionState) => void;
}) {
  const { option, summary } = props;
  const isLimitation = isLimitationOption(option);

  return (
    <article className={`card stack personal-reality-option${summary.selected ? ' is-selected' : ''}`}>
      <div className="section-heading">
        <h3>{option.title}</h3>
        <span className="pill">Page {option.page}</span>
      </div>

      <p>{option.description}</p>
      <div className="inline-meta">
        <span className="pill">{option.costText}</span>
        {summary.wpSpent > 0 ? (
          <span className="pill pill--soft">Spent {formatNumber(summary.wpSpent)} WP</span>
        ) : null}
        {summary.wpGain > 0 ? (
          <span className="pill pill--soft">Gain {formatNumber(summary.wpGain)} WP</span>
        ) : null}
        {summary.cpSpent > 0 ? (
          <span className="pill pill--soft">Committed {formatNumber(summary.cpSpent)} CP</span>
        ) : null}
      </div>

      <SelectionControl
        option={option}
        selection={props.selection}
        onSelectionChange={(updater) => props.onSelectionChange(option.id, updater)}
      />

      {option.kind === 'counter' && summary.selected ? (
        <small className="field-hint">{describeCounterState(option, props.selection)}</small>
      ) : null}

      {isLimitation && summary.selected ? (
        <label className="field">
          <span>Limitation state</span>
          <select
            value={props.selection.limitationStatus}
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

      {option.requirementsText ? <small className="field-hint">{option.requirementsText}</small> : null}
      {summary.missingRequirementIds.length > 0 ? (
        <small className="field-hint field-hint--error">This choice is missing one or more listed prerequisites.</small>
      ) : null}

      {option.kind === 'variant' && props.selection.variantId.length > 0 ? (
        <small className="field-hint">
          {option.variants?.find((variant) => variant.id === props.selection.variantId)?.summary ?? ''}
        </small>
      ) : null}
    </article>
  );
}

export function PersonalRealityPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageNumber = getPageNumber(searchParams);
  const completedJumpCountFromChain = workspace.jumps.filter((jump) => jump.status === 'completed').length;
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextChain) => {
      await saveChainEntity(nextChain);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save the Personal Reality build.'),
  });
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const state = readPersonalRealityState(draftChain);
  const summary = buildPersonalRealityPlanSummary(state, completedJumpCountFromChain);
  const currentPage = personalRealityPages.find((entry) => entry.number === pageNumber) ?? personalRealityPages[0];
  const currentPageOptions = personalRealityOptionCatalog.filter((entry) => entry.page === currentPage.number);
  const pageNoteKey = String(currentPage.number);

  if (!workspace.activeBranch) {
    return (
      <EmptyWorkspaceCard
        title="No active branch"
        body="Create or restore a branch before using the Personal Reality workspace."
      />
    );
  }

  function updateState(updater: (currentState: PersonalRealityState) => PersonalRealityState) {
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

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Personal Reality"
        description="A supplement-driven builder for the full Personal Reality document, including budgets, page-by-page purchases, and limitation tracking."
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

      <section className="hero hero--split personal-reality-hero">
        <div className="stack stack--compact hero__content">
          <div className="section-heading">
            <h3>Builder Summary</h3>
            <AutosaveStatusIndicator status={chainAutosave.status} />
          </div>
          <p>
            This editor now tracks the Personal Reality supplement page by page: mode selection, WP spending, CP-side
            purchases, repeated facilities, and limitation resolution state.
          </p>
          <div className="actions">
            <button className="button button--secondary" type="button" onClick={() => setSearchParams({ page: '2' })}>
              Start at Modes
            </button>
            <button className="button button--secondary" type="button" onClick={() => setSearchParams({ page: '48' })}>
              Review Limitations
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                updateState(() => createDefaultPersonalRealityState());
                setSearchParams({ page: '2' });
              }}
            >
              Reset Builder
            </button>
          </div>
        </div>

        <div className="grid grid--two hero__stats summary-grid">
          <div className="metric">
            <strong>{formatNumber(summary.availableWp)}</strong>
            Available WP
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.wpSpent)}</strong>
            Spent WP
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.remainingWp)}</strong>
            Remaining WP
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.cpSpent)}</strong>
            Committed CP
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.selectedOptionCount)}</strong>
            Selected entries
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.activeLimitationCount)}</strong>
            Active limitations
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.collectiveWp)}</strong>
            Crossroads C-WP
          </div>
          <div className="metric">
            <strong>{formatNumber(summary.completedJumpCount)}</strong>
            Counted jumps
          </div>
        </div>
      </section>

      <BudgetEditor state={state} completedJumpCountFromChain={completedJumpCountFromChain} onStateChange={updateState} />

      {summary.therehouseCpPerCompletedJump > 0 ? (
        <section className="card stack">
          <div className="section-heading">
            <h3>Therehouse Reminder</h3>
            <span className="pill">Page 2 / 56</span>
          </div>
          <p>
            Therehouse mode grants <strong>{formatNumber(summary.therehouseCpPerCompletedJump)} CP</strong> per completed
            jump. Based on the counted jumps above, that is <strong>{formatNumber(summary.therehouseEarnedCp)} CP</strong>{' '}
            earned so far, separate from WP.
          </p>
        </section>
      ) : null}

      {summary.warnings.length > 0 ? (
        <section className="card stack">
          <div className="section-heading">
            <h3>Build Warnings</h3>
            <span className="pill">{summary.warnings.length}</span>
          </div>
          <ul className="list">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="personal-reality-layout">
        <aside className="card stack personal-reality-sidebar">
          <div className="section-heading">
            <h3>Supplement Pages</h3>
            <span className="pill">1-56</span>
          </div>
          {personalRealitySections.map((section) => (
            <div className="stack stack--compact" key={section.id}>
              <div className="section-heading">
                <h4>{section.title}</h4>
                <span className="pill">
                  {section.pageStart}-{section.pageEnd}
                </span>
              </div>
              <p className="field-hint">{section.summary}</p>
              <div className="selection-list">
                {personalRealityPages
                  .filter((page) => page.sectionId === section.id)
                  .map((page) => {
                    const selectedCount = getPageSummaryCount(summary.pageSelectionCounts, page.number);

                    return (
                      <button
                        className={`selection-list__item${currentPage.number === page.number ? ' is-active' : ''}`}
                        key={page.number}
                        type="button"
                        onClick={() => setSearchParams({ page: String(page.number) })}
                      >
                        <strong>
                          {page.number}. {page.title}
                        </strong>
                        <span>{page.summary}</span>
                        <span>{selectedCount} tracked</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </aside>

        <div className="stack personal-reality-main">
          <section className="card stack">
            <div className="section-heading">
              <h3>
                Page {currentPage.number}: {currentPage.title}
              </h3>
              <span className="pill">{currentPage.sectionId}</span>
            </div>
            <p>{currentPage.summary}</p>
            <div className="inline-meta">
              <span className="metric">
                <strong>{formatNumber(getPageSummaryCount(summary.pageSelectionCounts, currentPage.number))}</strong>
                Tracked entries
              </span>
              <span className="metric">
                <strong>{formatNumber(currentPageOptions.length)}</strong>
                Option cards
              </span>
            </div>
            <label className="field">
              <span>Page notes</span>
              <textarea
                rows={4}
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
              <small className="field-hint">
                Use this for rulings, interpretations, or page-specific reminders while you build the section out.
              </small>
            </label>
          </section>

          {currentPageOptions.length > 0 ? (
            <section className="personal-reality-option-grid">
              {currentPageOptions.map((option) => {
                const optionSummary = summary.selectionSummaries[option.id];

                return (
                  <OptionCard
                    key={option.id}
                    option={option}
                    state={state}
                    selection={optionSummary.selection}
                    summary={optionSummary}
                    onSelectionChange={updateSelection}
                  />
                );
              })}
            </section>
          ) : (
            <section className="card stack">
              <h3>No direct purchases on this page</h3>
              <p>
                This page is reference-only in the builder. Use the notes above to capture how you want to interpret it
                in your chain.
              </p>
            </section>
          )}

          <section className="card stack">
            <div className="section-heading">
              <h3>Build Notes</h3>
              <span className="pill">Global</span>
            </div>
            <label className="field">
              <span>Personal Reality notes</span>
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
              <small className="field-hint">
                Keep a running interpretation log here for theme choices, facility placement, missing supplements, or
                house rulings.
              </small>
            </label>
          </section>
        </div>
      </section>
    </div>
  );
}
