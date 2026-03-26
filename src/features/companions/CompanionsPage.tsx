import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { companionStatuses } from '../../domain/common';
import type { Companion } from '../../domain/jumper/types';
import { db } from '../../db/database';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery } from '../search/searchUtils';
import { createBlankCompanion, deleteChainRecord, saveChainRecord } from '../workspace/records';
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

type CompanionFilter = 'all' | 'attached' | 'independent' | 'inactive';

function getCompanionFilterSummary(
  companion: Companion,
  parentName: string | null,
) {
  const parts: string[] = [companion.status];

  if (companion.role.trim()) {
    parts.push(companion.role.trim());
  }

  if (parentName) {
    parts.push(`Attached to ${parentName}`);
  } else {
    parts.push('Independent');
  }

  return parts.join(' | ');
}

function getCompanionSimpleSummary(companion: Companion, parentName: string | null) {
  if (companion.status === 'inactive' || companion.status === 'retired') {
    return parentName ? `${companion.status} | ${parentName}` : companion.status;
  }

  return parentName ? `Attached to ${parentName}` : 'Independent companion';
}

export function CompanionsPage() {
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<CompanionFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const selectedCompanionId = searchParams.get('companion');
  const parentNameById = useMemo(
    () => new Map(workspace.jumpers.map((jumper) => [jumper.id, jumper.name])),
    [workspace.jumpers],
  );

  const filteredCompanions = workspace.companions.filter((companion) => {
    const parentName = companion.parentJumperId ? parentNameById.get(companion.parentJumperId) ?? '' : '';

    if (!matchesSearchQuery(searchQuery, companion.name, companion.role, companion.status, parentName, companion.importSourceMetadata)) {
      return false;
    }

    switch (filter) {
      case 'attached':
        return Boolean(companion.parentJumperId);
      case 'independent':
        return !companion.parentJumperId;
      case 'inactive':
        return companion.status === 'inactive' || companion.status === 'retired';
      default:
        return true;
    }
  });

  const selectedCompanion =
    filteredCompanions.find((companion) => companion.id === selectedCompanionId) ??
    filteredCompanions[0] ??
    null;
  const companionAutosave = useAutosaveRecord(selectedCompanion, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.companions, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save companion changes.'),
  });
  const draftCompanion = companionAutosave.draft ?? selectedCompanion;

  async function handleAddCompanion() {
    if (!workspace.activeBranch) {
      return;
    }

    const companion = createBlankCompanion(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.companions, companion);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.set('companion', companion.id);
        return nextParams;
      });
      setNotice({
        tone: 'success',
        message: 'Created a new companion record.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a companion.',
      });
    }
  }

  async function handleDeleteCompanion() {
    if (!selectedCompanion) {
      return;
    }

    try {
      await deleteChainRecord(db.companions, selectedCompanion.id, chainId);
      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);
        nextParams.delete('companion');
        return nextParams;
      });
      setNotice({
        tone: 'success',
        message: 'Companion deleted.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete companion.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or recover a branch before editing companions." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Companions"
        description={
          simpleMode
            ? 'Pick a companion, set the relationship basics, and use Optional only for continuity or raw import cleanup.'
            : 'Roster, parent-jumper assignment, and continuity basics for branch-scoped companion records.'
        }
        badge={`${workspace.companions.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleAddCompanion()}>
            Add Companion
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={companionAutosave.status} />

      {workspace.companions.length === 0 ? (
        <EmptyWorkspaceCard
          title="No companions yet"
          body="Create the first companion for this branch, then assign a parent jumper or keep them independent."
          action={
            <button className="button" type="button" onClick={() => void handleAddCompanion()}>
              Create First Companion
            </button>
          }
        />
      ) : (
        <section className="workspace-two-column">
          <aside className="card stack">
            <div className="section-heading">
              <h3>Roster</h3>
              <span className="pill">{filteredCompanions.length} shown</span>
            </div>
            {simpleMode ? <p>Choose a companion, then start with name, role, and whether they are attached or independent.</p> : null}

            {simpleMode ? (
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>More roster filters</span>
                  <span className="pill">Optional</span>
                </summary>
                <div className="details-panel__body">
                  <label className="field">
                    <span>Filter</span>
                    <select value={filter} onChange={(event) => setFilter(event.target.value as CompanionFilter)}>
                      <option value="all">all</option>
                      <option value="attached">attached</option>
                      <option value="independent">independent</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </label>
                </div>
              </details>
            ) : (
              <label className="field">
                <span>Filter</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as CompanionFilter)}>
                  <option value="all">all</option>
                  <option value="attached">attached</option>
                  <option value="independent">independent</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
            )}

            <label className="field">
              <span>Search roster</span>
              <input
                value={searchQuery}
                placeholder="name, role, status, parent jumper..."
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

            <div className="selection-list">
              {filteredCompanions.map((companion) => {
                const parentName = companion.parentJumperId ? parentNameById.get(companion.parentJumperId) ?? null : null;

                return (
                  <button
                    key={companion.id}
                    className={`selection-list__item${selectedCompanion?.id === companion.id ? ' is-active' : ''}`}
                    type="button"
                    onClick={() =>
                      setSearchParams((currentParams) => {
                        const nextParams = new URLSearchParams(currentParams);
                        nextParams.set('companion', companion.id);
                        return nextParams;
                      })
                    }
                  >
                    <strong>
                      <SearchHighlight text={companion.name} query={searchQuery} />
                    </strong>
                    <span>
                      <SearchHighlight
                        text={
                          simpleMode
                            ? getCompanionSimpleSummary(companion, parentName)
                            : getCompanionFilterSummary(companion, parentName)
                        }
                        query={searchQuery}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <article className="card stack">
            {draftCompanion ? (
              <>
                <div className="section-heading">
                  <h3>
                    <SearchHighlight text={draftCompanion.name} query={searchQuery} />
                  </h3>
                  <div className="actions">
                    <Link
                      className="button button--secondary"
                      to={`/chains/${chainId}/notes?ownerType=companion&ownerId=${draftCompanion.id}`}
                    >
                      Companion Notes
                    </Link>
                    {draftCompanion.parentJumperId ? (
                      <Link
                        className="button button--secondary"
                        to={`/chains/${chainId}/jumpers?jumper=${draftCompanion.parentJumperId}`}
                      >
                        Open Parent Jumper
                      </Link>
                    ) : null}
                    {simpleMode ? (
                      <details className="details-panel">
                        <summary className="details-panel__summary">
                          <span>More actions</span>
                          <span className="pill">Optional</span>
                        </summary>
                        <div className="details-panel__body actions">
                          <Link
                            className="button button--secondary"
                            to={`/chains/${chainId}/effects?ownerType=companion&ownerId=${draftCompanion.id}`}
                          >
                            Companion Effects
                          </Link>
                          <button className="button button--secondary" type="button" onClick={() => void handleDeleteCompanion()}>
                            Delete
                          </button>
                        </div>
                      </details>
                    ) : (
                      <>
                        <Link
                          className="button button--secondary"
                          to={`/chains/${chainId}/effects?ownerType=companion&ownerId=${draftCompanion.id}`}
                        >
                          Companion Effects
                        </Link>
                        <button className="button button--secondary" type="button" onClick={() => void handleDeleteCompanion()}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {simpleMode ? <p>Start with the relationship basics here. Optional holds origin and raw import details.</p> : null}

                <section className="stack stack--compact">
                  <h4>Simple</h4>
                  <div className="field-grid field-grid--two">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={draftCompanion.name}
                        onChange={(event) =>
                          companionAutosave.updateDraft({
                            ...draftCompanion,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <input
                        value={draftCompanion.role}
                        onChange={(event) =>
                          companionAutosave.updateDraft({
                            ...draftCompanion,
                            role: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Parent jumper</span>
                      <select
                        value={draftCompanion.parentJumperId ?? ''}
                        onChange={(event) =>
                          companionAutosave.updateDraft({
                            ...draftCompanion,
                            parentJumperId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Independent</option>
                        {workspace.jumpers.map((jumper) => (
                          <option key={jumper.id} value={jumper.id}>
                            {jumper.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={draftCompanion.status}
                        onChange={(event) =>
                          companionAutosave.updateDraft({
                            ...draftCompanion,
                            status: event.target.value as Companion['status'],
                          })
                        }
                      >
                        {companionStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                {simpleMode ? (
                  <details className="details-panel">
                    <summary className="details-panel__summary">
                      <span>Continuity and advanced details</span>
                      <span className="pill">Optional</span>
                    </summary>
                    <div className="details-panel__body stack stack--compact">
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Origin jump</span>
                          <select
                            value={draftCompanion.originJumpId ?? ''}
                            onChange={(event) =>
                              companionAutosave.updateDraft({
                                ...draftCompanion,
                                originJumpId: event.target.value || null,
                              })
                            }
                          >
                            <option value="">Unknown</option>
                            {workspace.jumps.map((jump) => (
                              <option key={jump.id} value={jump.id}>
                                {jump.orderIndex + 1}. {jump.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Branch</span>
                          <input value={workspace.activeBranch.title} readOnly />
                        </label>
                      </div>

                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Companion id</span>
                          <input value={draftCompanion.id} readOnly />
                        </label>
                        <label className="field">
                          <span>Updated</span>
                          <input value={new Date(draftCompanion.updatedAt).toLocaleString()} readOnly />
                        </label>
                      </div>

                      <AdvancedJsonDetails
                        summary="Advanced JSON"
                        badge="import metadata"
                        hint="Companion import leftovers stay hidden here unless you actually need the raw structure."
                      >
                        <JsonEditorField
                          label="Import Source Metadata"
                          value={draftCompanion.importSourceMetadata}
                          rows={10}
                          onValidChange={(value) =>
                            companionAutosave.updateDraft({
                              ...draftCompanion,
                              importSourceMetadata: value as Companion['importSourceMetadata'],
                            })
                          }
                        />
                      </AdvancedJsonDetails>
                    </div>
                  </details>
                ) : (
                  <>
                    <section className="stack stack--compact">
                      <h4>Continuity</h4>
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Origin jump</span>
                          <select
                            value={draftCompanion.originJumpId ?? ''}
                            onChange={(event) =>
                              companionAutosave.updateDraft({
                                ...draftCompanion,
                                originJumpId: event.target.value || null,
                              })
                            }
                          >
                            <option value="">Unknown</option>
                            {workspace.jumps.map((jump) => (
                              <option key={jump.id} value={jump.id}>
                                {jump.orderIndex + 1}. {jump.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Branch</span>
                          <input value={workspace.activeBranch.title} readOnly />
                        </label>
                      </div>
                    </section>

                    <section className="stack stack--compact">
                      <h4>Advanced</h4>
                      <div className="field-grid field-grid--two">
                        <label className="field">
                          <span>Companion id</span>
                          <input value={draftCompanion.id} readOnly />
                        </label>
                        <label className="field">
                          <span>Updated</span>
                          <input value={new Date(draftCompanion.updatedAt).toLocaleString()} readOnly />
                        </label>
                      </div>

                      <AdvancedJsonDetails
                        summary="Advanced JSON"
                        badge="import metadata"
                        hint="Companion import leftovers stay hidden here unless you actually need the raw structure."
                      >
                        <JsonEditorField
                          label="Import Source Metadata"
                          value={draftCompanion.importSourceMetadata}
                          rows={10}
                          onValidChange={(value) =>
                            companionAutosave.updateDraft({
                              ...draftCompanion,
                              importSourceMetadata: value as Companion['importSourceMetadata'],
                            })
                          }
                        />
                      </AdvancedJsonDetails>
                    </section>
                  </>
                )}
              </>
            ) : (
              <p>No companion matches the current filter.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
