import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { jumpStatuses, jumpTypes } from '../../domain/common';
import { db } from '../../db/database';
import { switchActiveJump } from '../../db/persistence';
import { ParticipationBudgetShellAttachment, ParticipationEditorCard } from '../participation/ParticipationPage';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { createBlankJump, createBlankParticipation, saveChainRecord, syncJumpParticipantMembership } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  PlainLanguageHint,
  SimpleModeAffirmation,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { useWorkspaceHeaderAttachment } from '../workspace/ChainWorkspaceLayout';

type JumpWorkspaceTab = 'basics' | 'party' | 'purchases' | 'advanced';
type JumpGuidedStage = Extract<JumpWorkspaceTab, 'basics' | 'party' | 'purchases'>;

const JUMP_WORKSPACE_TABS: Array<{ id: JumpWorkspaceTab; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'party', label: 'Party' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'advanced', label: 'Metadata' },
];

const JUMP_GUIDED_STAGES: Array<{ id: JumpGuidedStage; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'party', label: 'Party' },
  { id: 'purchases', label: 'Purchases' },
];

function JumpWorkspaceTabs(props: {
  activeTab: JumpWorkspaceTab;
  onChange: (nextTab: JumpWorkspaceTab) => void;
}) {
  return (
    <div className="editor-tab-list" role="tablist" aria-label="Jump workspace sections">
      {JUMP_WORKSPACE_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`editor-tab${props.activeTab === tab.id ? ' is-active' : ''}`}
          type="button"
          role="tab"
          aria-selected={props.activeTab === tab.id}
          onClick={() => props.onChange(tab.id)}
        >
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function JumpGuidedStepper(props: {
  activeTab: JumpWorkspaceTab;
  reviewState: Partial<Record<JumpGuidedStage, true>>;
  onChange: (nextTab: JumpGuidedStage) => void;
}) {
  function getStatusLabel(stageId: JumpGuidedStage) {
    if (props.reviewState[stageId]) {
      return 'Reviewed';
    }

    if (props.activeTab === stageId) {
      return 'Current';
    }

    return 'Next';
  }

  return (
    <section className="jump-guided-flow stack stack--compact">
      <div className="jump-guided-flow__header">
        <h4>Required steps</h4>
        <span className="pill">Guided</span>
      </div>
      <div className="guided-stepper" role="tablist" aria-label="Required jump steps">
        {JUMP_GUIDED_STAGES.map((stage, index) => {
          const isComplete = props.reviewState[stage.id] === true;
          const isCurrent = props.activeTab === stage.id;

          return (
            <button
              key={stage.id}
              className={`guided-stepper__item${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}`}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => props.onChange(stage.id)}
            >
              <span className="guided-stepper__item-index">{index + 1}</span>
              <span className="guided-stepper__item-copy">
                <strong>{stage.label}</strong>
                <span>{getStatusLabel(stage.id)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function JumpsPage() {
  const navigate = useNavigate();
  const { jumpId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { simpleMode } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [simpleReviewByJump, setSimpleReviewByJump] = useState<Record<string, Partial<Record<JumpGuidedStage, true>>>>({});
  const searchQuery = searchParams.get('search') ?? '';
  const focusedJumperId = searchParams.get('jumper');
  const participationPanelRequested = searchParams.get('panel') === 'participation';
  const filteredJumps = workspace.jumps.filter((jump) =>
    matchesSearchQuery(searchQuery, jump.title, jump.status, jump.jumpType, jump.duration, jump.importSourceMetadata),
  );
  const selectedJump = filteredJumps.find((jump) => jump.id === jumpId) ?? filteredJumps[0] ?? null;
  const jumpAutosave = useAutosaveRecord(selectedJump, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumps, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save jump changes.'),
  });
  const draftJump = jumpAutosave.draft ?? selectedJump;
  const focusedJumper =
    focusedJumperId && workspace.jumpers.some((jumper) => jumper.id === focusedJumperId)
      ? workspace.jumpers.find((jumper) => jumper.id === focusedJumperId) ?? null
      : null;
  const jumpParticipantJumpers =
    draftJump ? workspace.jumpers.filter((jumper) => draftJump.participantJumperIds.includes(jumper.id)) : [];
  const pendingFocusedJumper =
    draftJump && focusedJumper && !draftJump.participantJumperIds.includes(focusedJumper.id) ? focusedJumper : null;
  const activeParticipationJumper =
    draftJump && focusedJumper && draftJump.participantJumperIds.includes(focusedJumper.id)
      ? focusedJumper
      : jumpParticipantJumpers[0] ?? null;
  const activeParticipation =
    draftJump && activeParticipationJumper
      ? workspace.participations.find(
          (participation) => participation.jumpId === draftJump.id && participation.jumperId === activeParticipationJumper.id,
        ) ?? null
      : null;
  const [liveParticipationDraft, setLiveParticipationDraft] = useState<(typeof workspace.participations)[number] | null>(null);
  const visibleParticipation =
    liveParticipationDraft && activeParticipation && liveParticipationDraft.id === activeParticipation.id
      ? liveParticipationDraft
      : activeParticipation;
  const { message: simpleAffirmation, showAffirmation, clearAffirmation } = useSimpleModeAffirmation();
  const [activeTab, setActiveTab] = useState<JumpWorkspaceTab>(participationPanelRequested ? 'purchases' : 'basics');
  const selectedJumpReviewState = selectedJump ? simpleReviewByJump[selectedJump.id] ?? {} : {};
  const purchaseBudgetAttachment = useMemo(() => {
    if (activeTab !== 'purchases' || !draftJump || !activeParticipationJumper || !visibleParticipation) {
      return null;
    }

    return (
      <ParticipationBudgetShellAttachment
        jump={draftJump}
        jumper={activeParticipationJumper}
        participation={visibleParticipation}
        workspace={workspace}
      />
    );
  }, [activeParticipationJumper, activeTab, draftJump, visibleParticipation, workspace]);

  useWorkspaceHeaderAttachment(purchaseBudgetAttachment);

  function getFirstIncompleteStage(reviewState: Partial<Record<JumpGuidedStage, true>>) {
    return JUMP_GUIDED_STAGES.find((stage) => !reviewState[stage.id])?.id ?? 'purchases';
  }

  useEffect(() => {
    if (simpleMode) {
      setActiveTab(participationPanelRequested ? 'purchases' : getFirstIncompleteStage(selectedJump ? simpleReviewByJump[selectedJump.id] ?? {} : {}));
      return;
    }

    setActiveTab(participationPanelRequested ? 'purchases' : 'basics');
  }, [selectedJump?.id, participationPanelRequested, simpleMode, simpleReviewByJump]);

  useEffect(() => {
    clearAffirmation();
  }, [clearAffirmation, selectedJump?.id]);

  function updateQuery(mutator: (nextParams: URLSearchParams) => void) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      mutator(nextParams);
      return nextParams;
    });
  }

  function handleTabChange(nextTab: JumpWorkspaceTab, options?: { preserveAffirmation?: boolean }) {
    if (simpleMode && !options?.preserveAffirmation) {
      clearAffirmation();
    }

    setActiveTab(nextTab);
    updateQuery((nextParams) => {
      if (nextTab === 'purchases') {
        nextParams.set('panel', 'participation');
      } else {
        nextParams.delete('panel');
      }
    });
  }

  function markSimpleStageComplete(stage: JumpGuidedStage) {
    if (!selectedJump || !simpleMode) {
      return;
    }

    setSimpleReviewByJump((current) => ({
      ...current,
      [selectedJump.id]: {
        ...(current[selectedJump.id] ?? {}),
        [stage]: true,
      },
    }));

    if (stage === 'basics') {
      showAffirmation('The jump basics are set. Next is deciding who belongs in this jump.');
      handleTabChange('party', { preserveAffirmation: true });
      return;
    }

    if (stage === 'party') {
      showAffirmation('The party is set for now. Next is the purchase pass.');
      handleTabChange('purchases', { preserveAffirmation: true });
      return;
    }

    showAffirmation('This jump has a workable purchase pass. You can refine it whenever you want.');
    handleTabChange('purchases', { preserveAffirmation: true });
  }

  function setFocusedParticipant(nextJumperId: string | null) {
    updateQuery((nextParams) => {
      if (nextJumperId && nextJumperId.trim().length > 0) {
        nextParams.set('jumper', nextJumperId);
      } else {
        nextParams.delete('jumper');
      }

      if (activeTab === 'purchases' || participationPanelRequested) {
        nextParams.set('panel', 'participation');
      }
    });
  }

  function getJumpPath(nextJumpId: string) {
    return withSearchParams(`/chains/${chainId}/jumps/${nextJumpId}`, {
      search: searchQuery,
      jumper: focusedJumperId,
      panel: activeTab === 'purchases' || participationPanelRequested ? 'participation' : undefined,
    });
  }

  async function handleAddJump() {
    if (!workspace.activeBranch) {
      return;
    }

    const jump = createBlankJump(chainId, workspace.activeBranch.id, workspace.jumps.length);

    try {
      await saveChainRecord(db.jumps, jump);

      if (!workspace.currentJump) {
        await switchActiveJump(chainId, jump.id);
      }

      navigate(withSearchParams(`/chains/${chainId}/jumps/${jump.id}`, { search: searchQuery }));
      setNotice({
        tone: 'success',
        message: 'Created a new jump record.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jump.',
      });
    }
  }

  async function handleMakeCurrentJump() {
    if (!selectedJump) {
      return;
    }

    try {
      await switchActiveJump(chainId, selectedJump.id);
      setNotice({
        tone: 'success',
        message: 'Current jump updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch the current jump.',
      });
    }
  }

  async function toggleParticipant(jumperId: string) {
    const targetJump = draftJump ?? selectedJump;

    if (!targetJump) {
      return;
    }

    const alreadyParticipating = targetJump.participantJumperIds.includes(jumperId);
    const nextParticipantIds = alreadyParticipating
      ? targetJump.participantJumperIds.filter((id) => id !== jumperId)
      : Array.from(new Set([...targetJump.participantJumperIds, jumperId]));

    jumpAutosave.updateDraft({
      ...targetJump,
      participantJumperIds: nextParticipantIds,
    });

    try {
      await syncJumpParticipantMembership(chainId, targetJump, jumperId, !alreadyParticipating);

      if (alreadyParticipating && focusedJumperId === jumperId) {
        setFocusedParticipant(nextParticipantIds[0] ?? null);
      } else if (!alreadyParticipating && !simpleMode) {
        setActiveTab('purchases');
        updateQuery((nextParams) => {
          nextParams.set('jumper', jumperId);
          nextParams.set('panel', 'participation');
        });
      } else if (!alreadyParticipating) {
        setFocusedParticipant(jumperId);
      }

      setNotice({
        tone: 'success',
        message: alreadyParticipating
          ? 'Removed jumper from this jump and cleaned up participation and purchases data.'
          : 'Updated jump participants and their records.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to update jump participants.',
      });
    }
  }

  async function ensureParticipation(jumperId: string) {
    const targetJump = draftJump ?? selectedJump;

    if (!workspace.activeBranch || !targetJump) {
      return;
    }

    const existing = workspace.participations.find(
      (participation) => participation.jumpId === targetJump.id && participation.jumperId === jumperId,
    );

    if (existing) {
      handleTabChange('purchases');
      updateQuery((nextParams) => {
        nextParams.set('jumper', jumperId);
      });
      return;
    }

    try {
      await saveChainRecord(db.participations, createBlankParticipation(chainId, workspace.activeBranch.id, targetJump.id, jumperId));

      if (!targetJump.participantJumperIds.includes(jumperId)) {
        const nextParticipantIds = [...targetJump.participantJumperIds, jumperId];

        jumpAutosave.updateDraft({
          ...targetJump,
          participantJumperIds: nextParticipantIds,
        });

        await saveChainRecord(db.jumps, {
          ...targetJump,
          participantJumperIds: nextParticipantIds,
        });
      }

      handleTabChange('purchases');
      updateQuery((nextParams) => {
        nextParams.set('jumper', jumperId);
      });
      setNotice({
        tone: 'success',
        message: 'Created a participation and purchases record for this jumper.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a participation and purchases record.',
      });
    }
  }

  function renderBasicsTab() {
    if (!draftJump) {
      return <p>No jumps match the current search.</p>;
    }

    return (
      <div className="stack stack--compact">
        <section className="editor-section">
          <div className="editor-section__header">
            <div className="stack stack--compact">
              <h4>Jump basics</h4>
              <PlainLanguageHint term="Jump" meaning="one world or segment in the chain." />
            </div>
          </div>
          <div className="field-grid field-grid--two">
            <label className="field">
              <span>Title</span>
              <input
                value={draftJump.title}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    title: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              <span>Order</span>
              <input
                type="number"
                value={draftJump.orderIndex}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    orderIndex: Number(event.target.value),
                  })
                }
              />
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={draftJump.status}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    status: event.target.value as (typeof jumpStatuses)[number],
                  })
                }
              >
                {jumpStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Jump type</span>
              <select
                value={draftJump.jumpType}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    jumpType: event.target.value as (typeof jumpTypes)[number],
                  })
                }
              >
                {jumpTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="editor-section">
          <div className="editor-section__header">
            <h4>Duration</h4>
          </div>
          <div className="field-grid field-grid--three">
            <label className="field">
              <span>Years</span>
              <input
                type="number"
                value={draftJump.duration.years}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    duration: {
                      ...draftJump.duration,
                      years: Number(event.target.value),
                    },
                  })
                }
              />
            </label>

            <label className="field">
              <span>Months</span>
              <input
                type="number"
                value={draftJump.duration.months}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    duration: {
                      ...draftJump.duration,
                      months: Number(event.target.value),
                    },
                  })
                }
              />
            </label>

            <label className="field">
              <span>Days</span>
              <input
                type="number"
                value={draftJump.duration.days}
                onChange={(event) =>
                  jumpAutosave.updateDraft({
                    ...draftJump,
                    duration: {
                      ...draftJump.duration,
                      days: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        </section>

        {simpleMode ? (
          <div className="actions">
            <button className="button" type="button" onClick={() => markSimpleStageComplete('basics')}>
              Continue to Party
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderPartyTab() {
    if (!draftJump) {
      return <p>No jumps match the current search.</p>;
    }

    if (workspace.jumpers.length === 0) {
      return <p>No jumpers yet.</p>;
    }

    return (
      <div className="stack stack--compact">
        <section className="editor-section">
          <div className="editor-section__header">
            <div className="stack stack--compact">
              <h4>Jumpers in this jump</h4>
              <PlainLanguageHint term="Party" meaning="the jumpers who are taking part in this jump." />
            </div>
            <span className="pill">{draftJump.participantJumperIds.length}</span>
          </div>

          <div className="selection-editor-list">
            {workspace.jumpers.map((jumper) => {
              const isParticipating = draftJump.participantJumperIds.includes(jumper.id);
              const isFocused = focusedJumperId === jumper.id;

              return (
                <div className="selection-editor" key={jumper.id}>
                  <div className="selection-editor__header">
                    <div className="stack stack--compact">
                      <strong>{jumper.name}</strong>
                      <div className="inline-meta">
                        <span className="pill">{isParticipating ? 'Participating' : 'Not in jump'}</span>
                        {isFocused ? <span className="pill">Current focus</span> : null}
                      </div>
                    </div>
                    <div className="actions">
                      {isParticipating ? (
                        <button className="button button--secondary" type="button" onClick={() => setFocusedParticipant(jumper.id)}>
                          Focus
                        </button>
                      ) : null}
                      <button className="button" type="button" onClick={() => void toggleParticipant(jumper.id)}>
                        {isParticipating ? 'Remove' : 'Add To Jump'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {simpleMode ? (
          <div className="actions">
            <button className="button" type="button" onClick={() => markSimpleStageComplete('party')}>
              Continue to Purchases
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderPurchasesTab() {
    if (!draftJump) {
      return <p>No jumps match the current search.</p>;
    }

    if (workspace.jumpers.length === 0) {
      return <p>No jumpers yet.</p>;
    }

    if (jumpParticipantJumpers.length === 0) {
      return (
        <article className="card editor-sheet stack">
          <div className="section-heading">
            <h3>No participating jumpers yet</h3>
            <span className="pill">Start in Party</span>
          </div>
          <p>Add at least one jumper to this jump before editing purchases.</p>
          <div className="actions">
            <button className="button" type="button" onClick={() => handleTabChange('party')}>
              Open Party
            </button>
          </div>
        </article>
      );
    }

    return (
      <div className="stack stack--compact">
        {jumpParticipantJumpers.length > 1 || pendingFocusedJumper ? (
          <section className="section-surface stack stack--compact">
            {jumpParticipantJumpers.length > 1 ? (
              <div className="chip-grid">
                {jumpParticipantJumpers.map((jumper) => (
                  <button
                    className={`choice-chip${activeParticipationJumper?.id === jumper.id ? ' is-active' : ''}`}
                    type="button"
                    key={jumper.id}
                    onClick={() => setFocusedParticipant(jumper.id)}
                  >
                    <span>{jumper.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {pendingFocusedJumper ? (
              <div className="jump-focus-callout">
                <strong>{pendingFocusedJumper.name} is not in this jump yet.</strong>
                <div className="actions">
                  <button className="button" type="button" onClick={() => void ensureParticipation(pendingFocusedJumper.id)}>
                    Add {pendingFocusedJumper.name} To This Jump
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {activeParticipationJumper && activeParticipation ? (
          <>
            <ParticipationEditorCard
              jump={draftJump}
              jumper={activeParticipationJumper}
              participation={activeParticipation}
              workspace={workspace}
              showBudgetSummary={false}
              showBudgetHeader={false}
              onDraftChange={setLiveParticipationDraft}
            />
          </>
        ) : activeParticipationJumper ? (
          <article className="card editor-sheet stack">
            <div className="section-heading">
              <h3>{activeParticipationJumper.name}</h3>
              <span className="pill pill--soft">record missing</span>
            </div>
            <p>{activeParticipationJumper.name} is participating, but the record is missing.</p>
            <div className="actions">
              <button className="button" type="button" onClick={() => void ensureParticipation(activeParticipationJumper.id)}>
                Create Record
              </button>
            </div>
          </article>
        ) : null}

        {simpleMode ? (
          <div className="actions">
            <button className="button" type="button" onClick={() => markSimpleStageComplete('purchases')}>
              Mark Purchases Reviewed
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing jumps." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Jumps"
        description={
          simpleMode
            ? 'Work through each jump in order: basics, party, then purchases.'
            : 'Edit one jump at a time with fast access to basics, party, purchases, and metadata.'
        }
        badge={`${workspace.jumps.length} total`}
        actions={
          <button className="button" type="button" onClick={() => void handleAddJump()}>
            Add Jump
          </button>
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={jumpAutosave.status} />

      {workspace.jumps.length === 0 ? (
        <EmptyWorkspaceCard
          title="No jumps yet"
          body="Add the first jump for this branch."
          action={
            <button className="button" type="button" onClick={() => void handleAddJump()}>
              Create First Jump
            </button>
          }
        />
      ) : (
        <div className="stack">
          <section className="card stack jump-switcher">
            <div className="section-heading">
              <h3>Choose jump</h3>
              <span className="pill">{filteredJumps.length} shown</span>
            </div>

            <label className="field">
              <span>Search jumps</span>
              <input
                value={searchQuery}
                placeholder="title, status, jump type..."
                onChange={(event) =>
                  updateQuery((nextParams) => {
                    if (event.target.value.trim()) {
                      nextParams.set('search', event.target.value);
                    } else {
                      nextParams.delete('search');
                    }
                  })
                }
              />
            </label>

            {filteredJumps.length === 0 ? (
              <p>No jumps match the current search.</p>
            ) : (
              <div className="jump-switcher__list">
                {filteredJumps.map((jump) => (
                  <button
                    className={`jump-switcher__item${selectedJump?.id === jump.id ? ' is-active' : ''}`}
                    key={jump.id}
                    type="button"
                    onClick={() => navigate(getJumpPath(jump.id))}
                  >
                    <strong>
                      {jump.orderIndex + 1}. <SearchHighlight text={jump.title} query={searchQuery} />
                    </strong>
                    <span>
                      <SearchHighlight
                        text={jump.id === workspace.currentJump?.id ? 'Current jump' : `${jump.status} • ${jump.jumpType}`}
                        query={searchQuery}
                      />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="jump-workspace">
            <article className="card stack jump-editor-shell">
              {draftJump ? (
                <>
                <div className="section-heading">
                  <div className="stack stack--compact">
                    <h3>
                      <SearchHighlight text={draftJump.title} query={searchQuery} />
                    </h3>
                      <div className="inline-meta">
                        <span className="pill">{draftJump.status}</span>
                        <span className="pill">{draftJump.jumpType}</span>
                        <span className="pill">{draftJump.participantJumperIds.length} participating</span>
                      </div>
                    </div>
                    <div className="actions">
                      {workspace.currentJump?.id === draftJump.id ? (
                        <span className="pill">Current jump</span>
                      ) : (
                        <button className="button button--secondary" type="button" onClick={() => void handleMakeCurrentJump()}>
                          Make Current Jump
                        </button>
                      )}
                    </div>
                  </div>

                  {simpleMode ? (
                    <>
                      <JumpGuidedStepper activeTab={activeTab} reviewState={selectedJumpReviewState} onChange={(nextTab) => handleTabChange(nextTab)} />
                      <SimpleModeAffirmation message={simpleAffirmation} />
                    </>
                  ) : (
                    <JumpWorkspaceTabs activeTab={activeTab} onChange={handleTabChange} />
                  )}

                  {activeTab === 'basics' ? renderBasicsTab() : null}
                  {activeTab === 'party' ? renderPartyTab() : null}
                  {activeTab === 'purchases' ? renderPurchasesTab() : null}
                  {simpleMode ? (
                    <AdvancedJsonDetails
                      summary="Metadata"
                      badge="import metadata"
                      hint="Preserved jump import data stays tucked away here unless you need raw cleanup."
                    >
                      <JsonEditorField
                        label="Import source metadata"
                        value={draftJump.importSourceMetadata}
                        onValidChange={(value) =>
                          jumpAutosave.updateDraft({
                            ...draftJump,
                            importSourceMetadata:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          })
                        }
                      />
                    </AdvancedJsonDetails>
                  ) : activeTab === 'advanced' ? (
                    <AdvancedJsonDetails
                      summary="Metadata"
                      badge="import metadata"
                      hint="Preserved jump import data stays tucked away here unless you need raw cleanup."
                    >
                      <JsonEditorField
                        label="Import source metadata"
                        value={draftJump.importSourceMetadata}
                        onValidChange={(value) =>
                          jumpAutosave.updateDraft({
                            ...draftJump,
                            importSourceMetadata:
                              typeof value === 'object' && value !== null && !Array.isArray(value)
                                ? (value as Record<string, unknown>)
                                : {},
                          })
                        }
                      />
                    </AdvancedJsonDetails>
                  ) : null}
                </>
              ) : (
                <p>No jumps match the current search.</p>
              )}
            </article>
          </section>
        </div>
      )}
    </div>
  );
}
