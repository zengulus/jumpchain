import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { companionStatuses } from '../../domain/common';
import type { Companion } from '../../domain/jumper/types';
import { db } from '../../db/database';
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

export function CompanionsPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<CompanionFilter>('all');
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedCompanionId = searchParams.get('companion');
  const parentNameById = useMemo(
    () => new Map(workspace.jumpers.map((jumper) => [jumper.id, jumper.name])),
    [workspace.jumpers],
  );

  const filteredCompanions = workspace.companions.filter((companion) => {
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
    workspace.companions.find((companion) => companion.id === selectedCompanionId) ??
    filteredCompanions[0] ??
    workspace.companions[0] ??
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
      setSearchParams({ companion: companion.id });
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
      setSearchParams({});
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
        description="Roster, parent-jumper assignment, and continuity basics for branch-scoped companion records."
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

            <label className="field">
              <span>Filter</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value as CompanionFilter)}>
                <option value="all">all</option>
                <option value="attached">attached</option>
                <option value="independent">independent</option>
                <option value="inactive">inactive</option>
              </select>
            </label>

            <div className="selection-list">
              {filteredCompanions.map((companion) => {
                const parentName = companion.parentJumperId ? parentNameById.get(companion.parentJumperId) ?? null : null;

                return (
                  <button
                    key={companion.id}
                    className={`selection-list__item${selectedCompanion?.id === companion.id ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setSearchParams({ companion: companion.id })}
                  >
                    <strong>{companion.name}</strong>
                    <span>{getCompanionFilterSummary(companion, parentName)}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <article className="card stack">
            {draftCompanion ? (
              <>
                <div className="section-heading">
                  <h3>{draftCompanion.name}</h3>
                  <div className="actions">
                    {draftCompanion.parentJumperId ? (
                      <Link
                        className="button button--secondary"
                        to={`/chains/${chainId}/jumpers?jumper=${draftCompanion.parentJumperId}`}
                      >
                        Open Parent Jumper
                      </Link>
                    ) : null}
                    <Link
                      className="button button--secondary"
                      to={`/chains/${chainId}/notes?ownerType=companion&ownerId=${draftCompanion.id}`}
                    >
                      Companion Notes
                    </Link>
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
                </div>

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
            ) : (
              <p>No companion matches the current filter.</p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
