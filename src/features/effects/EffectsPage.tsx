import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { accessModes, effectCategories, effectStates, scopeTypes, ownerEntityTypes, type AccessMode, type OwnerEntityType, type ScopeType } from '../../domain/common';
import type { Effect } from '../../domain/effects/types';
import { db } from '../../db/database';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery } from '../search/searchUtils';
import { createBlankEffect, deleteChainRecord, saveChainRecord } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
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

function getDefaultScopeType(ownerEntityType: OwnerEntityType) {
  switch (ownerEntityType) {
    case 'jumper':
      return 'jumper' as const;
    case 'companion':
      return 'companion' as const;
    case 'jump':
      return 'jump' as const;
    case 'participation':
      return 'participation' as const;
    case 'branch':
      return 'branch' as const;
    case 'snapshot':
      return 'snapshot' as const;
    case 'system':
      return 'global' as const;
    case 'chain':
    default:
      return 'chain' as const;
  }
}

export function EffectsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scopeFilter, setScopeFilter] = useState<FilterValue<ScopeType>>('all');
  const [categoryFilter, setCategoryFilter] = useState<FilterValue<(typeof effectCategories)[number]>>('all');
  const [stateFilter, setStateFilter] = useState<FilterValue<(typeof effectStates)[number]>>('all');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<FilterValue<OwnerEntityType>>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedEffectId = searchParams.get('effect');
  const searchQuery = searchParams.get('search') ?? '';
  const focusedOwnerType = searchParams.get('ownerType') as OwnerEntityType | null;
  const focusedOwnerId = searchParams.get('ownerId');
  const ownerOptions = getOwnerOptions(workspace);
  const filteredEffects = workspace.effects.filter((effect) => {
    if (!matchesSearchQuery(searchQuery, effect.title, effect.description, effect.category, effect.state, effect.importSourceMetadata)) {
      return false;
    }

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

    if (focusedOwnerType && effect.ownerEntityType !== focusedOwnerType) {
      return false;
    }

    if (focusedOwnerId && effect.ownerEntityId !== focusedOwnerId) {
      return false;
    }

    return true;
  });
  const selectedEffect = filteredEffects.find((effect) => effect.id === selectedEffectId) ?? filteredEffects[0] ?? null;
  const effectAutosave = useAutosaveRecord(selectedEffect, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.effects, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save effect changes.'),
  });
  const draftEffect = effectAutosave.draft ?? selectedEffect;
  const selectedOwnerOptions = draftEffect ? ownerOptions[draftEffect.ownerEntityType] : [];

  async function handleCreateEffect() {
    if (!workspace.activeBranch) {
      return;
    }

    const hasFocusedOwner =
      focusedOwnerType &&
      focusedOwnerId &&
      (focusedOwnerType === 'system' || ownerOptions[focusedOwnerType]?.some((option) => option.value === focusedOwnerId));
    const effect = hasFocusedOwner
      ? {
          ...createBlankEffect(chainId, workspace.activeBranch.id, focusedOwnerType === 'system' ? 'system' : focusedOwnerId),
          scopeType: getDefaultScopeType(focusedOwnerType),
          ownerEntityType: focusedOwnerType,
          ownerEntityId: focusedOwnerType === 'system' ? 'system' : focusedOwnerId,
        }
      : createBlankEffect(chainId, workspace.activeBranch.id, workspace.chain.id);

    try {
      await saveChainRecord(db.effects, effect);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('effect', effect.id);
        return nextParams;
      });
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

  function updateSelectedEffect(nextValue: Effect | null) {
    if (!nextValue) {
      return;
    }

    const currentOwnerValid = draftEffect ? isEffectOwnerValid(draftEffect, ownerOptions) : true;
    const ownerChanged =
      !draftEffect ||
      nextValue.ownerEntityType !== draftEffect.ownerEntityType ||
      nextValue.ownerEntityId !== draftEffect.ownerEntityId;

    if (!isEffectOwnerValid(nextValue, ownerOptions) && (ownerChanged || currentOwnerValid)) {
      setNotice({
        tone: 'error',
        message: 'Choose an owner type and target that both exist in the current workspace.',
      });
      return;
    }

    effectAutosave.updateDraft(nextValue);
  }

  async function handleDeleteEffect() {
    if (!selectedEffect) {
      return;
    }

    try {
      await deleteChainRecord(db.effects, selectedEffect.id, chainId);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.delete('effect');
        return nextParams;
      });
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
        description={
          simpleMode
            ? 'Track one effect at a time, starting with what it is and where it applies.'
            : 'Filterable branch-visible effects with chain, jump, and jumper ownership plus rule override metadata.'
        }
        badge={`${workspace.effects.length} total`}
        actions={
          <>
            <button className="button" type="button" onClick={() => void handleCreateEffect()}>
              Add Effect
            </button>
            {focusedOwnerType && focusedOwnerId ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  setSearchParams((currentParams) => {
                    const nextParams = new URLSearchParams(currentParams);
                    nextParams.delete('ownerType');
                    nextParams.delete('ownerId');
                    return nextParams;
                  })
                }
              >
                Clear Owner Focus
              </button>
            ) : null}
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={effectAutosave.status} />

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
            <label className="field">
              <span>Search effects</span>
              <input
                value={searchQuery}
                placeholder="title, description, category, state..."
                onChange={(event) =>
                  setSearchParams((currentParams) => {
                    const nextParams = new URLSearchParams(currentParams);

                    if (event.target.value.trim()) {
                      nextParams.set('search', event.target.value);
                    } else {
                      nextParams.delete('search');
                    }

                    return nextParams;
                  })
                }
              />
            </label>
            {simpleMode ? (
              <>
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
                <details className="details-panel">
                  <summary className="details-panel__summary">
                    <span>More filters</span>
                    <span className="pill">Optional</span>
                  </summary>
                  <div className="details-panel__body">
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
                  </div>
                </details>
              </>
            ) : (
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
            )}

            <div className="selection-list">
              {filteredEffects.map((effect) => (
                <button
                  key={effect.id}
                  className={`selection-list__item${selectedEffect?.id === effect.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() =>
                    setSearchParams((currentParams) => {
                      const nextParams = new URLSearchParams(currentParams);
                      nextParams.set('effect', effect.id);
                      return nextParams;
                    })
                  }
                >
                  <strong>
                    <SearchHighlight text={effect.title} query={searchQuery} />
                  </strong>
                  <span>
                    <SearchHighlight text={`${effect.category} | ${effect.state}`} query={searchQuery} />
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <article className="card stack">
            {draftEffect ? (
              <>
                <div className="section-heading">
                  <h3>
                    <SearchHighlight text={draftEffect.title} query={searchQuery} />
                  </h3>
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
                  </div>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows={5}
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

                <section className="stack stack--compact">
                  <h4>Where it applies</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Scope</span>
                      <select
                        value={draftEffect.scopeType}
                        onChange={(event) =>
                          updateSelectedEffect({
                            ...draftEffect,
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
                        value={draftEffect.ownerEntityType}
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

                          updateSelectedEffect({
                            ...draftEffect,
                            ownerEntityType,
                            ownerEntityId: ownerEntityType === 'system' ? 'system' : nextOwnerOptions[0]?.value ?? draftEffect.ownerEntityId,
                          });
                        }}
                      >
                        {ownerEntityTypes.map((ownerType) => (
                          <option
                            key={ownerType}
                            value={ownerType}
                            disabled={!hasOwnerTargets(ownerOptions, ownerType) && ownerType !== draftEffect.ownerEntityType}
                          >
                            {ownerType}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Owner target</span>
                      {draftEffect.ownerEntityType === 'system' ? (
                        <input value="system" readOnly />
                      ) : selectedOwnerOptions.length > 0 ? (
                        <select
                          value={draftEffect.ownerEntityId}
                          onChange={(event) =>
                            updateSelectedEffect({
                              ...draftEffect,
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
                        <input value={draftEffect.ownerEntityId} readOnly />
                      )}
                    </label>
                  </div>

                  {!hasOwnerTargets(ownerOptions, draftEffect.ownerEntityType) ? (
                    <p className="editor-section__empty">
                      This effect currently points at an owner type with no matching records in the active workspace.
                      Choose a different owner type to repair it.
                    </p>
                  ) : null}
                </section>

                {draftEffect.category === 'rule' ? (
                  <section className="stack stack--compact">
                    <h4>Rule overrides</h4>
                    <div className="field-grid field-grid--three">
                      {(['warehouseAccess', 'powerAccess', 'itemAccess', 'altFormAccess', 'supplementAccess'] as const).map(
                        (key) => (
                          <label className="field" key={key}>
                            <span>{key}</span>
                            <select
                              value={(getRuleOverrides(draftEffect)[key] as string | undefined) ?? ''}
                              onChange={(event) =>
                                updateSelectedEffect(setRuleOverride(draftEffect, key, event.target.value as AccessMode | ''))
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
                          checked={Boolean(getRuleOverrides(draftEffect).gauntlet)}
                          onChange={(event) =>
                            updateSelectedEffect(setRuleOverride(draftEffect, 'gauntlet', event.target.checked))
                          }
                        />
                        <span>Force gauntlet state</span>
                      </label>
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
                      <label className="field">
                        <span>Source effect id</span>
                        <input
                          value={draftEffect.sourceEffectId ?? ''}
                          onChange={(event) =>
                            updateSelectedEffect({
                              ...draftEffect,
                              sourceEffectId: event.target.value === '' ? null : event.target.value,
                            })
                          }
                        />
                      </label>
                      <AdvancedJsonDetails
                        summary="Advanced JSON"
                        badge="import metadata"
                        hint="Raw effect metadata is still editable, but it does not need to sit in the main editor."
                      >
                        <JsonEditorField
                          label="Import source metadata"
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
                    <label className="field">
                      <span>Source effect id</span>
                      <input
                        value={draftEffect.sourceEffectId ?? ''}
                        onChange={(event) =>
                          updateSelectedEffect({
                            ...draftEffect,
                            sourceEffectId: event.target.value === '' ? null : event.target.value,
                          })
                        }
                      />
                    </label>
                    <AdvancedJsonDetails
                      summary="Advanced JSON"
                      badge="import metadata"
                      hint="Raw effect metadata is still editable, but it does not need to sit in the main editor."
                    >
                      <JsonEditorField
                        label="Import source metadata"
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
              <p>No effects match the current filters.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
