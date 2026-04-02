import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { getActiveChainDrawbackBudgetContributions, getChainDrawbackBudgetGrants } from '../../domain/chain/selectors';
import { effectCategories, effectStates } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { createBlankEffect, deleteChainRecord, saveChainEntity, saveChainRecord } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AssistiveHint,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  PlainLanguageHint,
  ReadinessPill,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { SIMPLE_MODE_GUIDE_DEFAULT_KEY } from '../workspace/simpleModeGuides';
import { mergeAutosaveStatuses, useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  buildAltChainBuilderSummary,
  describeAltChainBuilderSelection,
  formatAltChainBuilderSelection,
  hasAltChainBuilderBeenUsed,
  parseAltChainBuilderState,
} from './altChainBuilder';

type ChainwideCategoryFilter = 'all' | Effect['category'];
const CUSTOM_BUDGET_CURRENCY = '__custom__';

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
  const navigate = useNavigate();
  const { simpleMode, getChainGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ChainwideCategoryFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
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
  const altChainSummary = buildAltChainBuilderSummary(altChainBuilder);
  const altChainGuideState = getChainGuideState(chainId, 'alt-chain-builder', SIMPLE_MODE_GUIDE_DEFAULT_KEY);
  const shouldAutoRedirectToBuilder =
    simpleMode &&
    !altChainGuideState.dismissed &&
    altChainGuideState.updatedAt === null &&
    !hasAltChainBuilderBeenUsed(altChainBuilder);
  const filteredEffects = chainwideEffects.filter(
    (effect) => categoryFilter === 'all' || effect.category === categoryFilter,
  );
  const selectedEffect = filteredEffects.find((effect) => effect.id === selectedEffectId) ?? filteredEffects[0] ?? null;
  const showCategoryFilter = chainwideEffects.length > 1 || categoryFilter !== 'all';
  const effectAutosave = useAutosaveRecord(selectedEffect, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.effects, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save the chainwide rule entry.'),
  });
  const autosaveStatus = mergeAutosaveStatuses([chainAutosave.status, effectAutosave.status]);
  const draftEffect = effectAutosave.draft ?? selectedEffect;

  useEffect(() => {
    if (!shouldAutoRedirectToBuilder) {
      return;
    }

    navigate(`/chains/${chainId}/alt-chain-builder?guide=1`, { replace: true });
  }, [chainId, navigate, shouldAutoRedirectToBuilder]);

  function updateChainSetting<K extends keyof typeof draftChain.chainSettings>(key: K, value: (typeof draftChain.chainSettings)[K]) {
    chainAutosave.updateDraft({
      ...draftChain,
      chainSettings: {
        ...draftChain.chainSettings,
        [key]: value,
      },
    });
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

  if (shouldAutoRedirectToBuilder) {
    return (
      <section className="card stack">
        <h2>Opening Alt-Chain Builder</h2>
        <p>This branch has not used the builder yet, so simple mode is handing off to the dedicated builder page first.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Chainwide Rules"
        description={
          simpleMode
            ? 'Manage chainwide rules and drawbacks after the Alt-Chain builder has posted the named picks you want to keep.'
            : 'Edit chain-level rule flags, chainwide drawbacks, generated Alt-Chain entries, and other always-on chain-owned rule effects.'
        }
        badge={`${chainwideEffects.length} entries`}
        actions={
          <>
            <Link className="button button--secondary" to={`/chains/${chainId}/alt-chain-builder`}>
              Open Alt-Chain Builder
            </Link>
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
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={autosaveStatus} />

      {simpleMode ? (
        <section className="section-surface stack stack--compact">
          <div className="section-heading">
            <h3>When To Use This Page</h3>
            <ReadinessPill tone="advanced" />
          </div>
          <PlainLanguageHint term="Chainwide rule" meaning="a rule or drawback that follows the whole active branch instead of one jump." />
          <p>Use Chainwide Rules to edit the actual persistent rule entries. Use Alt-Chain Builder when you want the worksheet first.</p>
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
          <h3>Alt-Chain Builder</h3>
          <span className="pill">{formatAltChainBuilderSelection(altChainBuilder)}</span>
        </div>

        <div className="guidance-strip guidance-strip--accent">
          <strong>The builder lives on its own page now.</strong>
          <p>Use the dedicated Alt-Chain Builder page to record the actual worksheet, then post named picks back into this rules list.</p>
        </div>

        {simpleMode ? (
          <PlainLanguageHint
            term="Builder post"
            meaning="named Accommodations become chain rules here, and named Complications become chain drawbacks here."
          />
        ) : null}

        <div className="inline-meta">
          <span className="metric">
            <strong>{altChainSummary.recordedAccommodationCount}</strong>
            Accommodation load
          </span>
          <span className="metric">
            <strong>{altChainSummary.recordedComplicationCount}</strong>
            Complication load
          </span>
          <span className="metric">
            <strong>{altChainSummary.selectedOptionCount}</strong>
            Named picks
          </span>
        </div>

        <p>{describeAltChainBuilderSelection(altChainBuilder, simpleMode)}</p>
        <p className="field-hint">Last generated-effect sync: {formatTimestamp(altChainBuilder.lastSyncedAt)}</p>

        {altChainSummary.warnings.slice(0, 2).map((warning) => (
          <p className="field-hint" key={warning}>
            {warning}
          </p>
        ))}

        <div className="actions">
          <Link className="button" to={`/chains/${chainId}/alt-chain-builder`}>
            {hasAltChainBuilderBeenUsed(altChainBuilder) ? 'Edit Alt-Chain Builder' : 'Start Alt-Chain Builder'}
          </Link>
        </div>
      </section>

      {chainwideEffects.length === 0 ? (
        <EmptyWorkspaceCard
          title="No chainwide entries yet"
          body={
            simpleMode
              ? 'Add a chainwide drawback or rule when the whole branch needs it to persist across jumps.'
              : 'Create chain drawbacks or chain-owned rule effects here, then use Current Jump Rules for per-jump overrides. The Alt-Chain builder posts named picks into this list.'
          }
          action={
            <div className="actions">
              <button className="button" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                Create Chain Drawback
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
              {categoryFilter !== 'all' ? <span className="pill">{filteredEffects.length} shown</span> : null}
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
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as ChainwideCategoryFilter)}>
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
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as ChainwideCategoryFilter)}>
                  <option value="all">all</option>
                  {effectCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
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
                <p>No chainwide entries match the current filter.</p>
                <div className="actions">
                  <button className="button" type="button" onClick={() => void handleCreateChainwideEffect('drawback')}>
                    Create Chain Drawback
                  </button>
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
