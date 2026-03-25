import { useState } from 'react';
import { accessModes, effectCategories, effectStates, scopeTypes, ownerEntityTypes, type AccessMode, type OwnerEntityType, type ScopeType } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { createBlankEffect, deleteChainRecord, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type FilterValue<T extends string> = 'all' | T;

function getOwnerOptions(workspace: ReturnType<typeof useChainWorkspace>['workspace']) {
  return {
    chain: [{ value: workspace.chain.id, label: workspace.chain.title }],
    jumper: workspace.jumpers.map((jumper) => ({ value: jumper.id, label: jumper.name })),
    companion: workspace.companions.map((companion) => ({ value: companion.id, label: companion.name })),
    jump: workspace.jumps.map((jump) => ({ value: jump.id, label: jump.title })),
    participation: workspace.participations.map((participation) => ({
      value: participation.id,
      label: `${workspace.jumpers.find((jumper) => jumper.id === participation.jumperId)?.name ?? 'Jumper'} @ ${
        workspace.jumps.find((jump) => jump.id === participation.jumpId)?.title ?? 'Jump'
      }`,
    })),
    branch: workspace.branches.map((branch) => ({ value: branch.id, label: branch.title })),
    snapshot: workspace.snapshots.map((snapshot) => ({ value: snapshot.id, label: snapshot.title })),
    preset: workspace.presetProfiles.map((preset) => ({ value: preset.id, label: preset.name })),
    note: workspace.notes.map((note) => ({ value: note.id, label: note.title })),
    attachment: workspace.attachments.map((attachment) => ({ value: attachment.id, label: attachment.label })),
    system: [{ value: 'system', label: 'System' }],
  } as const;
}

type OwnerOptions = ReturnType<typeof getOwnerOptions>;

function hasOwnerTargets(ownerOptions: OwnerOptions, ownerEntityType: OwnerEntityType) {
  return ownerEntityType === 'system' || ownerOptions[ownerEntityType].length > 0;
}

function isEffectOwnerValid(effect: Effect, ownerOptions: OwnerOptions) {
  if (effect.ownerEntityType === 'system') {
    return effect.ownerEntityId === 'system';
  }

  return ownerOptions[effect.ownerEntityType].some((option) => option.value === effect.ownerEntityId);
}

function getRuleOverrides(effect: Effect) {
  const metadata = effect.importSourceMetadata as Record<string, unknown>;
  const accessOverrides =
    typeof metadata.accessOverrides === 'object' && metadata.accessOverrides !== null
      ? (metadata.accessOverrides as Record<string, unknown>)
      : {};

  return accessOverrides;
}

function setRuleOverride(effect: Effect, key: string, value: AccessMode | boolean | ''): Effect {
  const metadata = effect.importSourceMetadata as Record<string, unknown>;
  const accessOverrides = getRuleOverrides(effect);
  const nextOverrides = { ...accessOverrides };

  if (value === '') {
    delete nextOverrides[key];
  } else {
    nextOverrides[key] = value;
  }

  return {
    ...effect,
    importSourceMetadata: {
      ...metadata,
      accessOverrides: nextOverrides,
    },
  };
}

export function EffectsPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<FilterValue<ScopeType>>('all');
  const [categoryFilter, setCategoryFilter] = useState<FilterValue<(typeof effectCategories)[number]>>('all');
  const [stateFilter, setStateFilter] = useState<FilterValue<(typeof effectStates)[number]>>('all');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<FilterValue<OwnerEntityType>>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const filteredEffects = workspace.effects.filter((effect) => {
    if (scopeFilter !== 'all' && effect.scopeType !== scopeFilter) {
      return false;
    }

    if (categoryFilter !== 'all' && effect.category !== categoryFilter) {
      return false;
    }

    if (stateFilter !== 'all' && effect.state !== stateFilter) {
      return false;
    }

    if (ownerTypeFilter !== 'all' && effect.ownerEntityType !== ownerTypeFilter) {
      return false;
    }

    return true;
  });
  const selectedEffect = workspace.effects.find((effect) => effect.id === selectedEffectId) ?? filteredEffects[0] ?? workspace.effects[0] ?? null;
  const ownerOptions = getOwnerOptions(workspace);
  const selectedOwnerOptions = selectedEffect ? ownerOptions[selectedEffect.ownerEntityType] : [];

  async function handleCreateEffect() {
    if (!workspace.activeBranch) {
      return;
    }

    const effect = createBlankEffect(chainId, workspace.activeBranch.id, workspace.chain.id);

    try {
      await saveChainRecord(db.effects, effect);
      setSelectedEffectId(effect.id);
      setNotice({
        tone: 'success',
        message: 'Created a new effect record.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create an effect.',
      });
    }
  }

  async function saveSelectedEffect(nextValue: Effect | null) {
    if (!nextValue) {
      return;
    }

    const currentOwnerValid = selectedEffect ? isEffectOwnerValid(selectedEffect, ownerOptions) : true;
    const ownerChanged =
      !selectedEffect ||
      nextValue.ownerEntityType !== selectedEffect.ownerEntityType ||
      nextValue.ownerEntityId !== selectedEffect.ownerEntityId;

    if (!isEffectOwnerValid(nextValue, ownerOptions) && (ownerChanged || currentOwnerValid)) {
      setNotice({
        tone: 'error',
        message: 'Choose an owner type and target that both exist in the current workspace.',
      });
      return;
    }

    try {
      await saveChainRecord(db.effects, nextValue);
      setNotice({
        tone: 'success',
        message: 'Effect changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save effect changes.',
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
        message: 'Effect deleted.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete effect.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing effects." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Active Effects"
        description="Filterable branch-visible effects with chain, jump, and jumper ownership plus rule override metadata."
        badge={`${workspace.effects.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleCreateEffect()}>
            Add Effect
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />

      {workspace.effects.length === 0 ? (
        <EmptyWorkspaceCard
          title="No effects yet"
          body="Create the first chain-, jump-, or jumper-scoped effect for this branch."
          action={
            <button className="button" type="button" onClick={() => void handleCreateEffect()}>
              Create First Effect
            </button>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Filters</h3>
              <span className="pill">{filteredEffects.length} shown</span>
            </div>
            <div className="field-grid field-grid--two">
              <label className="field">
                <span>Scope</span>
                <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as FilterValue<ScopeType>)}>
                  <option value="all">all</option>
                  {scopeTypes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as FilterValue<(typeof effectCategories)[number]>)}
                >
                  <option value="all">all</option>
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
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value as FilterValue<(typeof effectStates)[number]>)}
                >
                  <option value="all">all</option>
                  {effectStates.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Owner type</span>
                <select
                  value={ownerTypeFilter}
                  onChange={(event) => setOwnerTypeFilter(event.target.value as FilterValue<OwnerEntityType>)}
                >
                  <option value="all">all</option>
                  {ownerEntityTypes.map((ownerType) => (
                    <option key={ownerType} value={ownerType}>
                      {ownerType}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                      <span>Scope</span>
                      <select
                        value={selectedEffect.scopeType}
                        onChange={(event) =>
                          void saveSelectedEffect({
                            ...selectedEffect,
                            scopeType: event.target.value as Effect['scopeType'],
                          })
                        }
                      >
                        {scopeTypes.map((scope) => (
                          <option key={scope} value={scope}>
                            {scope}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Owner type</span>
                      <select
                        value={selectedEffect.ownerEntityType}
                        onChange={(event) => {
                          const ownerEntityType = event.target.value as OwnerEntityType;
                          const nextOwnerOptions = ownerOptions[ownerEntityType];

                          if (!hasOwnerTargets(ownerOptions, ownerEntityType)) {
                            setNotice({
                              tone: 'error',
                              message: 'That owner type has no valid targets in the current workspace yet.',
                            });
                            return;
                          }

                          void saveSelectedEffect({
                            ...selectedEffect,
                            ownerEntityType,
                            ownerEntityId: ownerEntityType === 'system' ? 'system' : nextOwnerOptions[0]?.value ?? selectedEffect.ownerEntityId,
                          });
                        }}
                      >
                        {ownerEntityTypes.map((ownerType) => (
                          <option
                            key={ownerType}
                            value={ownerType}
                            disabled={!hasOwnerTargets(ownerOptions, ownerType) && ownerType !== selectedEffect.ownerEntityType}
                          >
                            {ownerType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Owner target</span>
                      {selectedEffect.ownerEntityType === 'system' ? (
                        <input value="system" readOnly />
                      ) : selectedOwnerOptions.length > 0 ? (
                        <select
                          value={selectedEffect.ownerEntityId}
                          onChange={(event) =>
                            void saveSelectedEffect({
                              ...selectedEffect,
                              ownerEntityId: event.target.value,
                            })
                          }
                        >
                          {selectedOwnerOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={selectedEffect.ownerEntityId} readOnly />
                      )}
                    </label>
                  </div>

                  {!hasOwnerTargets(ownerOptions, selectedEffect.ownerEntityType) ? (
                    <p className="editor-section__empty">
                      This effect currently points at an owner type with no matching records in the active workspace.
                      Choose a different owner type to repair it.
                    </p>
                  ) : null}

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={5}
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

                {selectedEffect.category === 'rule' ? (
                  <section className="stack stack--compact">
                    <h4>Rule Overrides</h4>
                    <div className="field-grid field-grid--three">
                      {(['warehouseAccess', 'powerAccess', 'itemAccess', 'altFormAccess', 'supplementAccess'] as const).map(
                        (key) => (
                          <label className="field" key={key}>
                            <span>{key}</span>
                            <select
                              value={(getRuleOverrides(selectedEffect)[key] as string | undefined) ?? ''}
                              onChange={(event) =>
                                void saveSelectedEffect(setRuleOverride(selectedEffect, key, event.target.value as AccessMode | ''))
                              }
                            >
                              <option value="">inherit</option>
                              {accessModes.map((mode) => (
                                <option key={mode} value={mode}>
                                  {mode}
                                </option>
                              ))}
                            </select>
                          </label>
                        ),
                      )}
                      <label className="field field--checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(getRuleOverrides(selectedEffect).gauntlet)}
                          onChange={(event) =>
                            void saveSelectedEffect(setRuleOverride(selectedEffect, 'gauntlet', event.target.checked))
                          }
                        />
                        <span>Force gauntlet state</span>
                      </label>
                    </div>
                  </section>
                ) : null}

                <section className="stack stack--compact">
                  <h4>Advanced</h4>
                  <label className="field">
                    <span>Source effect id</span>
                    <input
                      value={selectedEffect.sourceEffectId ?? ''}
                      onChange={(event) =>
                        void saveSelectedEffect({
                          ...selectedEffect,
                          sourceEffectId: event.target.value === '' ? null : event.target.value,
                        })
                      }
                    />
                  </label>
                  <JsonEditorField
                    label="Import source metadata"
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
            ) : null}
          </article>
        </section>
      )}
    </div>
  );
}
