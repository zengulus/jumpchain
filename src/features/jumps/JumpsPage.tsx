import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { jumpStatuses, jumpTypes } from '../../domain/common';
import { db } from '../../db/database';
import { switchActiveJump } from '../../db/persistence';
import {
  ParticipationBudgetShellAttachment,
  ParticipationEditorCard,
  type ParticipationActor,
} from '../participation/ParticipationPage';
import { SearchHighlight } from '../search/SearchHighlight';
import { matchesSearchQuery, withSearchParams } from '../search/searchUtils';
import { createBlankJump, createBlankParticipation, saveChainRecord, saveParticipationRecord, syncJumpParticipantMembership } from '../workspace/records';
import {
  AdvancedJsonDetails,
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  JsonEditorField,
  PlainLanguageHint,
  SimpleModeAffirmation,
  SimpleModeGuideFrame,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { useWorkspaceHeaderAttachment, useWorkspacePresentation } from '../workspace/ChainWorkspaceLayout';
import {
  createBranchGuideScopeKey,
  createParticipationGuideKey,
  createSimpleModePageGuideState,
  getFirstIncompleteGuideStep,
  isJumpGuideStepComplete,
  markGuideStepAcknowledged,
  readGuideRequested,
  setGuideCurrentStep,
  setGuideDismissed,
  updateGuideSearchParams,
  type SimpleModePageGuideState,
} from '../workspace/simpleModeGuides';

type JumpWorkspaceTab = 'basics' | 'party' | 'purchases' | 'advanced';
type JumpGuidedStage = Extract<JumpWorkspaceTab, 'basics' | 'party' | 'purchases'>;
type JumpParticipantEntry = ParticipationActor & {
  detail: string;
};
type WorkspaceParticipation = ReturnType<typeof useChainWorkspace>['workspace']['participations'][number];

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

function formatParticipantDetail(
  participant: JumpParticipantEntry,
) {
  return participant.detail.trim().length > 0 ? participant.detail : participant.kind === 'companion' ? 'Companion record' : 'Jumper record';
}

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

export function JumpsPage() {
  const navigate = useNavigate();
  const { jumpId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { simpleMode, getBranchGuideState, updateBranchGuideState, updateOverviewGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [activeParticipationDraft, setActiveParticipationDraft] = useState<WorkspaceParticipation | null>(null);
  const searchQuery = searchParams.get('search') ?? '';
  const focusedParticipantId = searchParams.get('participant') ?? searchParams.get('jumper');
  const participationPanelRequested = searchParams.get('panel') === 'participation';
  const guideRequested = simpleMode && readGuideRequested(searchParams);
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
  const jumperNameById = new Map(workspace.jumpers.map((jumper) => [jumper.id, jumper.name]));
  const allParticipants: JumpParticipantEntry[] = [
    ...workspace.jumpers.map((jumper) => ({
      id: jumper.id,
      name: jumper.name,
      kind: 'jumper' as const,
      detail: jumper.isPrimary ? 'Primary jumper' : jumper.gender.trim() || 'Jumper record',
    })),
    ...workspace.companions.map((companion) => ({
      id: companion.id,
      name: companion.name,
      kind: 'companion' as const,
      detail: [companion.role.trim(), companion.parentJumperId ? `Attached to ${jumperNameById.get(companion.parentJumperId) ?? 'a jumper'}` : null]
        .filter((value): value is string => Boolean(value && value.length > 0))
        .join(' - '),
    })),
  ].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }

    return left.name.localeCompare(right.name);
  });
  const focusedParticipant =
    focusedParticipantId ? allParticipants.find((participant) => participant.id === focusedParticipantId) ?? null : null;
  const jumpParticipantIds = draftJump
    ? new Set([
        ...draftJump.participantJumperIds,
        ...workspace.participations
          .filter((participation) => participation.jumpId === draftJump.id && participation.participantKind === 'companion')
          .map((participation) => participation.participantId),
      ])
    : new Set<string>();
  const jumpParticipants =
    draftJump ? allParticipants.filter((participant) => jumpParticipantIds.has(participant.id)) : [];
  const pendingFocusedParticipant =
    draftJump && focusedParticipant && !jumpParticipantIds.has(focusedParticipant.id) ? focusedParticipant : null;
  const activeParticipationParticipant =
    draftJump && focusedParticipant && jumpParticipantIds.has(focusedParticipant.id)
      ? focusedParticipant
      : jumpParticipants[0] ?? null;
  const activeParticipation =
    draftJump && activeParticipationParticipant
      ? workspace.participations.find(
          (participation) => participation.jumpId === draftJump.id && participation.participantId === activeParticipationParticipant.id,
        ) ?? null
      : null;
  useEffect(() => {
    setActiveParticipationDraft(null);
  }, [activeParticipation?.id]);
  const { message: simpleAffirmation, showAffirmation, clearAffirmation } = useSimpleModeAffirmation();
  const [activeTab, setActiveTab] = useState<JumpWorkspaceTab>(participationPanelRequested ? 'purchases' : 'basics');
  const branchGuideScopeKey = workspace.activeBranch ? createBranchGuideScopeKey(chainId, workspace.activeBranch.id) : null;
  const selectedJumpGuideState =
    branchGuideScopeKey && selectedJump
      ? getBranchGuideState(branchGuideScopeKey, 'jumps', selectedJump.id)
      : createSimpleModePageGuideState('basics');
  const selectedJumpReviewState = Object.fromEntries(
    selectedJumpGuideState.acknowledgedStepIds
      .filter((stepId): stepId is JumpGuidedStage => JUMP_GUIDED_STAGES.some((stage) => stage.id === stepId))
      .map((stepId) => [stepId, true]),
  ) as Partial<Record<JumpGuidedStage, true>>;
  const currentJumpGuideStep = selectedJump
    ? (getFirstIncompleteGuideStep(
        JUMP_GUIDED_STAGES.map((stage) => stage.id),
        selectedJumpGuideState,
        (stepId) => isJumpGuideStepComplete(selectedJump, selectedJumpGuideState, stepId as JumpGuidedStage),
      ) as JumpGuidedStage | null)
    : null;
  const activeGuideVisible = simpleMode && guideRequested && Boolean(currentJumpGuideStep) && !selectedJumpGuideState.dismissed;
  const previousTabContextRef = useRef<{
    jumpId: string | undefined;
    simpleMode: boolean;
    participationPanelRequested: boolean;
  }>({
    jumpId: selectedJump?.id,
    simpleMode,
    participationPanelRequested,
  });
  const presentation = useMemo(
    () =>
      selectedJump
        ? {
            mode: 'deep-task' as const,
            showHeroStats: false,
            showQuickActions: false,
          }
        : {
            mode: 'editor' as const,
            showHeroStats: true,
            showQuickActions: false,
          },
    [selectedJump],
  );
  const hasJumpSearch = searchQuery.trim().length > 0;
  const showJumpChooser = workspace.jumps.length > 1 || hasJumpSearch || !selectedJump;
  const showJumpChooserCount = workspace.jumps.length > 1 && hasJumpSearch;
  const showJumpSearch = !activeGuideVisible && (workspace.jumps.length > 1 || hasJumpSearch || !selectedJump);
  const activeTabLabel = JUMP_WORKSPACE_TABS.find((tab) => tab.id === activeTab)?.label ?? 'Basics';
  const workspaceHeaderAttachment = useMemo(
    () =>
      selectedJump ? (
        <>
          <span className="pill pill--soft">{activeTabLabel}</span>
          {activeTab === 'purchases' && activeParticipationParticipant ? <span className="pill">{activeParticipationParticipant.name}</span> : null}
          <AutosaveStatusIndicator status={jumpAutosave.status} />
        </>
      ) : null,
    [activeParticipationParticipant, activeTab, activeTabLabel, jumpAutosave.status, selectedJump],
  );

  useWorkspacePresentation(presentation);
  useWorkspaceHeaderAttachment(workspaceHeaderAttachment);

  function getFirstIncompleteStage(reviewState: Partial<Record<JumpGuidedStage, true>>) {
    return JUMP_GUIDED_STAGES.find((stage) => !reviewState[stage.id])?.id ?? 'purchases';
  }

  function updateSelectedJumpGuideState(
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) {
    if (!branchGuideScopeKey || !selectedJump) {
      return;
    }

    updateBranchGuideState(branchGuideScopeKey, 'jumps', selectedJump.id, updater);
  }

  function markOverviewStepComplete(stepId: 'jumper' | 'jump' | 'participation', nextStepId: 'jump' | 'participation' | null) {
    if (!branchGuideScopeKey) {
      return;
    }

    updateOverviewGuideState(branchGuideScopeKey, (current) =>
      setGuideCurrentStep(markGuideStepAcknowledged(setGuideDismissed(current, false), stepId), nextStepId),
    );
  }

  function setGuideRequested(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  function handleJumpGuideStepChange(nextStepId: JumpGuidedStage) {
    updateSelectedJumpGuideState((current) => setGuideCurrentStep(current, nextStepId));
    handleTabChange(nextStepId, { preserveAffirmation: true });
  }

  function ensureParticipationGuideState(nextJumpId: string, participantId: string) {
    if (!branchGuideScopeKey) {
      return;
    }

    updateBranchGuideState(
      branchGuideScopeKey,
      'participation',
      createParticipationGuideKey(nextJumpId, participantId),
      (current) => (current.updatedAt ? current : createSimpleModePageGuideState('beginnings')),
    );
  }

  useEffect(() => {
    const previousContext = previousTabContextRef.current;
    const jumpChanged = previousContext.jumpId !== selectedJump?.id;
    const modeChanged = previousContext.simpleMode !== simpleMode;
    const purchasesPanelOpened = !previousContext.participationPanelRequested && participationPanelRequested;

    if (jumpChanged || modeChanged) {
      if (simpleMode) {
        setActiveTab(
          participationPanelRequested ? 'purchases' : getFirstIncompleteStage(selectedJumpReviewState),
        );
      } else {
        setActiveTab(participationPanelRequested ? 'purchases' : 'basics');
      }
    } else if (purchasesPanelOpened) {
      setActiveTab('purchases');
    }

    previousTabContextRef.current = {
      jumpId: selectedJump?.id,
      simpleMode,
      participationPanelRequested,
    };
  }, [selectedJump?.id, participationPanelRequested, selectedJumpReviewState, simpleMode]);

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

    updateSelectedJumpGuideState((current) => {
      const nextState = markGuideStepAcknowledged(current, stage);

      if (stage === 'purchases') {
        return setGuideDismissed(setGuideCurrentStep(nextState, 'purchases'), true);
      }

      return setGuideCurrentStep(nextState, stage === 'basics' ? 'party' : 'purchases');
    });

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

    markOverviewStepComplete('jump', 'participation');
    showAffirmation('This jump has a workable purchase pass. Next, the participation setup can take over below.');
    handleTabChange('purchases', { preserveAffirmation: true });
  }

  function setFocusedParticipant(nextParticipantId: string | null) {
    updateQuery((nextParams) => {
      if (nextParticipantId && nextParticipantId.trim().length > 0) {
        nextParams.set('participant', nextParticipantId);
      } else {
        nextParams.delete('participant');
      }
      nextParams.delete('jumper');

      if (activeTab === 'purchases' || participationPanelRequested) {
        nextParams.set('panel', 'participation');
      }
    });
  }

  function getJumpPath(nextJumpId: string) {
    return withSearchParams(`/chains/${chainId}/jumps/${nextJumpId}`, {
      search: searchQuery,
      participant: focusedParticipantId,
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

      if (simpleMode && branchGuideScopeKey) {
        updateBranchGuideState(branchGuideScopeKey, 'jumps', jump.id, () => createSimpleModePageGuideState('basics'));
      }

      navigate(
        withSearchParams(`/chains/${chainId}/jumps/${jump.id}`, {
          search: searchQuery,
          guide: simpleMode ? '1' : null,
        }),
      );
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

  async function toggleParticipant(participantId: string) {
    const targetJump = draftJump ?? selectedJump;
    const participant = allParticipants.find((entry) => entry.id === participantId) ?? null;

    if (!targetJump || !participant) {
      return;
    }

    const currentParticipantIds = jumpParticipants.map((entry) => entry.id);
    const alreadyParticipating = currentParticipantIds.includes(participantId);
    const nextParticipantIds = alreadyParticipating
      ? currentParticipantIds.filter((id) => id !== participantId)
      : Array.from(new Set([...currentParticipantIds, participantId]));

    if (participant.kind === 'jumper') {
      const nextJumperIds = alreadyParticipating
        ? targetJump.participantJumperIds.filter((id) => id !== participantId)
        : Array.from(new Set([...targetJump.participantJumperIds, participantId]));

      jumpAutosave.updateDraft({
        ...targetJump,
        participantJumperIds: nextJumperIds,
      });
    }

    try {
      await syncJumpParticipantMembership(chainId, targetJump, participantId, participant.kind, !alreadyParticipating);

      if (alreadyParticipating && focusedParticipantId === participantId) {
        setFocusedParticipant(nextParticipantIds[0] ?? null);
      } else if (!alreadyParticipating && !simpleMode) {
        setActiveTab('purchases');
        updateQuery((nextParams) => {
          nextParams.set('participant', participantId);
          nextParams.delete('jumper');
          nextParams.set('panel', 'participation');
        });
      } else if (!alreadyParticipating) {
        ensureParticipationGuideState(targetJump.id, participantId);
        setGuideRequested(true);
        handleTabChange('purchases', { preserveAffirmation: true });
        setFocusedParticipant(participantId);
      }

      setNotice({
        tone: 'success',
        message: alreadyParticipating
          ? 'Removed this participant from the jump and cleaned up the purchases record.'
          : 'Updated jump participants and their records.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to update jump participants.',
      });
    }
  }

  async function ensureParticipation(participantId: string) {
    const targetJump = draftJump ?? selectedJump;
    const participant = allParticipants.find((entry) => entry.id === participantId) ?? null;

    if (!workspace.activeBranch || !targetJump || !participant) {
      return;
    }

    const existing = workspace.participations.find(
      (participation) => participation.jumpId === targetJump.id && participation.participantId === participantId,
    );

    if (existing) {
      if (simpleMode) {
        ensureParticipationGuideState(targetJump.id, participantId);
        setGuideRequested(true);
      }
      handleTabChange('purchases');
      updateQuery((nextParams) => {
        nextParams.set('participant', participantId);
        nextParams.delete('jumper');
      });
      return;
    }

    try {
      await saveParticipationRecord(
        createBlankParticipation(chainId, workspace.activeBranch.id, targetJump.id, {
          participantId,
          participantKind: participant.kind,
        }),
      );

      if (participant.kind === 'jumper' && !targetJump.participantJumperIds.includes(participantId)) {
        const nextParticipantIds = [...targetJump.participantJumperIds, participantId];

        jumpAutosave.updateDraft({
          ...targetJump,
          participantJumperIds: nextParticipantIds,
        });

        await saveChainRecord(db.jumps, {
          ...targetJump,
          participantJumperIds: nextParticipantIds,
        });
      }

      if (simpleMode) {
        ensureParticipationGuideState(targetJump.id, participantId);
        setGuideRequested(true);
      }
      handleTabChange('purchases');
      updateQuery((nextParams) => {
        nextParams.set('participant', participantId);
        nextParams.delete('jumper');
      });
      setNotice({
        tone: 'success',
        message: 'Created a participation and purchases record for this participant.',
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

    if (allParticipants.length === 0) {
      return <p>No jumpers or companions yet.</p>;
    }

    return (
      <div className="stack stack--compact">
        <section className="editor-section">
          <div className="editor-section__header">
            <div className="stack stack--compact">
              <h4>Participants in this jump</h4>
              <PlainLanguageHint term="Party" meaning="the jumpers and companions taking part in this jump." />
            </div>
            <span className="pill">{jumpParticipants.length}</span>
          </div>

          <div className="selection-editor-list">
            {allParticipants.map((participant) => {
              const isParticipating = jumpParticipantIds.has(participant.id);
              const isFocused = focusedParticipantId === participant.id;

              return (
                <div className="selection-editor" key={participant.id}>
                  <div className="selection-editor__header">
                    <div className="stack stack--compact">
                      <strong>{participant.name}</strong>
                      <div className="inline-meta">
                        <span className="pill pill--soft">{participant.kind}</span>
                        <span className="pill">{isParticipating ? 'Participating' : 'Not in jump'}</span>
                        {isFocused ? <span className="pill">Current focus</span> : null}
                      </div>
                      <p className="editor-section__copy">{formatParticipantDetail(participant)}</p>
                    </div>
                    <div className="actions">
                      {isParticipating ? (
                        <button className="button button--secondary" type="button" onClick={() => setFocusedParticipant(participant.id)}>
                          Focus
                        </button>
                      ) : null}
                      <button className="button" type="button" onClick={() => void toggleParticipant(participant.id)}>
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

    if (allParticipants.length === 0) {
      return <p>No jumpers or companions yet.</p>;
    }

    if (jumpParticipants.length === 0) {
      return (
        <article className="card editor-sheet stack">
          <div className="section-heading">
            <h3>No participants yet</h3>
            <span className="pill">Start in Party</span>
          </div>
          <p>Add at least one jumper or companion to this jump before editing purchases.</p>
          <div className="actions">
            <button className="button" type="button" onClick={() => handleTabChange('party')}>
              Open Party
            </button>
          </div>
        </article>
      );
    }

    const purchaseEditor = activeParticipationParticipant && activeParticipation ? (
      <ParticipationEditorCard
        jump={draftJump}
        participant={activeParticipationParticipant}
        participation={activeParticipation}
        workspace={workspace}
        showBudgetSummary={false}
        showBudgetHeader
        onDraftChange={setActiveParticipationDraft}
      />
    ) : activeParticipationParticipant ? (
      <article className="card editor-sheet stack">
        <div className="section-heading">
          <h3>{activeParticipationParticipant.name}</h3>
          <span className="pill pill--soft">record missing</span>
        </div>
        <p>{activeParticipationParticipant.name} is participating, but the record is missing.</p>
        <div className="actions">
          <button className="button" type="button" onClick={() => void ensureParticipation(activeParticipationParticipant.id)}>
            Create Record
          </button>
        </div>
      </article>
    ) : null;
    const budgetAttachment =
      !simpleMode && activeParticipationParticipant && activeParticipation ? (
        <aside className="jump-budget-rail">
          <ParticipationBudgetShellAttachment
            jump={draftJump}
            participant={activeParticipationParticipant}
            participation={activeParticipationDraft ?? activeParticipation}
            workspace={workspace}
          />
        </aside>
      ) : null;
    const purchaseWorkspace = budgetAttachment ? (
      <section className="jump-workspace jump-workspace--with-rail">
        <div className="stack stack--compact">{purchaseEditor}</div>
        {budgetAttachment}
      </section>
    ) : (
      purchaseEditor
    );

    const showParticipantRail = !simpleMode && (jumpParticipants.length > 1 || pendingFocusedParticipant);
    const participantSelector = jumpParticipants.length > 1 ? (
      <div className={showParticipantRail ? 'selection-list' : 'chip-grid'}>
        {jumpParticipants.map((participant) =>
          showParticipantRail ? (
            <button
              className={`selection-list__item${activeParticipationParticipant?.id === participant.id ? ' is-active' : ''}`}
              type="button"
              key={participant.id}
              onClick={() => setFocusedParticipant(participant.id)}
            >
              <strong>{participant.name}</strong>
              <span>{activeParticipationParticipant?.id === participant.id ? 'Current editor' : 'Open purchases'}</span>
            </button>
          ) : (
            <button
              className={`choice-chip${activeParticipationParticipant?.id === participant.id ? ' is-active' : ''}`}
              type="button"
              key={participant.id}
              onClick={() => setFocusedParticipant(participant.id)}
            >
              <span>{participant.name}</span>
            </button>
          ),
        )}
      </div>
    ) : null;

    return (
      <div className="stack stack--compact">
        {showParticipantRail ? (
          <section className="workspace-two-column">
            <aside className="card stack">
              <div className="section-heading">
                <h3>Participants</h3>
                <span className="pill">{jumpParticipants.length} in jump</span>
              </div>
              {participantSelector}
              {pendingFocusedParticipant ? (
                <div className="jump-focus-callout">
                  <strong>{pendingFocusedParticipant.name} is not in this jump yet.</strong>
                  <div className="actions">
                    <button className="button" type="button" onClick={() => void ensureParticipation(pendingFocusedParticipant.id)}>
                      Add {pendingFocusedParticipant.name} To This Jump
                    </button>
                  </div>
                </div>
              ) : null}
            </aside>

            <div className="stack stack--compact">{purchaseWorkspace}</div>
          </section>
        ) : (
          <>
            {participantSelector || pendingFocusedParticipant ? (
              <section className="section-surface stack stack--compact">
                {participantSelector}
                {pendingFocusedParticipant ? (
                  <div className="jump-focus-callout">
                    <strong>{pendingFocusedParticipant.name} is not in this jump yet.</strong>
                    <div className="actions">
                      <button className="button" type="button" onClick={() => void ensureParticipation(pendingFocusedParticipant.id)}>
                        Add {pendingFocusedParticipant.name} To This Jump
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {purchaseWorkspace}
          </>
        )}

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
      {simpleMode || !selectedJump ? (
        <WorkspaceModuleHeader
          title="Jumps"
          description={
            simpleMode
              ? 'Select a jump and edit its basics, party, or purchases.'
              : 'Edit one jump at a time with fast access to basics, party, purchases, and metadata.'
          }
          badge={`${workspace.jumps.length} total`}
          actions={activeGuideVisible ? undefined : (
            <button className="button" type="button" onClick={() => void handleAddJump()}>
              Add Jump
            </button>
          )}
        />
      ) : null}

      <StatusNoticeBanner notice={notice} />
      {selectedJump ? null : <AutosaveStatusIndicator status={jumpAutosave.status} />}

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
          {showJumpChooser ? (
            <section className="card stack jump-switcher">
              <div className="section-heading">
                <h3>Choose jump</h3>
                {showJumpChooserCount ? <span className="pill">{filteredJumps.length} shown</span> : null}
              </div>

              {showJumpSearch ? (
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
              ) : null}

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
          ) : null}

          <section className="jump-workspace">
            <article className="card stack jump-editor-shell">
              {draftJump ? (
                <>
                  {simpleMode ? (
                    <div className="section-heading">
                      <div className="stack stack--compact">
                        <h3>
                          <SearchHighlight text={draftJump.title} query={searchQuery} />
                        </h3>
                        <div className="inline-meta">
                          <span className="pill">{draftJump.status}</span>
                          <span className="pill">{draftJump.jumpType}</span>
                          {activeTab === 'purchases' ? null : <span className="pill">{jumpParticipants.length} participating</span>}
                        </div>
                      </div>
                      <div className="actions">
                        {simpleMode && !activeGuideVisible && activeTab !== 'purchases' ? (
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => {
                              if (!currentJumpGuideStep) {
                                return;
                              }

                              updateSelectedJumpGuideState((current) => setGuideCurrentStep(setGuideDismissed(current, false), currentJumpGuideStep));
                              setGuideRequested(true);
                            }}
                          >
                            {guideRequested && !selectedJumpGuideState.dismissed ? 'Guide Open' : 'Reopen Jump Setup'}
                          </button>
                        ) : null}
                        {!activeGuideVisible && workspace.currentJump?.id === draftJump.id ? (
                          <span className="pill">Current jump</span>
                        ) : !activeGuideVisible ? (
                          <button className="button button--secondary" type="button" onClick={() => void handleMakeCurrentJump()}>
                            Make Current Jump
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="jump-editor-toolbar">
                      <div className="inline-meta">
                        <span className="pill">{draftJump.status}</span>
                        <span className="pill">{draftJump.jumpType}</span>
                        {activeTab === 'purchases' ? null : <span className="pill">{jumpParticipants.length} participating</span>}
                        {workspace.currentJump?.id === draftJump.id ? <span className="pill pill--soft">Current jump</span> : null}
                      </div>
                      <div className="actions">
                        <button className="button button--secondary" type="button" onClick={() => void handleAddJump()}>
                          Add Jump
                        </button>
                        {workspace.currentJump?.id === draftJump.id ? null : (
                          <button className="button button--secondary" type="button" onClick={() => void handleMakeCurrentJump()}>
                            Make Current Jump
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {simpleMode ? (
                    <>
                      {activeGuideVisible ? (
                        <SimpleModeGuideFrame
                          title={`${draftJump.title} setup`}
                          steps={JUMP_GUIDED_STAGES.map((stage) => ({
                            id: stage.id,
                            label: stage.label,
                            description:
                              stage.id === 'basics'
                                ? 'Set the jump basics first so the rest of the branch has a stable target.'
                                : stage.id === 'party'
                                  ? 'Choose who is actually in this jump before opening the purchases editor.'
                                  : 'Use the purchases pass below to review the active participant and the jump-level setup.'
                          }))}
                          currentStepId={currentJumpGuideStep!}
                          acknowledgedStepIds={selectedJumpGuideState.acknowledgedStepIds}
                          onStepChange={(stepId) => handleJumpGuideStepChange(stepId as JumpGuidedStage)}
                          onDismiss={() => {
                            updateSelectedJumpGuideState((current) => setGuideDismissed(current, true));
                            setGuideRequested(false);
                          }}
                        >
                          <div className="actions">
                            {currentJumpGuideStep !== 'basics' ? (
                              <button
                                className="button button--secondary"
                                type="button"
                                onClick={() =>
                                  handleJumpGuideStepChange(currentJumpGuideStep! === 'purchases' ? 'party' : 'basics')
                                }
                              >
                                Back
                              </button>
                            ) : null}
                            <button className="button" type="button" onClick={() => markSimpleStageComplete(currentJumpGuideStep!)}>
                              {currentJumpGuideStep === 'purchases' ? 'Continue to Participation' : 'Continue'}
                            </button>
                          </div>
                        </SimpleModeGuideFrame>
                      ) : null}
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
