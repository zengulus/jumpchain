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
  SimpleModeGuideFrame,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  createBranchGuideScopeKey,
  createSimpleModePageGuideState,
  getFirstIncompleteGuideStep,
  isCompanionGuideStepComplete,
  markGuideStepAcknowledged,
  readGuideRequested,
  setGuideCurrentStep,
  setGuideDismissed,
  updateGuideSearchParams,
  type CompanionGuideStepId,
} from '../workspace/simpleModeGuides';

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
  const { simpleMode, getBranchGuideState, updateBranchGuideState } = useUiPreferences();
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
  const branchGuideScopeKey = workspace.activeBranch ? createBranchGuideScopeKey(chainId, workspace.activeBranch.id) : null;
  const guideRequested = simpleMode && readGuideRequested(searchParams);
  const companionGuideSteps = [
    {
      id: 'relationship',
      label: 'Relationship',
      description: 'Start with the companion name, role, and whether they are attached to a jumper or standing on their own.',
    },
    {
      id: 'continuity',
      label: 'Continuity',
      description: 'Add the origin-jump and continuity details only when they are useful for this chain.',
    },
  ] as const;
  const selectedCompanionGuideState =
    branchGuideScopeKey && selectedCompanion
      ? getBranchGuideState(branchGuideScopeKey, 'companions', selectedCompanion.id)
      : createSimpleModePageGuideState('relationship');
  const currentGuideStepId = draftCompanion
    ? (getFirstIncompleteGuideStep(
        companionGuideSteps.map((step) => step.id),
        selectedCompanionGuideState,
        (stepId) =>
          isCompanionGuideStepComplete(draftCompanion, selectedCompanionGuideState, stepId as CompanionGuideStepId),
      ) as CompanionGuideStepId | null)
    : null;
  const activeGuideVisible = simpleMode && guideRequested && Boolean(currentGuideStepId) && !selectedCompanionGuideState.dismissed;
  const hasRosterSearch = searchQuery.trim().length > 0;
  const showRosterFilter = !activeGuideVisible && (workspace.companions.length > 1 || filter !== 'all');
  const showRosterSearch = !activeGuideVisible && (workspace.companions.length > 1 || hasRosterSearch);
  const showRosterCount = filter !== 'all' || hasRosterSearch;

  function updateSelectedCompanionGuideState(
    updater: (current: ReturnType<typeof getBranchGuideState>) => ReturnType<typeof getBranchGuideState>,
  ) {
    if (!branchGuideScopeKey || !selectedCompanion) {
      return;
    }

    updateBranchGuideState(branchGuideScopeKey, 'companions', selectedCompanion.id, updater);
  }

  function setGuideRequested(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  function handleGuideStepChange(stepId: CompanionGuideStepId) {
    updateSelectedCompanionGuideState((current) => setGuideCurrentStep(current, stepId));
  }

  function handleGuideDismiss() {
    updateSelectedCompanionGuideState((current) => setGuideDismissed(current, true));
    setGuideRequested(false);
  }

  function handleReopenGuide() {
    if (!currentGuideStepId) {
      return;
    }

    updateSelectedCompanionGuideState((current) => setGuideCurrentStep(setGuideDismissed(current, false), currentGuideStepId));
    setGuideRequested(true);
  }

  function handleRelationshipGuideContinue() {
    updateSelectedCompanionGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'relationship'), 'continuity'));
  }

  function handleCompanionGuideFinish() {
    updateSelectedCompanionGuideState((current) => setGuideCurrentStep(markGuideStepAcknowledged(current, 'continuity'), 'continuity'));
    setGuideRequested(false);
  }

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
        if (simpleMode) {
          nextParams.set('guide', '1');
        }
        return nextParams;
      });
      if (simpleMode && branchGuideScopeKey) {
        updateBranchGuideState(branchGuideScopeKey, 'companions', companion.id, () => createSimpleModePageGuideState('relationship'));
      }
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
        actions={activeGuideVisible ? undefined : (
          <button className="button" type="button" onClick={() => void handleAddCompanion()}>
            Add Companion
          </button>
        )}
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
              {showRosterCount ? <span className="pill">{filteredCompanions.length} shown</span> : null}
            </div>
            {simpleMode && workspace.companions.length > 1 ? <p>Choose a companion, then edit relationship basics first.</p> : null}

            {simpleMode && showRosterFilter ? (
              <details className="details-panel">
                <summary className="details-panel__summary">
                  <span>Roster filters</span>
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
            ) : showRosterFilter ? (
              <label className="field">
                <span>Filter</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as CompanionFilter)}>
                  <option value="all">all</option>
                  <option value="attached">attached</option>
                  <option value="independent">independent</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
            ) : null}

            {showRosterSearch ? (
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
            ) : null}

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
                    {simpleMode && !activeGuideVisible ? (
                      <button className="button button--secondary" type="button" onClick={handleReopenGuide}>
                        {guideRequested && !selectedCompanionGuideState.dismissed ? 'Guide Open' : 'Reopen Setup'}
                      </button>
                    ) : null}
                    {simpleMode && !activeGuideVisible ? (
                      <details className="details-panel">
                        <summary className="details-panel__summary">
                          <span>More actions</span>
                          <span className="pill">Optional</span>
                        </summary>
                        <div className="details-panel__body actions">
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
                    ) : !activeGuideVisible ? (
                      <>
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
                    ) : null}
                  </div>
                </div>
                {simpleMode ? <p>Start with relationship basics here. Open Optional for origin or import details.</p> : null}

                {activeGuideVisible ? (
                  <SimpleModeGuideFrame
                    title={`${draftCompanion.name} setup`}
                    steps={[...companionGuideSteps]}
                    currentStepId={currentGuideStepId!}
                    acknowledgedStepIds={selectedCompanionGuideState.acknowledgedStepIds}
                    onStepChange={(stepId) => handleGuideStepChange(stepId as CompanionGuideStepId)}
                    onDismiss={handleGuideDismiss}
                  >
                    <div className="actions">
                      {currentGuideStepId === 'continuity' ? (
                        <button className="button button--secondary" type="button" onClick={() => handleGuideStepChange('relationship')}>
                          Back to Relationship
                        </button>
                      ) : null}
                      {currentGuideStepId === 'relationship' ? (
                        <button className="button" type="button" onClick={handleRelationshipGuideContinue}>
                          Continue to Continuity
                        </button>
                      ) : (
                        <button className="button" type="button" onClick={handleCompanionGuideFinish}>
                          Finish Setup
                        </button>
                      )}
                    </div>
                  </SimpleModeGuideFrame>
                ) : null}

                <section className="stack stack--compact">
                  <h4>Core relationship</h4>
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
                  <details className="details-panel" open={guideRequested && currentGuideStepId === 'continuity' ? true : undefined}>
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
                      <h4>Metadata</h4>
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
