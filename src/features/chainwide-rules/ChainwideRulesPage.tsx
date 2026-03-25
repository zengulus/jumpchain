import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getActiveChainDrawbackBudgetContributions, getChainDrawbackBudgetGrants } from '../../domain/chain/selectors';
import { effectCategories, effectStates } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { createBlankEffect, deleteChainRecord, saveChainEntity, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type ChainwideCategoryFilter = 'all' | Effect['category'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatNumericValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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
  const { chainId, workspace } = useChainWorkspace();
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ChainwideCategoryFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const chainwideEffects = workspace.effects.filter((effect) => isChainwideEffect(effect, workspace.chain.id));
  const filteredEffects = chainwideEffects.filter((effect) => categoryFilter === 'all' || effect.category === categoryFilter);
  const selectedEffect =
    chainwideEffects.find((effect) => effect.id === selectedEffectId) ??
    filteredEffects[0] ??
    chainwideEffects[0] ??
    null;
  const activeBudgetContributions = getActiveChainDrawbackBudgetContributions(workspace);
  const chainwideDrawbackCount = chainwideEffects.filter((effect) => effect.category === 'drawback').length;
  const chainwideRuleCount = chainwideEffects.filter((effect) => effect.category === 'rule').length;
  const activeChoicePointGrant = activeBudgetContributions.reduce(
    (total, contribution) => total + (contribution.budgetGrants['0'] ?? 0),
    0,
  );

  async function updateChainSetting<K extends keyof typeof workspace.chain.chainSettings>(
    key: K,
    value: (typeof workspace.chain.chainSettings)[K],
    successMessage: string,
  ) {
    try {
      await saveChainEntity({
        ...workspace.chain,
        chainSettings: {
          ...workspace.chain.chainSettings,
          [key]: value,
        },
      });
      setNotice({
        tone: 'success',
        message: successMessage,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save chainwide rule settings.',
      });
    }
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

  async function saveSelectedEffect(nextValue: Effect | null) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.effects, nextValue);
      setNotice({
        tone: 'success',
        message: 'Chainwide rule entry autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save the chainwide rule entry.',
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
        description="Chain-level rule flags, chainwide drawbacks, and branch-visible chain-owned rule effects live here."
        badge={`${chainwideEffects.length} entries`}
        actions={
          <>
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

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Chain Flags</h3>
            <span className="pill">{workspace.activeBranch.title}</span>
          </div>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={workspace.chain.chainSettings.chainDrawbacksForCompanions}
              onChange={(event) =>
                void updateChainSetting(
                  'chainDrawbacksForCompanions',
                  event.target.checked,
                  'Updated companion handling for chain drawbacks.',
                )
              }
            />
            <span>Chain drawbacks apply to companions</span>
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={workspace.chain.chainSettings.chainDrawbacksSupplements}
              onChange={(event) =>
                void updateChainSetting(
                  'chainDrawbacksSupplements',
                  event.target.checked,
                  'Updated supplement handling for chain drawbacks.',
                )
              }
            />
            <span>Chain drawbacks apply to supplements</span>
          </label>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Chainwide Inventory</h3>
            <span className="pill">{workspace.chain.title}</span>
          </div>

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
        </article>
      </section>

      {chainwideEffects.length === 0 ? (
        <EmptyWorkspaceCard
          title="No chainwide entries yet"
          body="Create chain drawbacks or chain-owned rule effects here, then use Current Jump Rules for per-jump overrides."
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
              <span className="pill">{filteredEffects.length} shown</span>
            </div>

            <label className="field">
              <span>Category</span>
              <select
                value={categoryFilter}
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

            <div className="selection-list">
              {filteredEffects.map((effect) => (
                <button
                  key={effect.id}
                  className={`selection-list__item${selectedEffect?.id === effect.id ? ' is-active' : ''}`}
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
            {selectedEffect ? (
              <>
                <div className="section-heading">
                  <h3>{selectedEffect.title}</h3>
                  <button className="button button--secondary" type="button" onClick={() => void handleDeleteEffect()}>
                    Delete
                  </button>
                </div>

                <section className="stack stack--compact">
                  <h4>Simple</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={selectedEffect.title}
                        onChange={(event) =>
                          void saveSelectedEffect({
                            ...selectedEffect,
                            title: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Category</span>
                      <select
                        value={selectedEffect.category}
                        onChange={(event) =>
                          void saveSelectedEffect({
                            ...selectedEffect,
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
                        value={selectedEffect.state}
                        onChange={(event) =>
                          void saveSelectedEffect({
                            ...selectedEffect,
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
                      value={selectedEffect.description}
                      onChange={(event) =>
                        void saveSelectedEffect({
                          ...selectedEffect,
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                </section>

                {selectedEffect.category === 'drawback' ? (
                  <section className="stack stack--compact">
                    <h4>Jump budget</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Grant amount</span>
                        <input
                          type="number"
                          value={getSingleBudgetGrant(selectedEffect).amount}
                          onChange={(event) =>
                            void saveSelectedEffect(
                              setEffectBudgetGrant(
                                selectedEffect,
                                getSingleBudgetGrant(selectedEffect).currencyKey,
                                event.target.value.trim().length > 0 ? Number(event.target.value) : 0,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Currency key</span>
                        <input
                          value={getSingleBudgetGrant(selectedEffect).currencyKey}
                          onChange={(event) =>
                            void saveSelectedEffect(
                              setEffectBudgetGrant(
                                selectedEffect,
                                event.target.value.trim().length > 0 ? event.target.value.trim() : '0',
                                getSingleBudgetGrant(selectedEffect).amount,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <small className="field-hint">Applied to each jump participation budget while this drawback is active.</small>
                  </section>
                ) : null}

                <section className="stack stack--compact">
                  <h4>Advanced</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Scope</span>
                      <input value={selectedEffect.scopeType} readOnly />
                    </label>
                    <label className="field">
                      <span>Owner type</span>
                      <input value={selectedEffect.ownerEntityType} readOnly />
                    </label>
                  </div>

                  <JsonEditorField
                    label="Import Source Metadata"
                    value={selectedEffect.importSourceMetadata}
                    onValidChange={(value) =>
                      saveSelectedEffect({
                        ...selectedEffect,
                        importSourceMetadata:
                          typeof value === 'object' && value !== null && !Array.isArray(value)
                            ? (value as Record<string, unknown>)
                            : {},
                      })
                    }
                  />
                </section>
              </>
            ) : (
              <p>No chainwide entries match the current filter.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
