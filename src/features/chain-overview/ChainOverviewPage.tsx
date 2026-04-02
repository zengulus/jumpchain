import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { cosmicBackpackMandatoryOptionIds } from '../cosmic-backpack/catalog';
import { readCosmicBackpackState } from '../cosmic-backpack/model';
import {
  EmptyWorkspaceCard,
  ReadinessPill,
  WorkspaceModuleHeader,
} from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import {
  SIMPLE_MODE_GUIDE_DEFAULT_KEY,
  createBranchGuideScopeKey,
  createParticipationGuideKey,
  isBodymodGuideStepComplete,
  isCompanionGuideStepComplete,
  isCosmicBackpackGuideStepComplete,
  isJumpGuideStepComplete,
  isJumperGuideStepComplete,
  isParticipationGuideStepComplete,
  setGuideCurrentStep,
  setGuideDismissed,
  type BodymodGuideStepId,
  type CompanionGuideStepId,
  type CosmicBackpackGuideStepId,
  type JumpGuideStepId,
  type JumperGuideStepId,
  type OverviewGuideStepId,
  type ParticipationGuideStepId,
} from '../workspace/simpleModeGuides';

const JUMPER_GUIDE_STEPS: JumperGuideStepId[] = ['identity', 'details'];
const COMPANION_GUIDE_STEPS: CompanionGuideStepId[] = ['relationship', 'continuity'];
const JUMP_GUIDE_STEPS: JumpGuideStepId[] = ['basics', 'party', 'purchases'];
const PARTICIPATION_GUIDE_STEPS: ParticipationGuideStepId[] = ['beginnings', 'purchases', 'wrap-up'];
const BODYMOD_GUIDE_STEPS: BodymodGuideStepId[] = ['create-profile', 'tier-and-concept', 'signature-package'];
const COSMIC_BACKPACK_GUIDE_STEPS: CosmicBackpackGuideStepId[] = ['free-options', 'notes-and-appearance', 'upgrades'];

interface OverviewTarget {
  id: string;
  title: string;
  description: string;
  to: string;
  overviewStepId: OverviewGuideStepId | null;
  optional?: boolean;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatCountLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildPath(basePath: string, params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim().length > 0) {
      searchParams.set(key, value);
    }
  }

  const search = searchParams.toString();
  return search.length > 0 ? `${basePath}?${search}` : basePath;
}

function hasIncompleteStep(stepIds: readonly string[], isComplete: (stepId: string) => boolean) {
  return stepIds.some((stepId) => !isComplete(stepId));
}

function getParticipationTabForStep(stepId: ParticipationGuideStepId) {
  if (stepId === 'beginnings') {
    return null;
  }

  if (stepId === 'wrap-up') {
    return 'notes';
  }

  return 'perks';
}

export function ChainOverviewPage() {
  const navigate = useNavigate();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams] = useSearchParams();
  const {
    simpleMode,
    getOverviewGuideState,
    updateOverviewGuideState,
    listBranchGuideStates,
    getChainGuideState,
    listChainGuideStates,
  } = useUiPreferences();

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before using guided setup." />;
  }

  const branchGuideScopeKey = createBranchGuideScopeKey(chainId, workspace.activeBranch.id);
  const overviewGuideState = getOverviewGuideState(branchGuideScopeKey);
  const latestSnapshot = workspace.snapshots.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const selectedJumper =
    workspace.jumpers.find((jumper) => jumper.id === searchParams.get('jumper')) ??
    workspace.jumpers[0] ??
    null;
  const currentJump = workspace.currentJump ?? workspace.jumps[0] ?? null;
  const bodymodProfilesByJumperId = new Map(workspace.bodymodProfiles.map((profile) => [profile.jumperId, profile]));
  const backpackState = readCosmicBackpackState(workspace.chain);
  const backpackStarted =
    backpackState.customUpgrades.length > 0 ||
    backpackState.appearanceNotes.trim().length > 0 ||
    backpackState.containerForm.trim().length > 0 ||
    backpackState.notes.trim().length > 0 ||
    backpackState.selectedOptionIds.some(
      (optionId) =>
        !cosmicBackpackMandatoryOptionIds.includes(
          optionId as (typeof cosmicBackpackMandatoryOptionIds)[number],
        ),
    );
  const jumperGuideStates = listBranchGuideStates(branchGuideScopeKey, 'jumpers');
  const companionGuideStates = listBranchGuideStates(branchGuideScopeKey, 'companions');
  const jumpGuideStates = listBranchGuideStates(branchGuideScopeKey, 'jumps');
  const participationGuideStates = listBranchGuideStates(branchGuideScopeKey, 'participation');
  const bodymodGuideStates = listBranchGuideStates(branchGuideScopeKey, 'bodymod');
  const storedBackpackGuides = listChainGuideStates(chainId, 'cosmic-backpack');
  const backpackGuideState = getChainGuideState(chainId, 'cosmic-backpack', SIMPLE_MODE_GUIDE_DEFAULT_KEY);

  function setOverviewPromptState(promptState: 'accepted' | 'dismissed') {
    updateOverviewGuideState(branchGuideScopeKey, (current) => ({
      ...setGuideDismissed(current, promptState === 'dismissed'),
      promptState,
    }));
  }

  function setSupplementDecision(feature: 'iconic' | 'cosmicBackpack', decision: 'yes' | 'not-now' | 'skip-future') {
    updateOverviewGuideState(branchGuideScopeKey, (current) => ({
      ...setGuideDismissed(current, false),
      promptState: 'accepted',
      iconicDecision: feature === 'iconic' ? decision : current.iconicDecision,
      cosmicBackpackDecision: feature === 'cosmicBackpack' ? decision : current.cosmicBackpackDecision,
      lastSupplementPromptJumpCount: workspace.jumps.length,
    }));
  }

  function openTarget(target: OverviewTarget) {
    updateOverviewGuideState(branchGuideScopeKey, (current) =>
      setGuideCurrentStep(
        {
          ...setGuideDismissed(current, false),
          promptState: 'accepted',
        },
        target.overviewStepId,
      ),
    );
    navigate(target.to);
  }

  function buildJumpersTarget(jumperId?: string | null): OverviewTarget {
    return {
      id: 'jumper',
      title: workspace.jumpers.length === 0 ? 'Create the first jumper' : 'Resume jumper setup',
      description:
        workspace.jumpers.length === 0
          ? 'Start the chain by naming the jumper and filling in the basic identity details.'
          : 'Finish the identity and details pass for the selected jumper.',
      to: buildPath(`/chains/${chainId}/jumpers`, {
        jumper: jumperId ?? undefined,
        guide: '1',
      }),
      overviewStepId: 'jumper',
    };
  }

  function buildJumpTarget(jumpId?: string | null): OverviewTarget {
    return {
      id: 'jump',
      title: workspace.jumps.length === 0 ? 'Create the first jump' : 'Resume jump setup',
      description:
        workspace.jumps.length === 0
          ? 'Once the jumper exists, set up the first jump and walk through its basics, party, and purchases.'
          : 'Pick up the jump guide where basics, party, or purchases still need attention.',
      to: jumpId
        ? buildPath(`/chains/${chainId}/jumps/${jumpId}`, { guide: '1' })
        : buildPath(`/chains/${chainId}/jumps`, { guide: '1' }),
      overviewStepId: 'jump',
    };
  }

  function buildParticipationTarget(jumpId: string, participantId: string, stepId: ParticipationGuideStepId): OverviewTarget {
    return {
      id: `participation:${jumpId}:${participantId}`,
      title: 'Resume participation setup',
      description: 'Finish the beginnings, purchases, and wrap-up notes for the participant currently in focus.',
      to: buildPath(`/chains/${chainId}/jumps/${jumpId}`, {
        panel: 'participation',
        participant: participantId,
        participationTab: getParticipationTabForStep(stepId),
        guide: '1',
      }),
      overviewStepId: 'participation',
    };
  }

  function buildCompanionTarget(companionId: string): OverviewTarget {
    return {
      id: `companion:${companionId}`,
      title: 'Resume companion setup',
      description: 'Fill in the relationship and continuity details for the companion you just started.',
      to: buildPath(`/chains/${chainId}/companions`, {
        companion: companionId,
        guide: '1',
      }),
      overviewStepId: null,
      optional: true,
    };
  }

  function buildBodymodTarget(jumperId: string): OverviewTarget {
    return {
      id: `bodymod:${jumperId}`,
      title: 'Resume Iconic setup',
      description: 'Open the Iconic page for this jumper and continue the optional continuity package.',
      to: buildPath(`/chains/${chainId}/bodymod`, {
        jumper: jumperId,
        guide: '1',
      }),
      overviewStepId: null,
      optional: true,
    };
  }

  function buildBackpackTarget(): OverviewTarget {
    return {
      id: 'cosmic-backpack',
      title: 'Resume Cosmic Backpack setup',
      description: 'Continue the optional warehouse replacement on the main Cosmic Backpack page.',
      to: buildPath(`/chains/${chainId}/cosmic-backpack`, {
        guide: '1',
      }),
      overviewStepId: null,
      optional: true,
    };
  }

  function getNextCoreTarget(): OverviewTarget | null {
    if (workspace.jumpers.length === 0) {
      return buildJumpersTarget();
    }

    for (const jumper of workspace.jumpers) {
      const guideState = jumperGuideStates[jumper.id];

      if (!guideState) {
        continue;
      }

      if (hasIncompleteStep(JUMPER_GUIDE_STEPS, (stepId) => isJumperGuideStepComplete(jumper, guideState, stepId as JumperGuideStepId))) {
        return buildJumpersTarget(jumper.id);
      }
    }

    if (workspace.jumps.length === 0) {
      return buildJumpTarget();
    }

    const orderedJumps = currentJump
      ? [currentJump, ...workspace.jumps.filter((jump) => jump.id !== currentJump.id)]
      : workspace.jumps;

    for (const jump of orderedJumps) {
      const guideState = jumpGuideStates[jump.id];

      if (!guideState) {
        continue;
      }

      if (hasIncompleteStep(JUMP_GUIDE_STEPS, (stepId) => isJumpGuideStepComplete(jump, guideState, stepId as JumpGuideStepId))) {
        return buildJumpTarget(jump.id);
      }
    }

    const orderedParticipationGuideEntries = Object.entries(participationGuideStates).sort(([leftKey], [rightKey]) => {
      const [leftJumpId] = leftKey.split(':', 2);
      const [rightJumpId] = rightKey.split(':', 2);

      if (currentJump?.id === leftJumpId && currentJump?.id !== rightJumpId) {
        return -1;
      }

      if (currentJump?.id === rightJumpId && currentJump?.id !== leftJumpId) {
        return 1;
      }

      return leftKey.localeCompare(rightKey);
    });

    for (const [guideKey, guideState] of orderedParticipationGuideEntries) {
      const [jumpId, participantId] = guideKey.split(':', 2);

      if (!jumpId || !participantId || !workspace.jumps.some((jump) => jump.id === jumpId)) {
        continue;
      }

      const participation =
        workspace.participations.find(
          (entry) => createParticipationGuideKey(entry.jumpId, entry.participantId) === guideKey,
        ) ?? null;
      const incompleteStep = PARTICIPATION_GUIDE_STEPS.find(
        (stepId) => !isParticipationGuideStepComplete(participation, guideState, stepId),
      );

      if (incompleteStep) {
        return buildParticipationTarget(jumpId, participantId, incompleteStep);
      }
    }

    return null;
  }

  function getNextOptionalTarget(): OverviewTarget | null {
    for (const companion of workspace.companions) {
      const guideState = companionGuideStates[companion.id];

      if (!guideState) {
        continue;
      }

      if (hasIncompleteStep(COMPANION_GUIDE_STEPS, (stepId) => isCompanionGuideStepComplete(companion, guideState, stepId as CompanionGuideStepId))) {
        return buildCompanionTarget(companion.id);
      }
    }

    if (overviewGuideState.iconicDecision === 'yes' && workspace.jumpers.length > 0) {
      const orderedJumpers = selectedJumper
        ? [selectedJumper, ...workspace.jumpers.filter((jumper) => jumper.id !== selectedJumper.id)]
        : workspace.jumpers;

      for (const jumper of orderedJumpers) {
        const guideState = bodymodGuideStates[jumper.id];
        const profile = bodymodProfilesByJumperId.get(jumper.id) ?? null;

        if (guideState && hasIncompleteStep(BODYMOD_GUIDE_STEPS, (stepId) => isBodymodGuideStepComplete(profile, guideState, stepId as BodymodGuideStepId))) {
          return buildBodymodTarget(jumper.id);
        }
      }

      const jumperWithoutProfile = orderedJumpers.find((jumper) => !bodymodProfilesByJumperId.has(jumper.id)) ?? null;

      if (jumperWithoutProfile) {
        return buildBodymodTarget(jumperWithoutProfile.id);
      }
    }

    const hasStoredBackpackGuide = SIMPLE_MODE_GUIDE_DEFAULT_KEY in storedBackpackGuides;

    if (
      overviewGuideState.cosmicBackpackDecision === 'yes'
      && (
        (hasStoredBackpackGuide
          && hasIncompleteStep(
            COSMIC_BACKPACK_GUIDE_STEPS,
            (stepId) => isCosmicBackpackGuideStepComplete(backpackState, backpackGuideState, stepId as CosmicBackpackGuideStepId),
          ))
        || (!hasStoredBackpackGuide && !backpackStarted)
      )
    ) {
      return buildBackpackTarget();
    }

    return null;
  }

  const nextTarget = getNextCoreTarget() ?? getNextOptionalTarget();
  const currentJumpParticipantId = currentJump
    ? currentJump.participantJumperIds[0]
      ?? workspace.participations.find((entry) => entry.jumpId === currentJump.id)?.participantId
      ?? null
    : null;
  const supplementPromptAvailable =
    simpleMode
    && !nextTarget
    && workspace.jumps.length > 0
    && overviewGuideState.promptState !== 'dismissed'
    && (overviewGuideState.iconicDecision === 'undecided' || overviewGuideState.cosmicBackpackDecision === 'undecided');

  const setupCards = [
    {
      title: 'Jumpers',
      description: workspace.jumpers.length > 0 ? formatCountLabel(workspace.jumpers.length, 'jumper') : 'No jumpers yet.',
      tone: workspace.jumpers.length > 0 ? 'core' : 'start',
      action: buildPath(`/chains/${chainId}/jumpers`, {
        jumper: selectedJumper?.id ?? undefined,
      }),
    },
    {
      title: 'Jumps',
      description: workspace.jumps.length > 0 ? formatCountLabel(workspace.jumps.length, 'jump') : 'No jumps yet.',
      tone: workspace.jumps.length > 0 ? 'core' : 'start',
      action: currentJump ? `/chains/${chainId}/jumps/${currentJump.id}` : `/chains/${chainId}/jumps`,
    },
    {
      title: 'Participation',
      description:
        workspace.participations.length > 0
          ? formatCountLabel(workspace.participations.length, 'participation record')
          : 'No participation records yet.',
      tone: workspace.participations.length > 0 ? 'core' : 'start',
      action:
        currentJump && currentJumpParticipantId
          ? buildPath(`/chains/${chainId}/jumps/${currentJump.id}`, {
              panel: 'participation',
              participant: currentJumpParticipantId,
            })
          : currentJump
            ? `/chains/${chainId}/jumps/${currentJump.id}`
            : `/chains/${chainId}/jumps`,
    },
    {
      title: 'Companions',
      description: workspace.companions.length > 0 ? formatCountLabel(workspace.companions.length, 'companion') : 'Optional, none started.',
      tone: workspace.companions.length > 0 ? 'core' : 'optional',
      action: buildPath(`/chains/${chainId}/companions`, {}),
    },
    {
      title: 'Iconic',
      description:
        workspace.bodymodProfiles.length > 0
          ? formatCountLabel(workspace.bodymodProfiles.length, 'Iconic profile')
          : 'Optional, no Iconic profiles yet.',
      tone: workspace.bodymodProfiles.length > 0 ? 'core' : 'optional',
      action: buildPath(`/chains/${chainId}/bodymod`, {
        jumper: selectedJumper?.id ?? undefined,
      }),
    },
    {
      title: 'Cosmic Backpack',
      description: backpackStarted ? 'Optional warehouse replacement in progress.' : 'Optional, not started.',
      tone: backpackStarted ? 'core' : 'optional',
      action: `/chains/${chainId}/cosmic-backpack`,
    },
  ] as const;

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Overview"
        description={
          simpleMode
            ? 'Status, recent context, and quick links for this branch.'
            : 'Workspace summary with quick links into the main chain setup surfaces.'
        }
        badge={workspace.activeBranch.title}
        actions={
          currentJump ? (
            <Link className="button button--secondary" to={`/chains/${chainId}/jumps/${currentJump.id}`}>
              Open Current Jump
            </Link>
          ) : (
            <Link className="button button--secondary" to={`/chains/${chainId}/jumpers`}>
              Open Workspace
            </Link>
          )
        }
      />

      {simpleMode ? (
        overviewGuideState.promptState === 'dismissed' ? (
          <section className="card stack">
            <div className="section-heading">
              <h3>Guided setup paused</h3>
              <ReadinessPill tone="optional" label="Paused" />
            </div>
            <p>The page-local setup guides are still there. Resume whenever you want and Overview will send you to the next unfinished surface.</p>
            <div className="actions">
              <button className="button" type="button" onClick={() => setOverviewPromptState('accepted')}>
                Resume Guided Setup
              </button>
            </div>
          </section>
        ) : nextTarget ? (
          <section className="card stack">
            <div className="section-heading">
              <h3>{nextTarget.optional ? 'Optional setup next' : 'Next setup step'}</h3>
              <ReadinessPill tone={nextTarget.optional ? 'optional' : 'core'} />
            </div>
            <div className="stack stack--compact">
              <strong>{nextTarget.title}</strong>
              <p>{nextTarget.description}</p>
            </div>
            <div className="actions">
              <button className="button" type="button" onClick={() => openTarget(nextTarget)}>
                {nextTarget.optional ? 'Open Optional Setup' : 'Open Next Setup Step'}
              </button>
              <button className="button button--secondary" type="button" onClick={() => setOverviewPromptState('dismissed')}>
                Pause Guided Setup
              </button>
            </div>
          </section>
        ) : supplementPromptAvailable ? (
          <section className="card stack">
            <div className="section-heading">
              <h3>Optional modules</h3>
              <ReadinessPill tone="optional" label="Choose what to start" />
            </div>
            <p>The core chain flow is in place. If you want, you can opt into Iconic or Cosmic Backpack and each page will handle its own setup from there.</p>

            {overviewGuideState.iconicDecision === 'undecided' ? (
              <div className="stack stack--compact">
                <strong>Iconic</strong>
                <p>Optional continuity profile for keeping a jumper recognizable through resets or restrictions.</p>
                <div className="actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setSupplementDecision('iconic', 'yes');
                      if (selectedJumper) {
                        openTarget(buildBodymodTarget(selectedJumper.id));
                      }
                    }}
                  >
                    Start Iconic
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setSupplementDecision('iconic', 'not-now')}>
                    Not Now
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setSupplementDecision('iconic', 'skip-future')}>
                    Stop Asking
                  </button>
                </div>
              </div>
            ) : null}

            {overviewGuideState.cosmicBackpackDecision === 'undecided' ? (
              <div className="stack stack--compact">
                <strong>Cosmic Backpack</strong>
                <p>Optional warehouse replacement built around one bag and a smaller upgrade list.</p>
                <div className="actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setSupplementDecision('cosmicBackpack', 'yes');
                      openTarget(buildBackpackTarget());
                    }}
                  >
                    Start Cosmic Backpack
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setSupplementDecision('cosmicBackpack', 'not-now')}>
                    Not Now
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => setSupplementDecision('cosmicBackpack', 'skip-future')}>
                    Stop Asking
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="card stack">
            <div className="section-heading">
              <h3>Guided setup caught up</h3>
              <ReadinessPill tone="core" label="On track" />
            </div>
            <p>The main setup flow is not waiting on anything right now. Use the workspace cards below to reopen a page-local guide whenever you start something new.</p>
          </section>
        )
      ) : null}

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Current Branch</h3>
            <span className="pill">Active</span>
          </div>
          <p>The active branch is the working version of this chain. Everything below is scoped to {workspace.activeBranch.title}.</p>
          <div className="inline-meta">
            <span className="pill">{formatCountLabel(workspace.jumpers.length, 'jumper')}</span>
            <span className="pill">{formatCountLabel(workspace.jumps.length, 'jump')}</span>
            <span className="pill">{formatCountLabel(workspace.participations.length, 'participation')}</span>
          </div>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Recent Context</h3>
            <ReadinessPill tone={currentJump ? 'core' : 'start'} label={currentJump ? 'Current jump set' : 'No current jump'} />
          </div>
          <p>{currentJump ? `${currentJump.title} is the current jump for this branch.` : 'Pick or create a jump to anchor the active context.'}</p>
          <p>{latestSnapshot ? `Latest snapshot: ${latestSnapshot.title} on ${formatTimestamp(latestSnapshot.createdAt)}.` : 'No snapshots yet.'}</p>
        </article>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Workspace Surfaces</h3>
          <span className="pill">{setupCards.length}</span>
        </div>

        <div className="selection-editor-list">
          {setupCards.map((card) => (
            <article className="selection-editor" key={card.title}>
              <div className="selection-editor__header">
                <div className="stack stack--compact">
                  <strong>{card.title}</strong>
                  <p className="editor-section__copy">{card.description}</p>
                </div>
                <div className="actions">
                  <ReadinessPill tone={card.tone} />
                  <Link className="button button--secondary" to={card.action}>
                    Open
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
