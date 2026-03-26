import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { db } from '../../db/database';
import { jumpStatuses, jumpTypes } from '../../domain/common';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import { switchActiveBranch, switchActiveJump } from '../../db/persistence';
import { IconicEditor } from '../bodymod/IconicEditor';
import { personalRealityCoreModes, personalRealityExtraModes, type PersonalRealityExtraModeId } from '../personal-reality/catalog';
import {
  createDefaultPersonalRealityState,
  readPersonalRealityState,
  writePersonalRealityState,
  type PersonalRealityState,
} from '../personal-reality/model';
import {
  createBlankBodymodProfile,
  createBlankJump,
  createBlankJumper,
  saveChainEntity,
  saveChainRecord,
  syncJumpParticipantMembership,
} from '../workspace/records';
import { AssistiveHint, AutosaveStatusIndicator, StatusNoticeBanner, TooltipFrame, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { mergeAutosaveStatuses, useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

type OverviewStepTone = 'ready' | 'attention' | 'blocked';

interface OverviewStepAction {
  kind: 'link' | 'button';
  label: string;
  to?: string;
  onClick?: () => Promise<void> | void;
}

interface OverviewSetupStep {
  id: string;
  title: string;
  description: string;
  context?: string;
  tone: OverviewStepTone;
  primaryAction: OverviewStepAction;
}

type SimpleSetupWizardStepId =
  | 'create-jumper'
  | 'jumper-name'
  | 'jumper-gender'
  | 'jumper-age'
  | 'jumper-notes'
  | 'create-jump'
  | 'jump-title'
  | 'jump-status'
  | 'jump-type'
  | 'jump-duration'
  | 'iconic-prompt'
  | 'personal-reality-prompt'
  | 'iconic-setup'
  | 'personal-reality-setup'
  | 'complete';

interface SimpleSetupWizardStep {
  id: SimpleSetupWizardStepId;
  title: string;
  description: string;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatCountLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function joinHelpText(...parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(' ');
}

function getStepStatusLabel(tone: OverviewStepTone) {
  switch (tone) {
    case 'ready':
      return 'Ready';
    case 'attention':
      return 'Needs setup';
    default:
      return 'Waiting';
  }
}

function getStepPillClassName(tone: OverviewStepTone) {
  switch (tone) {
    case 'ready':
      return 'pill pill--success';
    case 'attention':
      return 'pill pill--warning';
    default:
      return 'pill pill--muted';
  }
}

function getLatestJump<T extends { orderIndex: number; createdAt: string }>(jumps: T[]) {
  const orderedJumps = jumps
    .slice()
    .sort((left, right) => {
      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });

  return orderedJumps.length > 0 ? orderedJumps[orderedJumps.length - 1] : null;
}

export function ChainOverviewPage() {
  const { chainId, bundle, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const { simpleMode, getSimpleModeWizardState, updateSimpleModeWizardState } = useUiPreferences();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [simpleWizardStepId, setSimpleWizardStepId] = useState<SimpleSetupWizardStepId | null>(null);
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const simpleModeWizardKey = workspace.activeBranch ? `${chainId}:${workspace.activeBranch.id}` : chainId;
  const simpleModeWizardState = getSimpleModeWizardState(simpleModeWizardKey);
  const latestSnapshot = workspace.snapshots.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const hasJumpers = workspace.jumpers.length > 0;
  const hasJumps = workspace.jumps.length > 0;
  const currentJump = workspace.currentJump;
  const completedJumpCountFromChain = workspace.jumps.filter((jump) => jump.status === 'completed').length;
  const selectedJumper =
    workspace.jumpers.find((jumper) => jumper.id === searchParams.get('jumper')) ??
    workspace.jumpers[0] ??
    null;
  const selectedJumperId = selectedJumper?.id ?? '';
  const selectedIconicProfile = selectedJumper
    ? workspace.bodymodProfiles.find((profile) => profile.jumperId === selectedJumper.id) ?? null
    : null;
  const firstJump = workspace.jumps[0] ?? null;
  const latestJump = getLatestJump(workspace.jumps);
  const hasUnguidedJump = workspace.jumps.length > simpleModeWizardState.guidedJumpCount;
  const wizardJump =
    (hasUnguidedJump ? latestJump : null) ??
    workspace.jumps.find((jump) => jump.id === searchParams.get('jump')) ??
    currentJump ??
    latestJump ??
    null;
  const selectedParticipation =
    currentJump && selectedJumper
      ? workspace.participations.find((participation) => participation.jumpId === currentJump.id && participation.jumperId === selectedJumper.id) ?? null
      : null;
  const jumperAutosave = useAutosaveRecord(selectedJumper, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumpers, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save simple-mode jumper changes.'),
  });
  const iconicAutosave = useAutosaveRecord(selectedIconicProfile, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.bodymodProfiles, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save simple-mode Iconic changes.'),
  });
  const chainAutosave = useAutosaveRecord(workspace.chain, {
    onSave: async (nextValue) => {
      await saveChainEntity(nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save simple-mode Personal Reality changes.'),
  });
  const jumpAutosave = useAutosaveRecord(wizardJump, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.jumps, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save simple-mode jump changes.'),
  });
  const draftJumper = jumperAutosave.draft ?? selectedJumper;
  const draftIconicProfile = iconicAutosave.draft ?? selectedIconicProfile;
  const draftChain = chainAutosave.draft ?? workspace.chain;
  const personalRealityState = draftChain ? readPersonalRealityState(draftChain) : createDefaultPersonalRealityState();
  const draftWizardJump = jumpAutosave.draft ?? wizardJump;
  const simpleWizardAutosaveStatus = mergeAutosaveStatuses([
    jumperAutosave.status,
    jumpAutosave.status,
    iconicAutosave.status,
    chainAutosave.status,
  ]);

  function buildSearch(nextJumperId = selectedJumperId) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextJumperId) {
      nextSearchParams.set('jumper', nextJumperId);
    } else {
      nextSearchParams.delete('jumper');
    }

    const nextSearch = nextSearchParams.toString();
    return nextSearch.length > 0 ? `?${nextSearch}` : '';
  }

  function handleWizardJumpFocusChange(nextJumpId: string | null) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (nextJumpId) {
        nextParams.set('jump', nextJumpId);
      } else {
        nextParams.delete('jump');
      }

      return nextParams;
    });
  }

  function getJumpEditorPath(nextJumpId?: string | null) {
    const jumpId = nextJumpId ?? currentJump?.id ?? workspace.jumps[0]?.id ?? null;

    if (!jumpId) {
      return `/chains/${chainId}/jumps`;
    }

    return `/chains/${chainId}/jumps/${jumpId}`;
  }

  function getBodymodPath(nextJumperId = selectedJumperId) {
    if (!selectedJumper) {
      return `/chains/${chainId}/jumpers`;
    }

    return `/chains/${chainId}/bodymod${buildSearch(nextJumperId)}`;
  }

  function getParticipationPath(nextJumperId = selectedJumperId) {
    if (!selectedJumper) {
      return `/chains/${chainId}/jumpers`;
    }

    if (!currentJump) {
      return `/chains/${chainId}/jumps`;
    }

    return `/chains/${chainId}/participation/${currentJump.id}${buildSearch(nextJumperId)}`;
  }

  function handleFocusedJumperChange(nextJumperId: string) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (nextJumperId) {
        nextParams.set('jumper', nextJumperId);
      } else {
        nextParams.delete('jumper');
      }

      return nextParams;
    });
  }

  async function handleCreateJumper() {
    if (!workspace.activeBranch) {
      return;
    }

    const jumper = createBlankJumper(chainId, workspace.activeBranch.id);

    try {
      await saveChainRecord(db.jumpers, jumper);
      handleFocusedJumperChange(jumper.id);
      setNotice({
        tone: 'success',
        message: 'Created a new jumper from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jumper from Overview.',
      });
    }
  }

  async function handleCreateJump() {
    if (!workspace.activeBranch) {
      return;
    }

    const jump = createBlankJump(chainId, workspace.activeBranch.id, workspace.jumps.length);

    try {
      await saveChainRecord(db.jumps, jump);

      if (!workspace.currentJump) {
        await switchActiveJump(chainId, jump.id);
      }

      handleWizardJumpFocusChange(jump.id);

      setNotice({
        tone: 'success',
        message: 'Created a new jump from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a jump from Overview.',
      });
    }
  }

  async function handleSetCurrentJump(nextJumpId: string) {
    try {
      await switchActiveJump(chainId, nextJumpId);
      setNotice({
        tone: 'success',
        message: 'Current jump updated from Overview.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to change the current jump from Overview.',
      });
    }
  }

  async function handleCreateIconic() {
    if (!workspace.activeBranch || !selectedJumper) {
      return;
    }

    try {
      await saveChainRecord(
        db.bodymodProfiles,
        createBlankBodymodProfile(chainId, workspace.activeBranch.id, selectedJumper.id),
      );
      setNotice({
        tone: 'success',
        message: `Created an Iconic profile for ${selectedJumper.name}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create an Iconic profile from Overview.',
      });
    }
  }

  async function handleCreateParticipation() {
    if (!currentJump || !selectedJumper) {
      return;
    }

    try {
      await syncJumpParticipantMembership(chainId, currentJump, selectedJumper.id, true);
      setNotice({
        tone: 'success',
        message: `Created a participation and purchases record for ${selectedJumper.name} in ${currentJump.title}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create a participation and purchases record from Overview.',
      });
    }
  }

  function updatePersonalRealityState(updater: (currentState: PersonalRealityState) => PersonalRealityState) {
    chainAutosave.updateDraft((currentChain) => {
      if (!currentChain) {
        return currentChain;
      }

      return writePersonalRealityState(currentChain, updater(readPersonalRealityState(currentChain)));
    });
  }

  function togglePersonalRealityExtraMode(extraModeId: PersonalRealityExtraModeId, checked: boolean) {
    updatePersonalRealityState((currentState) => ({
      ...currentState,
      extraModeIds: checked
        ? Array.from(new Set([...currentState.extraModeIds, extraModeId]))
        : currentState.extraModeIds.filter((entry) => entry !== extraModeId),
    }));
  }

  useEffect(() => {
    if (
      simpleModeWizardState.iconicDecision !== 'not-now' ||
      simpleModeWizardState.personalRealityDecision !== 'not-now' ||
      workspace.jumps.length <= simpleModeWizardState.lastSupplementPromptJumpCount
    ) {
      return;
    }

    updateSimpleModeWizardState(simpleModeWizardKey, (current) => {
      if (
        current.iconicDecision !== 'not-now' ||
        current.personalRealityDecision !== 'not-now' ||
        workspace.jumps.length <= current.lastSupplementPromptJumpCount
      ) {
        return current;
      }

      return {
        ...current,
        iconicDecision: 'undecided',
        personalRealityDecision: 'undecided',
        iconicGuideCompleted: false,
        personalRealityGuideCompleted: false,
      };
    });
  }, [
    simpleModeWizardKey,
    simpleModeWizardState.iconicDecision,
    simpleModeWizardState.lastSupplementPromptJumpCount,
    simpleModeWizardState.personalRealityDecision,
    updateSimpleModeWizardState,
    workspace.jumps.length,
  ]);

  function markJumperWizardComplete() {
    updateSimpleModeWizardState(simpleModeWizardKey, (current) => ({
      ...current,
      jumperWizardCompleted: true,
    }));
    setSimpleWizardStepId(null);
  }

  function markJumpWizardComplete() {
    updateSimpleModeWizardState(simpleModeWizardKey, (current) => ({
      ...current,
      guidedJumpCount: Math.max(current.guidedJumpCount, workspace.jumps.length),
    }));
    setSimpleWizardStepId(null);
  }

  function updateSupplementDecision(feature: 'iconic' | 'personalReality', decision: 'yes' | 'not-now' | 'skip-future') {
    updateSimpleModeWizardState(simpleModeWizardKey, (current) => {
      const nextState = {
        ...current,
        iconicDecision: feature === 'iconic' ? decision : current.iconicDecision,
        personalRealityDecision: feature === 'personalReality' ? decision : current.personalRealityDecision,
        iconicGuideCompleted: feature === 'iconic' && decision === 'yes' ? false : current.iconicGuideCompleted,
        personalRealityGuideCompleted:
          feature === 'personalReality' && decision === 'yes' ? false : current.personalRealityGuideCompleted,
      };

      if (nextState.iconicDecision === 'not-now' && nextState.personalRealityDecision === 'not-now') {
        return {
          ...nextState,
          lastSupplementPromptJumpCount: workspace.jumps.length,
        };
      }

      return nextState;
    });
    setSimpleWizardStepId(null);
  }

  function markSupplementGuideComplete(feature: 'iconic' | 'personalReality') {
    updateSimpleModeWizardState(simpleModeWizardKey, (current) => ({
      ...current,
      iconicGuideCompleted: feature === 'iconic' ? true : current.iconicGuideCompleted,
      personalRealityGuideCompleted: feature === 'personalReality' ? true : current.personalRealityGuideCompleted,
    }));
    setSimpleWizardStepId(null);
  }

  function setWizardPromptState(nextState: 'pending' | 'accepted' | 'dismissed') {
    updateSimpleModeWizardState(simpleModeWizardKey, (current) => ({
      ...current,
      wizardPromptState: nextState,
    }));
  }

  const simpleSetupWizardSteps: SimpleSetupWizardStep[] = [];

  if (!simpleModeWizardState.jumperWizardCompleted) {
    if (!draftJumper) {
      simpleSetupWizardSteps.push({
        id: 'create-jumper',
        title: 'Create your jumper',
        description: 'Start by making the jumper record this branch will follow.',
      });
    } else {
      simpleSetupWizardSteps.push(
        {
          id: 'jumper-name',
          title: 'Name your jumper',
          description: 'Give the main jumper a name the rest of the workspace can follow.',
        },
        {
          id: 'jumper-gender',
          title: 'Set identity basics',
          description: 'Record the gender or identity note you want visible in simple mode.',
        },
        {
          id: 'jumper-age',
          title: 'Set starting age',
          description: 'Track the original age if it matters for this chain. Leaving it blank is fine.',
        },
        {
          id: 'jumper-notes',
          title: 'Add a quick concept note',
          description: 'Capture the short reminder that will help future-you remember who this jumper is.',
        },
      );
    }
  }

  if (!hasJumps) {
    simpleSetupWizardSteps.push({
      id: 'create-jump',
      title: 'Create your first jump',
      description: 'Once a jump exists, participation and purchases, rules, and the rest of the workflow can attach to it.',
    });
  } else if (hasUnguidedJump && draftWizardJump) {
    simpleSetupWizardSteps.push(
      {
        id: 'jump-title',
        title: 'Name this jump',
        description: 'Start with the jump title you want to see everywhere else in the workspace.',
      },
      {
        id: 'jump-status',
        title: 'Pick the jump status',
        description: 'If planned is still right, keep it and continue.',
      },
      {
        id: 'jump-type',
        title: 'Pick the jump type',
        description: 'Choose the kind of jump this is before the deeper modules start assuming context.',
      },
      {
        id: 'jump-duration',
        title: 'Set the jump duration',
        description: 'Use the supplement or document default if you do not need anything unusual here.',
      },
    );
  }

  if (hasJumps && simpleModeWizardState.iconicDecision === 'undecided') {
    simpleSetupWizardSteps.push({
      id: 'iconic-prompt',
      title: 'Decide on Iconic',
      description: 'Iconic keeps a jumper recognisable through gauntlets, harsh restrictions, and setting changes.',
    });
  }

  if (hasJumps && simpleModeWizardState.personalRealityDecision === 'undecided') {
    simpleSetupWizardSteps.push({
      id: 'personal-reality-prompt',
      title: 'Decide on Personal Reality',
      description: 'Personal Reality is the warehouse-style supplement builder for long-term housing, utilities, and infrastructure.',
    });
  }

  if (hasJumps && simpleModeWizardState.iconicDecision === 'yes' && !simpleModeWizardState.iconicGuideCompleted) {
    simpleSetupWizardSteps.push({
      id: 'iconic-setup',
      title: 'Set up Iconic',
      description: 'Iconic is compact enough that simple mode can walk you through the whole setup right here.',
    });
  }

  if (hasJumps && simpleModeWizardState.personalRealityDecision === 'yes' && !simpleModeWizardState.personalRealityGuideCompleted) {
    simpleSetupWizardSteps.push({
      id: 'personal-reality-setup',
      title: 'Set up Personal Reality',
      description: 'You can make the first real Personal Reality setup decisions right here in the wizard.',
    });
  }

  if (simpleSetupWizardSteps.length === 0) {
    simpleSetupWizardSteps.push({
      id: 'complete',
      title: 'Simple setup is in good shape',
      description:
        simpleModeWizardState.iconicDecision === 'not-now' && simpleModeWizardState.personalRealityDecision === 'not-now'
          ? 'You passed on both supplements for now. If you add another jump later, simple mode will check back in.'
          : 'The main simple-mode setup steps are done. You can keep working from the cards below whenever you want.',
    });
  }

  const activeSimpleWizardStep =
    simpleSetupWizardSteps.find((step) => step.id === simpleWizardStepId) ??
    simpleSetupWizardSteps[0] ?? {
      id: 'complete',
      title: 'Simple setup is in good shape',
      description: 'The main simple-mode setup steps are done.',
    };
  const activeSimpleWizardStepIndex = Math.max(
    0,
    simpleSetupWizardSteps.findIndex((step) => step.id === activeSimpleWizardStep.id),
  );
  const hasPreviousSimpleWizardStep = activeSimpleWizardStepIndex > 0;
  const jumpPhaseStepIds = new Set<SimpleSetupWizardStepId>([
    'create-jump',
    'jump-title',
    'jump-status',
    'jump-type',
    'jump-duration',
  ]);
  const supplementPhaseStepIds = new Set<SimpleSetupWizardStepId>([
    'iconic-prompt',
    'personal-reality-prompt',
    'iconic-setup',
    'personal-reality-setup',
  ]);
  const firstJumpPhaseStepId = simpleSetupWizardSteps.find((step) => jumpPhaseStepIds.has(step.id))?.id ?? null;
  const firstSupplementPhaseStepId = simpleSetupWizardSteps.find((step) => supplementPhaseStepIds.has(step.id))?.id ?? null;
  const wizardNeedsAttention = activeSimpleWizardStep.id !== 'complete';
  const isFreshChainStart = workspace.jumpers.length === 0 && workspace.jumps.length === 0 && !simpleModeWizardState.jumperWizardCompleted;
  const showWizardWelcomePopover = simpleMode && simpleModeWizardState.wizardPromptState === 'pending' && isFreshChainStart;
  const showWizardWalkthroughPopover = simpleMode && simpleModeWizardState.wizardPromptState === 'accepted' && wizardNeedsAttention;
  const activeSimpleWizardAffirmation =
    activeSimpleWizardStep.id === 'complete'
      ? 'You made it through the guided setup. From here the workspace should feel much lighter.'
      : activeSimpleWizardStep.id === 'personal-reality-setup' && simpleModeWizardState.iconicGuideCompleted
        ? 'Nice work. Iconic is already squared away, so this is the last dense optional system in the walkthrough.'
        : activeSimpleWizardStep.id === firstSupplementPhaseStepId
          ? 'Nice work. The jump basics are in place, so now this is mostly about deciding how much extra guidance and infrastructure you want.'
          : activeSimpleWizardStep.id === firstJumpPhaseStepId && simpleModeWizardState.jumperWizardCompleted
            ? 'Nice work. Your jumper has enough shape now, and the next stretch is mostly mechanical setup.'
            : null;

  useEffect(() => {
    if (simpleSetupWizardSteps.some((step) => step.id === simpleWizardStepId)) {
      return;
    }

    setSimpleWizardStepId(simpleSetupWizardSteps[0]?.id ?? null);
  }, [simpleSetupWizardSteps, simpleWizardStepId]);

  function goToPreviousSimpleWizardStep() {
    const previousStep = simpleSetupWizardSteps[activeSimpleWizardStepIndex - 1];

    if (previousStep) {
      setSimpleWizardStepId(previousStep.id);
    }
  }

  function goToNextSimpleWizardStep() {
    const nextStep = simpleSetupWizardSteps[activeSimpleWizardStepIndex + 1];

    if (nextStep) {
      setSimpleWizardStepId(nextStep.id);
    }
  }

  const setupSteps: OverviewSetupStep[] = [
    {
      id: 'jumper',
      title: hasJumpers ? `Jumpers ready: ${formatCountLabel(workspace.jumpers.length, 'jumper')}` : 'Create your first jumper',
      description: hasJumpers
        ? `${selectedJumper?.name ?? 'Focused jumper'} is ready.`
        : 'Needed for character setup.',
      context: hasJumpers
        ? `Open ${selectedJumper?.name ?? 'the roster'} to keep identity, background, and concept notes aligned.`
        : 'Start with at least one jumper before worrying about Iconic or jump participation.',
      tone: hasJumpers ? 'ready' : 'attention',
      primaryAction: hasJumpers
        ? {
            kind: 'link',
            label: `Open ${selectedJumper?.name ?? 'Jumpers'}`,
            to: `/chains/${chainId}/jumpers${buildSearch(selectedJumperId)}`,
          }
        : {
            kind: 'button',
            label: 'Create First Jumper',
            onClick: () => handleCreateJumper(),
          },
    },
    {
      id: 'jump',
      title: hasJumps ? `Jumps ready: ${formatCountLabel(workspace.jumps.length, 'jump')}` : 'Create your first jump',
      description: hasJumps
        ? currentJump
          ? `${currentJump.title} is active.`
          : 'Jump list exists.'
        : 'Needed for jump-scoped editing.',
      context: hasJumps
        ? 'Open the jump editor to maintain order, status, and participant membership.'
        : 'Even a rough placeholder jump is enough to unlock the rest of the jump-specific workflow.',
      tone: hasJumps ? 'ready' : 'attention',
      primaryAction: hasJumps
        ? {
            kind: 'link',
            label: `Open ${currentJump?.title ?? 'Jumps'}`,
            to: getJumpEditorPath(),
          }
        : {
            kind: 'button',
            label: 'Create First Jump',
            onClick: () => handleCreateJump(),
          },
    },
    {
      id: 'current-jump',
      title: currentJump ? 'Current jump selected' : 'Choose the current jump',
      description: currentJump
        ? `${currentJump.title} is in play.`
        : hasJumps
          ? 'Set the jump in play.'
          : 'Blocked until a jump exists.',
      context: currentJump
        ? 'Use the selector in Active Context to switch focus without leaving Overview.'
        : hasJumps
          ? 'If you are mid-chain, choosing the current jump is usually the next control step after creating jumps.'
          : 'This stays blocked until at least one jump exists.',
      tone: currentJump ? 'ready' : hasJumps ? 'attention' : 'blocked',
      primaryAction: currentJump
        ? {
            kind: 'link',
            label: 'Switch or Review Current Jump',
            to: getJumpEditorPath(),
          }
        : firstJump && workspace.jumps.length === 1
          ? {
              kind: 'button',
              label: `Make ${firstJump.title} Current`,
              onClick: () => handleSetCurrentJump(firstJump.id),
            }
          : hasJumps
            ? {
                kind: 'link',
                label: 'Open Jumps',
                to: `/chains/${chainId}/jumps`,
              }
            : {
                kind: 'button',
                label: 'Create First Jump',
                onClick: () => handleCreateJump(),
              },
    },
    {
      id: 'iconic',
      title: selectedJumper ? `Iconic for ${selectedJumper.name}` : 'Create a jumper before Iconic',
      description: selectedJumper
        ? selectedIconicProfile
          ? 'Profile is ready.'
          : 'Focused jumper still needs Iconic.'
        : 'Blocked until a jumper exists.',
      context: selectedJumper
        ? selectedIconicProfile
          ? 'Open the profile to keep preserved concept selections aligned with the jumper.'
          : 'Once a jumper exists, this becomes a direct setup step instead of a floating chain-wide system.'
        : 'Add a jumper first, then the Iconic workflow will know who it belongs to.',
      tone: selectedIconicProfile ? 'ready' : selectedJumper ? 'attention' : 'blocked',
      primaryAction: selectedIconicProfile
        ? {
            kind: 'link',
            label: 'Open Iconic',
            to: getBodymodPath(),
          }
        : selectedJumper
          ? {
              kind: 'button',
              label: 'Create Iconic',
              onClick: () => handleCreateIconic(),
            }
          : {
              kind: 'button',
              label: 'Create First Jumper',
              onClick: () => handleCreateJumper(),
            },
    },
    {
      id: 'participation',
      title: selectedJumper && currentJump ? `${selectedJumper.name} @ ${currentJump.title}` : 'Wire participation and purchases',
      description: selectedJumper && currentJump
        ? selectedParticipation
          ? 'Participation and purchases are ready.'
          : 'Current jump record is missing.'
        : selectedJumper
          ? hasJumps
            ? 'Pick the current jump first.'
            : 'Create a jump first.'
          : 'Needs a jumper and jump.',
      context: selectedJumper && currentJump
        ? selectedParticipation
          ? 'Open the jump record to keep participation, purchases, imports, and narratives in sync.'
          : 'This is usually the last missing setup step before ordinary jump-by-jump editing feels smooth.'
        : 'This stays blocked until the chain has both a jumper focus and a current jump.',
      tone: selectedParticipation ? 'ready' : selectedJumper && currentJump ? 'attention' : 'blocked',
      primaryAction: selectedParticipation
        ? {
            kind: 'link',
            label: 'Open Participation and Purchases',
            to: getParticipationPath(),
          }
        : selectedJumper && currentJump
          ? {
              kind: 'button',
              label: 'Add Participation Record',
              onClick: () => handleCreateParticipation(),
            }
          : hasJumpers
            ? {
                kind: 'link',
                label: 'Choose Current Jump',
                to: `/chains/${chainId}/jumps`,
              }
            : {
                kind: 'button',
                label: 'Create First Jumper',
                onClick: () => handleCreateJumper(),
              },
    },
  ];

  const readyStepCount = setupSteps.filter((step) => step.tone === 'ready').length;
  const nextSetupStep =
    setupSteps.find((step) => step.tone === 'attention') ??
    setupSteps.find((step) => step.tone === 'blocked') ??
    null;

  const workSurfaceCards = [
    {
      id: 'jumpers',
      title: selectedJumper ? `Focused Jumper: ${selectedJumper.name}` : 'Jumpers',
      description: selectedJumper ? 'Roster and identity editing.' : 'Create the roster.',
      hint: selectedJumper
        ? 'Identity, background, and concept edits for the jumper currently driving Iconic and jump participation routes.'
        : 'Create and manage the chain’s character roster.',
      to: `/chains/${chainId}/jumpers${buildSearch(selectedJumperId)}`,
    },
    {
      id: 'jumps',
      title: currentJump ? `Current Jump: ${currentJump.title}` : 'Jumps',
      description: currentJump ? 'Jump record and order.' : 'Create or choose the jump in play.',
      hint: currentJump
        ? 'Ordering, duration, status, and jump-level context live here.'
        : 'Open the jump registry to create or choose the current jump.',
      to: getJumpEditorPath(),
    },
    {
      id: 'iconic',
      title: selectedJumper ? `Iconic: ${selectedJumper.name}` : 'Iconic',
      description: selectedJumper
        ? selectedIconicProfile
          ? 'Focused jumper profile.'
          : 'No profile yet.'
        : 'Needs a jumper.',
      hint: selectedJumper
        ? selectedIconicProfile
          ? 'The preserved concept sheet for the focused jumper.'
          : 'No Iconic profile exists yet for the focused jumper.'
        : 'Add a jumper first to unlock Iconic.',
      to: getBodymodPath(),
    },
    {
      id: 'participation',
      title: selectedJumper && currentJump ? `Participation & Purchases: ${selectedJumper.name}` : 'Participation & Purchases',
      description: selectedJumper && currentJump
        ? selectedParticipation
          ? 'Current jump record.'
          : 'Record not created yet.'
        : 'Needs jumper and jump.',
      hint: selectedJumper && currentJump
        ? selectedParticipation
          ? `Open ${selectedJumper.name}'s live record inside ${currentJump.title}.`
          : `Create ${selectedJumper.name}'s participation and purchases record inside ${currentJump.title}.`
        : 'Needs both a jumper focus and a current jump.',
      to: getParticipationPath(),
    },
    {
      id: 'personal-reality',
      title: 'Personal Reality',
      description: 'Supplement builder.',
      hint: 'Supplement budgeting, page-by-page purchases, and warehouse continuity.',
      to: `/chains/${chainId}/personal-reality`,
    },
    {
      id: 'rules',
      title: currentJump ? 'Current Jump Rules' : 'Chainwide Rules',
      description: currentJump ? 'Active access rules.' : 'Baseline rule defaults.',
      hint: currentJump
        ? 'Warehouse, powers, items, and supplement access for the active jump.'
        : 'Review baseline chain rules while the first jump is still being scaffolded.',
      to: currentJump ? `/chains/${chainId}/current-jump-rules` : `/chains/${chainId}/rules`,
    },
    {
      id: 'notes',
      title: 'Notes',
      description: 'Chain notes and reminders.',
      hint: 'Capture chain decisions, planning notes, and continuity reminders without leaving the workspace.',
      to: `/chains/${chainId}/notes`,
    },
    {
      id: 'recovery',
      title: 'Backups & Branches',
      description: 'Snapshots and branch tools.',
      hint: 'Snapshots, branch switching, exports, and restore controls.',
      to: `/chains/${chainId}/backups`,
    },
  ];
  const visibleWorkSurfaceCards = simpleMode
    ? simpleModeWizardState.personalRealityDecision === 'yes'
      ? [workSurfaceCards[0], workSurfaceCards[1], workSurfaceCards[2], workSurfaceCards[4]]
      : workSurfaceCards.slice(0, 3)
    : workSurfaceCards;

  async function handleBranchChange(branchId: string) {
    try {
      await switchActiveBranch(chainId, branchId);
      setNotice({
        tone: 'success',
        message: 'Active branch updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch branches.',
      });
    }
  }

  async function handleJumpChange(jumpId: string | null) {
    try {
      await switchActiveJump(chainId, jumpId);
      setNotice({
        tone: 'success',
        message: 'Current jump selection updated.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to switch the current jump.',
      });
    }
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Chain Overview"
        description="Setup dashboard for branch focus, current jump control, and the next chain actions that still matter."
        badge={`${readyStepCount}/${setupSteps.length} setup steps ready`}
        actions={
          <>
            <Link className="button button--secondary" to={`/chains/${chainId}/timeline`}>
              Open Timeline
            </Link>
            <Link className="button button--secondary" to={`/chains/${chainId}/backups`}>
              Backups & Branches
            </Link>
          </>
        }
      />

      <StatusNoticeBanner notice={notice} />

      {simpleMode ? (
        <section className="card stack">
          <div className="section-heading">
            <h3>Guided Setup</h3>
            <span className="pill">
              {showWizardWalkthroughPopover
                ? 'Wizard open'
                : wizardNeedsAttention
                  ? simpleModeWizardState.wizardPromptState === 'dismissed'
                    ? 'Paused'
                    : 'Ready'
                  : 'Caught up'}
            </span>
          </div>
          <p>
            {simpleModeWizardState.wizardPromptState === 'dismissed'
              ? 'The guided setup popover is hidden right now, but your progress is still there if you want it back.'
              : wizardNeedsAttention
                ? 'The setup wizard can walk you through the next fields and systems in a popover without leaving Overview.'
                : 'The guided setup is caught up. It will be ready again when a new jump needs walkthrough help.'}
          </p>
          <div className="actions">
            {wizardNeedsAttention ? (
              <button
                className="button"
                type="button"
                onClick={() => setWizardPromptState(isFreshChainStart ? 'pending' : 'accepted')}
              >
                {simpleModeWizardState.wizardPromptState === 'dismissed' ? 'Resume Wizard' : 'Open Wizard'}
              </button>
            ) : null}
            {simpleModeWizardState.wizardPromptState !== 'dismissed' ? (
              <button className="button button--secondary" type="button" onClick={() => setWizardPromptState('dismissed')}>
                Hide Wizard
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Setup Snapshot</h3>
            <span className="pill pill--soft">{workspace.branches.length} branches</span>
          </div>
          {simpleMode ? (
            <p>
              This branch currently has {formatCountLabel(workspace.jumpers.length, 'jumper')},{' '}
              {formatCountLabel(workspace.jumps.length, 'jump')}, and {formatCountLabel(workspace.snapshots.length, 'snapshot')}.
            </p>
          ) : (
            <div className="inline-meta">
              <span className="metric">
                <strong>{workspace.jumpers.length}</strong>
                Jumpers
              </span>
              <span className="metric">
                <strong>{workspace.companions.length}</strong>
                Companions
              </span>
              <span className="metric">
                <strong>{workspace.jumps.length}</strong>
                Jumps
              </span>
              <span className="metric">
                <strong>{workspace.bodymodProfiles.length}</strong>
                Iconic Profiles
              </span>
              <span className="metric">
                <strong>{workspace.participations.length}</strong>
                Participation Records
              </span>
              <span className="metric">
                <strong>{workspace.snapshots.length}</strong>
                Snapshots
              </span>
            </div>
          )}
          <TooltipFrame
            tooltip={
              !simpleMode
                ? nextSetupStep
                  ? joinHelpText(nextSetupStep.description, nextSetupStep.context)
                  : 'Jumpers, jumps, current jump focus, Iconic, and participation and purchases are all represented for the current context.'
                : undefined
            }
          >
            <div className="stack stack--compact">
              <div className="guidance-strip guidance-strip--accent">
                <strong>{nextSetupStep ? `Next: ${nextSetupStep.title}` : 'Core setup is ready.'}</strong>
              </div>
              {simpleMode ? (
                <AssistiveHint
                  as="p"
                  text={
                    nextSetupStep
                      ? joinHelpText(nextSetupStep.description, nextSetupStep.context)
                      : 'Jumpers, jumps, current jump focus, Iconic, and participation and purchases are all represented for the current context.'
                  }
                  triggerLabel="Explain next setup step"
                />
              ) : null}
            </div>
          </TooltipFrame>
          {!simpleMode ? (
            <>
              <p>
                Native format <strong>{bundle.chain.formatVersion}</strong> | updated {formatTimestamp(bundle.chain.updatedAt)}
              </p>
              <p>
                Narratives: <strong>{bundle.chain.chainSettings.narratives}</strong> | Alt forms:{' '}
                <strong>{bundle.chain.chainSettings.altForms ? 'enabled' : 'disabled'}</strong> | Bank:{' '}
                <strong>{bundle.chain.bankSettings.enabled ? 'enabled' : 'disabled'}</strong>
              </p>
            </>
          ) : null}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Active Context</h3>
            <span className="pill">{workspace.activeBranch?.title ?? 'No branch'}</span>
          </div>
          <label className="field">
            <span className="field-label-row">
              <span>Active branch</span>
              <AssistiveHint
                text="Switching branches updates the entire workspace focus, including timeline, notes, and snapshots."
                triggerLabel="Explain active branch"
              />
            </span>
            <select
              value={workspace.activeBranch?.id ?? ''}
              onChange={(event) => void handleBranchChange(event.target.value)}
            >
              {workspace.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label-row">
              <span>Focused jumper</span>
              <AssistiveHint
                text={
                  selectedJumper
                    ? `Iconic and participation and purchases setup will follow ${selectedJumper.name}.`
                    : 'Create the first jumper to unlock jumper-specific setup work.'
                }
                triggerLabel="Explain focused jumper"
              />
            </span>
            <select value={selectedJumperId} onChange={(event) => handleFocusedJumperChange(event.target.value)} disabled={!hasJumpers}>
              {hasJumpers ? (
                workspace.jumpers.map((jumper) => (
                  <option key={jumper.id} value={jumper.id}>
                    {jumper.name}
                  </option>
                ))
              ) : (
                <option value="">Create a jumper first</option>
              )}
            </select>
          </label>
          <label className="field">
            <span className="field-label-row">
              <span>Current jump</span>
              <AssistiveHint
                text={
                  currentJump
                    ? `${currentJump.title} is the active jump for rules, participation and purchases, and overview summaries.`
                    : hasJumps
                      ? 'Pick which jump is currently in play so the rest of the workspace can follow it.'
                      : 'Create the first jump to unlock current-jump workflows.'
                }
                triggerLabel="Explain current jump"
              />
            </span>
            <select
              value={workspace.currentJump?.id ?? ''}
              onChange={(event) => void handleJumpChange(event.target.value || null)}
              disabled={!hasJumps}
            >
              <option value="">{hasJumps ? 'No current jump' : 'Create a jump first'}</option>
              {workspace.jumps.map((jump) => (
                <option key={jump.id} value={jump.id}>
                  {jump.orderIndex + 1}. {jump.title}
                </option>
              ))}
            </select>
          </label>
        </article>
      </section>

      {simpleMode ? (
        <>
          {showWizardWelcomePopover ? (
            <div className="simple-setup-popover-backdrop" role="presentation">
              <section
                className="card stack simple-setup-popover"
                role="dialog"
                aria-modal="true"
                aria-labelledby="simple-setup-welcome-title"
              >
                <div className="section-heading">
                  <h3 id="simple-setup-welcome-title">Guided Setup</h3>
                  <span className="pill pill--soft">Welcome</span>
                </div>
                <div className="guidance-strip guidance-strip--accent">
                  <strong>Congratulations on starting your first chain!</strong>
                  <p>Do you want to use the wizard to set things up easily?</p>
                </div>
                <p>
                  It will walk you through your jumper, your jump, and the optional Iconic and Personal Reality systems one
                  step at a time.
                </p>
                <div className="actions">
                  <button className="button" type="button" onClick={() => setWizardPromptState('accepted')}>
                    Yes, Guide Me
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setWizardPromptState('dismissed')}>
                    No Thanks
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {showWizardWalkthroughPopover ? (
            <div className="simple-setup-popover-backdrop" role="presentation">
              <section
                className="card stack simple-setup-popover"
                role="dialog"
                aria-modal="true"
                aria-labelledby="simple-setup-wizard-title"
              >
                <div className="section-heading">
                  <h3 id="simple-setup-wizard-title">Simple Setup Wizard</h3>
                  <div className="actions">
                    <span className="pill">
                      Step {activeSimpleWizardStepIndex + 1} of {simpleSetupWizardSteps.length}
                    </span>
                    <button className="button button--secondary" type="button" onClick={() => setWizardPromptState('dismissed')}>
                      Pause Wizard
                    </button>
                  </div>
                </div>

                <div className="guidance-strip guidance-strip--accent">
                  <strong>{activeSimpleWizardStep.title}</strong>
                  <p>{activeSimpleWizardStep.description}</p>
                </div>

                <AutosaveStatusIndicator status={simpleWizardAutosaveStatus} />

                <div className="inline-meta">
                  <span className="pill pill--soft">{draftJumper?.name ?? 'No jumper yet'}</span>
                  <span className="pill pill--soft">{draftWizardJump?.title ?? 'No jump yet'}</span>
                </div>

          {activeSimpleWizardStep.id === 'create-jumper' ? (
            <div className="selection-editor">
              <p>Create the jumper record first, then the wizard will walk you through the important fields one at a time.</p>
              <div className="actions">
                <button className="button" type="button" onClick={() => void handleCreateJumper()}>
                  Create Jumper
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jumper-name' && draftJumper ? (
            <div className="selection-editor">
              <label className="field">
                <span>Name</span>
                <input
                  autoFocus
                  value={draftJumper.name}
                  onChange={(event) =>
                    jumperAutosave.updateDraft({
                      ...draftJumper,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumperWizardComplete}>
                  Jumper Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jumper-gender' && draftJumper ? (
            <div className="selection-editor">
              <label className="field">
                <span>Gender</span>
                <input
                  autoFocus
                  value={draftJumper.gender}
                  onChange={(event) =>
                    jumperAutosave.updateDraft({
                      ...draftJumper,
                      gender: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={draftJumper.isPrimary}
                  onChange={(event) =>
                    jumperAutosave.updateDraft({
                      ...draftJumper,
                      isPrimary: event.target.checked,
                    })
                  }
                />
                <span>Primary jumper</span>
              </label>
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumperWizardComplete}>
                  Jumper Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jumper-age' && draftJumper ? (
            <div className="selection-editor">
              <label className="field">
                <span>Original age</span>
                <input
                  autoFocus
                  type="number"
                  value={draftJumper.originalAge ?? ''}
                  onChange={(event) =>
                    jumperAutosave.updateDraft({
                      ...draftJumper,
                      originalAge: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
              <AssistiveHint
                as="p"
                text="Blank is okay here if age is not something you care about tracking."
                triggerLabel="Explain original age"
              />
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumperWizardComplete}>
                  Jumper Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jumper-notes' && draftJumper ? (
            <div className="selection-editor">
              <label className="field">
                <span>Notes</span>
                <textarea
                  autoFocus
                  rows={5}
                  value={draftJumper.notes}
                  onChange={(event) =>
                    jumperAutosave.updateDraft({
                      ...draftJumper,
                      notes: event.target.value,
                    })
                  }
                />
              </label>
              <AssistiveHint
                as="p"
                text="A sentence or two about the concept is enough. You can always add personality and background later."
                triggerLabel="Explain jumper notes"
              />
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={markJumperWizardComplete}>
                  Finish Jumper Setup
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'create-jump' ? (
            <div className="selection-editor">
              <p>Create the next jump record here, then the wizard will walk you through its main fields.</p>
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={() => void handleCreateJump()}>
                  Create Jump
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jump-title' && draftWizardJump ? (
            <div className="selection-editor">
              <label className="field">
                <span>Title</span>
                <input
                  autoFocus
                  value={draftWizardJump.title}
                  onChange={(event) =>
                    jumpAutosave.updateDraft({
                      ...draftWizardJump,
                      title: event.target.value,
                    })
                  }
                />
              </label>
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumpWizardComplete}>
                  Jump Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jump-status' && draftWizardJump ? (
            <div className="selection-editor">
              <label className="field">
                <span>Status</span>
                <select
                  autoFocus
                  value={draftWizardJump.status}
                  onChange={(event) =>
                    jumpAutosave.updateDraft({
                      ...draftWizardJump,
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
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumpWizardComplete}>
                  Jump Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jump-type' && draftWizardJump ? (
            <div className="selection-editor">
              <label className="field">
                <span>Jump type</span>
                <select
                  autoFocus
                  value={draftWizardJump.jumpType}
                  onChange={(event) =>
                    jumpAutosave.updateDraft({
                      ...draftWizardJump,
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
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={goToNextSimpleWizardStep}>
                  Continue
                </button>
                <button className="button button--secondary" type="button" onClick={markJumpWizardComplete}>
                  Jump Is Ready
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'jump-duration' && draftWizardJump ? (
            <div className="selection-editor">
              <div className="field-grid field-grid--three">
                <label className="field">
                  <span>Years</span>
                  <input
                    autoFocus
                    type="number"
                    value={draftWizardJump.duration.years}
                    onChange={(event) =>
                      jumpAutosave.updateDraft({
                        ...draftWizardJump,
                        duration: {
                          ...draftWizardJump.duration,
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
                    value={draftWizardJump.duration.months}
                    onChange={(event) =>
                      jumpAutosave.updateDraft({
                        ...draftWizardJump,
                        duration: {
                          ...draftWizardJump.duration,
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
                    value={draftWizardJump.duration.days}
                    onChange={(event) =>
                      jumpAutosave.updateDraft({
                        ...draftWizardJump,
                        duration: {
                          ...draftWizardJump.duration,
                          days: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className="actions">
                <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                  Back
                </button>
                <button className="button" type="button" onClick={markJumpWizardComplete}>
                  Finish Jump Setup
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'iconic-prompt' ? (
            <div className="selection-editor">
              <p>
                Iconic is the bodymod-replacer workflow for preserving the jumper&apos;s defining concept when the chain strips
                them down. It is useful when you want a stable, recognisable signature package.
              </p>
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={() => updateSupplementDecision('iconic', 'yes')}>
                  Yes, Show Me
                </button>
                <button className="button button--secondary" type="button" onClick={() => updateSupplementDecision('iconic', 'not-now')}>
                  Not This Jump
                </button>
                <button className="button button--secondary" type="button" onClick={() => updateSupplementDecision('iconic', 'skip-future')}>
                  Stop Asking
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'personal-reality-prompt' ? (
            <div className="selection-editor">
              <p>
                Personal Reality is the supplement builder for warehouse-like space, facilities, budgets, and long-term chain
                infrastructure. Use it when you want to plan the reality itself, not just the jumper.
              </p>
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={() => updateSupplementDecision('personalReality', 'yes')}>
                  Yes, Show Me
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => updateSupplementDecision('personalReality', 'not-now')}
                >
                  Not This Jump
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => updateSupplementDecision('personalReality', 'skip-future')}
                >
                  Stop Asking
                </button>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'iconic-setup' ? (
            <div className="selection-editor">
              <p>
                This stays in the wizard on purpose. Iconic is small enough that simple mode can set it up here without kicking
                you out to a separate workspace.
              </p>
              {!selectedJumper ? (
                <div className="status status--warning">Focus a jumper first so the Iconic setup has someone to belong to.</div>
              ) : !draftIconicProfile ? (
                <div className="stack stack--compact">
                  <div className="guidance-strip">
                    <strong>{selectedJumper.name} does not have an Iconic profile yet.</strong>
                    <p>Create it here and the wizard will immediately let you choose the tier and concept.</p>
                  </div>
                  <div className="actions">
                    <button className="button" type="button" onClick={() => void handleCreateIconic()}>
                      Create Iconic Profile
                    </button>
                  </div>
                </div>
              ) : (
                <IconicEditor profile={draftIconicProfile} onChange={(nextProfile) => iconicAutosave.updateDraft(nextProfile)} />
              )}
              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button className="button" type="button" onClick={() => markSupplementGuideComplete('iconic')}>
                  Continue Wizard
                </button>
                <Link className="button button--secondary" to={getBodymodPath()}>
                  Open Iconic Workspace
                </Link>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'personal-reality-setup' ? (
            <div className="selection-editor">
              <p>
                This part stays in the wizard too. You can make the first Personal Reality decisions here, then use the full
                worksheet later for the page-by-page build.
              </p>

              <label className="field">
                <span>Core mode</span>
                <select
                  value={personalRealityState.coreModeId}
                  onChange={(event) =>
                    updatePersonalRealityState((currentState) => ({
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
              </label>

              {personalRealityState.coreModeId ? (
                <div className="guidance-strip">
                  <strong>{personalRealityCoreModes.find((coreMode) => coreMode.id === personalRealityState.coreModeId)?.title}</strong>
                  <p>{personalRealityCoreModes.find((coreMode) => coreMode.id === personalRealityState.coreModeId)?.summary}</p>
                </div>
              ) : null}

              <div className="field-grid field-grid--two">
                <label className="field">
                  <span>Completed jumps override</span>
                  <input
                    type="number"
                    min={0}
                    value={personalRealityState.budget.completedJumpCountOverride ?? ''}
                    placeholder={String(completedJumpCountFromChain)}
                    onChange={(event) =>
                      updatePersonalRealityState((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          completedJumpCountOverride: event.target.value === '' ? null : Math.max(0, Number(event.target.value)),
                        },
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Unlimited transferred WP</span>
                  <input
                    type="number"
                    min={0}
                    value={personalRealityState.budget.unlimitedTransferredWp}
                    onChange={(event) =>
                      updatePersonalRealityState((currentState) => ({
                        ...currentState,
                        budget: {
                          ...currentState.budget,
                          unlimitedTransferredWp: Math.max(0, Number(event.target.value) || 0),
                        },
                      }))
                    }
                  />
                </label>
              </div>

              <div className="field">
                <span>Extra modes</span>
                <div className="checkbox-list">
                  {personalRealityExtraModes.map((extraMode) => {
                    const checked = personalRealityState.extraModeIds.includes(extraMode.id);

                    return (
                      <label className="checkbox-row" key={extraMode.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => togglePersonalRealityExtraMode(extraMode.id, event.target.checked)}
                        />
                        <span>
                          <strong>{extraMode.title}</strong> | {extraMode.summary}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="field-grid field-grid--three">
                {personalRealityState.extraModeIds.includes('patient-jumper') ? (
                  <label className="field">
                    <span>Delayed jumps</span>
                    <input
                      type="number"
                      min={0}
                      value={personalRealityState.budget.patientJumperDelayedJumps}
                      onChange={(event) =>
                        updatePersonalRealityState((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            patientJumperDelayedJumps: Math.max(0, Number(event.target.value) || 0),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                {personalRealityState.extraModeIds.includes('swap-out') ? (
                  <label className="field">
                    <span>Experienced jumps</span>
                    <input
                      type="number"
                      min={0}
                      value={personalRealityState.budget.swapOutExperiencedJumps}
                      onChange={(event) =>
                        updatePersonalRealityState((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            swapOutExperiencedJumps: Math.max(0, Number(event.target.value) || 0),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}

                {personalRealityState.extraModeIds.includes('cross-roads') ? (
                  <label className="field">
                    <span>Triggered jumps</span>
                    <input
                      type="number"
                      min={0}
                      value={personalRealityState.budget.crossroadsTriggeredJumps}
                      onChange={(event) =>
                        updatePersonalRealityState((currentState) => ({
                          ...currentState,
                          budget: {
                            ...currentState.budget,
                            crossroadsTriggeredJumps: Math.max(0, Number(event.target.value) || 0),
                          },
                        }))
                      }
                    />
                  </label>
                ) : null}
              </div>

              <label className="field">
                <span>Personal Reality notes</span>
                <textarea
                  rows={4}
                  value={personalRealityState.notes}
                  onChange={(event) =>
                    updatePersonalRealityState((currentState) => ({
                      ...currentState,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="actions">
                {hasPreviousSimpleWizardStep ? (
                  <button className="button button--secondary" type="button" onClick={goToPreviousSimpleWizardStep}>
                    Back
                  </button>
                ) : null}
                <button
                  className="button"
                  type="button"
                  onClick={() => markSupplementGuideComplete('personalReality')}
                >
                  Continue Wizard
                </button>
                <Link className="button button--secondary" to={`/chains/${chainId}/personal-reality`}>
                  Open Personal Reality Workspace
                </Link>
              </div>
            </div>
          ) : null}

          {activeSimpleWizardStep.id === 'complete' ? (
            <div className="selection-editor">
              <p>
                {simpleModeWizardState.iconicDecision === 'not-now' && simpleModeWizardState.personalRealityDecision === 'not-now'
                  ? 'Both supplements are parked for now. Add another jump later if you want simple mode to bring them up again.'
                  : 'The guided setup pass is finished. From here you can keep editing normally or jump into the deeper modules when you want them.'}
              </p>
              <div className="actions">
                <Link className="button" to={`/chains/${chainId}/jumpers${buildSearch(selectedJumperId)}`}>
                  Open Jumpers
                </Link>
                <Link className="button button--secondary" to={getJumpEditorPath(wizardJump?.id ?? currentJump?.id ?? null)}>
                  Open Jumps
                </Link>
                <Link className="button button--secondary" to={getParticipationPath()}>
                  Open Participation and Purchases
                </Link>
              </div>
            </div>
          ) : null}
              {activeSimpleWizardAffirmation ? (
                <div className="status status--success simple-setup-popover__affirmation">{activeSimpleWizardAffirmation}</div>
              ) : null}
            </section>
          </div>
          ) : null}
        </>
      ) : (
        <section className="card stack">
          <div className="section-heading">
            <h3>Setup Checklist</h3>
            <span className="pill">{nextSetupStep ? 'Actionable' : 'Ready to work'}</span>
          </div>
          <div className="summary-grid">
            {setupSteps.map((step) => (
              <TooltipFrame key={step.id} tooltip={!simpleMode ? joinHelpText(step.description, step.context) : undefined}>
                <article className="summary-panel stack stack--compact">
                  <div className="section-heading">
                    <h4>{step.title}</h4>
                    <span className={getStepPillClassName(step.tone)}>{getStepStatusLabel(step.tone)}</span>
                  </div>
                  {simpleMode ? <p>{step.description}</p> : null}
                  {simpleMode && step.context ? (
                    <AssistiveHint as="p" text={step.context} triggerLabel={`Explain ${step.title}`} />
                  ) : null}
                  <div className="actions">
                    {step.primaryAction.kind === 'link' ? (
                      <Link
                        className={step.tone === 'attention' ? 'button' : 'button button--secondary'}
                        to={step.primaryAction.to ?? `/chains/${chainId}/overview`}
                      >
                        {step.primaryAction.label}
                      </Link>
                    ) : (
                      <button
                        className={step.tone === 'attention' ? 'button' : 'button button--secondary'}
                        type="button"
                        onClick={() => void step.primaryAction.onClick?.()}
                      >
                        {step.primaryAction.label}
                      </button>
                    )}
                  </div>
                </article>
              </TooltipFrame>
            ))}
          </div>
        </section>
      )}

      <section className="card stack">
        <div className="section-heading">
          <h3>Continue Working</h3>
          <span className="pill">Context aware</span>
        </div>
        <div className="summary-grid">
          {visibleWorkSurfaceCards.map((card) => (
            <TooltipFrame key={card.id} tooltip={!simpleMode ? card.hint : undefined}>
              <Link className="selection-list__item" to={card.to}>
                <strong>{card.title}</strong>
                {simpleMode ? <span>{card.description}</span> : null}
              </Link>
            </TooltipFrame>
          ))}
        </div>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Current Jump Rules</h3>
            <span className="pill">{effectiveState.currentJump?.title ?? 'No jump'}</span>
          </div>
          {currentJump ? (
            <>
              <div className="inline-meta">
                <span className="metric">
                  <strong>{effectiveState.gauntlet ? 'Yes' : 'No'}</strong>
                  Gauntlet
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.warehouseAccess}</strong>
                  Warehouse
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.powerAccess}</strong>
                  Powers
                </span>
                <span className="metric">
                  <strong>{effectiveState.effectiveAccessModes.itemAccess}</strong>
                  Items
                </span>
              </div>
              <p>
                Alt forms: <strong>{effectiveState.effectiveAccessModes.altFormAccess}</strong> | Supplements:{' '}
                <strong>{effectiveState.effectiveAccessModes.supplementAccess}</strong>
              </p>
              <p>{effectiveState.contributingEffects.length} active scoped effects are contributing to this summary.</p>
              <Link className="button button--secondary" to={`/chains/${chainId}/current-jump-rules`}>
                Open Current Jump Rules
              </Link>
            </>
          ) : (
            <>
              <p>No current jump is selected yet.</p>
              <TooltipFrame
                inline
                tooltip={!simpleMode ? 'Choose the active jump above to unlock live rules context, participation and purchases focus, and jump-scoped summaries.' : undefined}
              >
                <Link className="button button--secondary" to={`/chains/${chainId}/jumps`}>
                  Open Jumps
                </Link>
              </TooltipFrame>
              {simpleMode ? (
                <AssistiveHint
                  as="p"
                  text="Choose the active jump above to unlock live rules context, participation and purchases focus, and jump-scoped summaries."
                  triggerLabel="Explain current jump rules"
                />
              ) : null}
            </>
          )}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Recovery Banner</h3>
            <span className="pill">{workspace.snapshots.length} snapshots</span>
          </div>
          {latestSnapshot ? (
            <>
              <p>
                Latest snapshot: <strong>{latestSnapshot.title}</strong>
              </p>
              <p>{latestSnapshot.description || 'No description recorded for this snapshot.'}</p>
              <p>Created {formatTimestamp(latestSnapshot.createdAt)}</p>
            </>
          ) : (
            <>
              <p>No snapshots exist for the active branch yet.</p>
            </>
          )}
          <TooltipFrame
            inline
            tooltip={!simpleMode ? 'Take a snapshot before major imports, branch experiments, or big editing sessions.' : undefined}
          >
            <Link className="button button--secondary" to={`/chains/${chainId}/backups`}>
              Open Recovery Tools
            </Link>
          </TooltipFrame>
          {simpleMode ? (
            <AssistiveHint
              as="p"
              text="Take a snapshot before major imports, branch experiments, or big editing sessions."
              triggerLabel="Explain recovery tools"
            />
          ) : null}
        </article>
      </section>
    </div>
  );
}
