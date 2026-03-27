import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import type { IconicBodymodMode } from '../../domain/common';
import type { IconicSelection } from '../../domain/bodymod/types';
import { db } from '../../db/database';
import { SetupGuidePanels, iconicSetupGuide } from '../supplement-guides/SetupGuidePanels';
import { IconicEditor } from './IconicEditor';
import { getProfileStatusLabel } from './iconicSetup';
import { createBlankBodymodProfile, saveChainRecord } from '../workspace/records';
import {
  AutosaveStatusIndicator,
  EmptyWorkspaceCard,
  PlainLanguageHint,
  ReadinessPill,
  SimpleModeAffirmation,
  SimpleModeGuideFrame,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import {
  createBranchGuideScopeKey,
  createSimpleModePageGuideState,
  getFirstIncompleteGuideStep,
  isBodymodGuideStepComplete,
  markGuideStepAcknowledged,
  readGuideRequested,
  setGuideCurrentStep,
  setGuideDismissed,
  updateGuideSearchParams,
  type BodymodGuideStepId,
  type SimpleModePageGuideState,
} from '../workspace/simpleModeGuides';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function BodymodPage() {
  const { simpleMode, getBranchGuideState, updateBranchGuideState } = useUiPreferences();
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJumper =
    workspace.jumpers.find((jumper) => jumper.id === searchParams.get('jumper')) ??
    workspace.jumpers[0] ??
    null;
  const selectedJumperId = selectedJumper?.id ?? null;
  const profile = selectedJumper
    ? workspace.bodymodProfiles.find((entry) => entry.jumperId === selectedJumper.id) ?? null
    : null;
  const profileAutosave = useAutosaveRecord(profile, {
    onSave: async (nextValue) => {
      await saveChainRecord(db.bodymodProfiles, nextValue);
    },
    getErrorMessage: (error) => (error instanceof Error ? error.message : 'Unable to save Iconic changes.'),
  });
  const draftProfile = profileAutosave.draft ?? profile;
  const { message: simpleAffirmation, showAffirmation, clearAffirmation } = useSimpleModeAffirmation();
  const iconicStartedForSelectedJumper = Boolean(draftProfile);
  const guideRequested = simpleMode && readGuideRequested(searchParams);
  const branchGuideScopeKey = workspace.activeBranch ? createBranchGuideScopeKey(chainId, workspace.activeBranch.id) : null;
  const bodymodGuideState =
    branchGuideScopeKey && selectedJumperId
      ? getBranchGuideState(branchGuideScopeKey, 'bodymod', selectedJumperId)
      : createSimpleModePageGuideState('create-profile');
  const bodymodGuideSteps: Array<{ id: BodymodGuideStepId; label: string; description: string }> = [
    {
      id: 'create-profile',
      label: 'Create Profile',
      description: 'Start the Iconic profile for this jumper so the continuity package has a place to live.',
    },
    {
      id: 'tier-and-concept',
      label: 'Tier And Concept',
      description: 'Set the overall concept, benchmark notes, and the broad shape of what makes this jumper recognizable.',
    },
    {
      id: 'signature-package',
      label: 'Signature Package',
      description: 'Use the full editor below to lock in the package you want to keep stable across harsh resets.',
    },
  ];
  const currentGuideStepId =
    selectedJumperId
      ? (getFirstIncompleteGuideStep(
          bodymodGuideSteps.map((step) => step.id),
          bodymodGuideState,
          (stepId) =>
            isBodymodGuideStepComplete(draftProfile, bodymodGuideState, stepId as BodymodGuideStepId),
        ) as BodymodGuideStepId | null)
      : null;

  useEffect(() => {
    clearAffirmation();
  }, [clearAffirmation, selectedJumperId]);

  function updateSelectedBodymodGuideState(
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) {
    if (!branchGuideScopeKey || !selectedJumperId) {
      return;
    }

    updateBranchGuideState(branchGuideScopeKey, 'bodymod', selectedJumperId, updater);
  }

  function setGuideRequestedState(requested: boolean) {
    setSearchParams((currentParams) => updateGuideSearchParams(currentParams, requested));
  }

  async function handleCreateProfile() {
    if (!workspace.activeBranch || !selectedJumper) {
      return;
    }

    try {
      await saveChainRecord(
        db.bodymodProfiles,
        createBlankBodymodProfile(chainId, workspace.activeBranch.id, selectedJumper.id),
      );

      if (simpleMode && branchGuideScopeKey) {
        updateBranchGuideState(branchGuideScopeKey, 'bodymod', selectedJumper.id, (current) =>
          setGuideCurrentStep(setGuideDismissed(current, false), 'tier-and-concept'),
        );
        setGuideRequestedState(true);
      }

      setNotice({
        tone: 'success',
        message: 'Created an Iconic profile for this jumper.',
      });
      if (simpleMode) {
        showAffirmation('The Iconic profile is started. Now you can lock in the pieces that keep this jumper recognizable.');
      }
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create Iconic profile.',
      });
    }
  }

  function handleGuideDismiss() {
    updateSelectedBodymodGuideState((current) => setGuideDismissed(current, true));
    setGuideRequestedState(false);
  }

  function handleGuideStepChange(nextStepId: BodymodGuideStepId) {
    updateSelectedBodymodGuideState((current) => setGuideCurrentStep(current, nextStepId));
  }

  function handleReopenGuide() {
    const stepId = currentGuideStepId ?? 'signature-package';
    updateSelectedBodymodGuideState((current) => setGuideCurrentStep(setGuideDismissed(current, false), stepId));
    setGuideRequestedState(true);
  }

  function handleGuideContinue() {
    if (!currentGuideStepId) {
      return;
    }

    if (currentGuideStepId === 'create-profile') {
      if (!draftProfile) {
        void handleCreateProfile();
        return;
      }

      updateSelectedBodymodGuideState((current) =>
        setGuideCurrentStep(markGuideStepAcknowledged(current, 'create-profile'), 'tier-and-concept'),
      );
      return;
    }

    if (currentGuideStepId === 'tier-and-concept') {
      updateSelectedBodymodGuideState((current) =>
        setGuideCurrentStep(markGuideStepAcknowledged(current, 'tier-and-concept'), 'signature-package'),
      );
      return;
    }

    updateSelectedBodymodGuideState((current) =>
      setGuideDismissed(setGuideCurrentStep(markGuideStepAcknowledged(current, 'signature-package'), 'signature-package'), true),
    );
    setGuideRequestedState(false);
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing Iconic data." />;
  }

  if (workspace.jumpers.length === 0) {
    return <EmptyWorkspaceCard title="No jumpers available" body="Create a jumper first, then define an Iconic profile." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Iconic"
        description={
          simpleMode
            ? iconicStartedForSelectedJumper
              ? 'Optional continuity workspace in progress for this jumper. Keep shaping the signature package here whenever you want.'
              : 'Optional continuity workspace. You can skip Iconic until you want a stable signature package through harsh resets or restrictions.'
            : 'Structured Iconic bodymod replacer profiles with tier-based packages, concept notes, and preserved imported forms.'
        }
        badge={selectedJumper ? `${selectedJumper.name} | ${workspace.bodymodProfiles.length} profiles` : `${workspace.bodymodProfiles.length} profiles`}
        actions={
          selectedJumper ? (
            <>
              {simpleMode ? (
                <button className="button button--secondary" type="button" onClick={handleReopenGuide}>
                  {guideRequested && !bodymodGuideState.dismissed ? 'Guide Open' : 'Reopen Setup'}
                </button>
              ) : null}
              <Link className="button button--secondary" to={`/chains/${chainId}/jumpers?jumper=${selectedJumper.id}`}>
                Open Jumper
              </Link>
            </>
          ) : undefined
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={profileAutosave.status} />
      <SimpleModeAffirmation message={simpleAffirmation} />

      {simpleMode && guideRequested && currentGuideStepId && !bodymodGuideState.dismissed ? (
        <SimpleModeGuideFrame
          title={selectedJumper ? `${selectedJumper.name} Iconic setup` : 'Iconic setup'}
          steps={bodymodGuideSteps}
          currentStepId={currentGuideStepId}
          acknowledgedStepIds={bodymodGuideState.acknowledgedStepIds}
          onStepChange={(stepId) => handleGuideStepChange(stepId as BodymodGuideStepId)}
          onDismiss={handleGuideDismiss}
        >
          <div className="actions">
            {currentGuideStepId !== 'create-profile' ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => handleGuideStepChange(currentGuideStepId === 'signature-package' ? 'tier-and-concept' : 'create-profile')}
              >
                Back
              </button>
            ) : null}
            <button className="button" type="button" onClick={handleGuideContinue}>
              {currentGuideStepId === 'create-profile' && !draftProfile
                ? 'Create Profile'
                : currentGuideStepId === 'signature-package'
                  ? 'Finish Iconic Setup'
                  : 'Continue'}
            </button>
          </div>
        </SimpleModeGuideFrame>
      ) : null}

      {simpleMode ? (
        <details className="details-panel" open={iconicStartedForSelectedJumper}>
          <summary className="details-panel__summary">
            <span>{iconicSetupGuide.title}</span>
            <div className="inline-meta">
              <ReadinessPill tone="optional" label={iconicStartedForSelectedJumper ? 'In progress' : 'Optional later'} />
              <span className="pill">Simple page guide</span>
            </div>
          </summary>
          <div className="details-panel__body stack stack--compact">
            <PlainLanguageHint
              term="Iconic"
              meaning="an optional continuity profile that helps a jumper stay recognizable through harsh resets or restrictions."
            />
            <p>{iconicSetupGuide.summary}</p>
            <SetupGuidePanels guide={iconicSetupGuide} />
          </div>
        </details>
      ) : null}

      <section className="workspace-two-column">
        <aside className="card stack">
          <div className="section-heading">
            <h3>Jumpers</h3>
            <span className="pill">{workspace.activeBranch.title}</span>
          </div>
          <div className="selection-list">
            {workspace.jumpers.map((jumper) => {
              const jumperProfile = workspace.bodymodProfiles.find((entry) => entry.jumperId === jumper.id) ?? null;

              return (
                <button
                  key={jumper.id}
                  className={`selection-list__item${selectedJumper?.id === jumper.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() =>
                    setSearchParams((currentParams) => {
                      const nextParams = new URLSearchParams(currentParams);
                      nextParams.set('jumper', jumper.id);
                      return nextParams;
                    })
                  }
                >
                  <strong>{jumper.name}</strong>
                  <span>{getProfileStatusLabel(jumperProfile)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="card stack">
          {selectedJumper ? (
            <>
              <div className="section-heading">
                <h3>{selectedJumper.name}</h3>
                {!draftProfile ? (
                  <button className="button" type="button" onClick={() => void handleCreateProfile()}>
                    Create Iconic Profile
                  </button>
                ) : (
                  <div className="inline-meta">
                    <span className="pill">{getProfileStatusLabel(draftProfile)}</span>
                    <span className="pill pill--soft">Tied to {selectedJumper.name}</span>
                  </div>
                )}
              </div>

              {!draftProfile ? (
                <p>
                  No Iconic profile exists for this jumper yet.
                  {simpleMode ? ' That is fine if you are still working through the core chain flow.' : ''}
                </p>
              ) : (
                <IconicEditor
                  profile={draftProfile}
                  onChange={(nextProfile) => profileAutosave.updateDraft(nextProfile)}
                  showAdvancedJson
                />
              )}
            </>
          ) : null}
        </article>
      </section>
    </div>
  );
}
