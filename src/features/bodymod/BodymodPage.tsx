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
  SimpleModeAffirmation,
  StatusNoticeBanner,
  type StatusNotice,
  WorkspaceModuleHeader,
  useSimpleModeAffirmation,
} from '../workspace/shared';
import { useAutosaveRecord } from '../workspace/useAutosaveRecord';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function BodymodPage() {
  const { simpleMode } = useUiPreferences();
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

  useEffect(() => {
    clearAffirmation();
  }, [clearAffirmation, selectedJumperId]);

  async function handleCreateProfile() {
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
            ? 'Set the jumper-tied Iconic profile without losing sight of the core concept.'
            : 'Structured Iconic bodymod replacer profiles with tier-based packages, concept notes, and preserved imported forms.'
        }
        badge={selectedJumper ? `${selectedJumper.name} | ${workspace.bodymodProfiles.length} profiles` : `${workspace.bodymodProfiles.length} profiles`}
        actions={
          selectedJumper ? (
            <Link className="button button--secondary" to={`/chains/${chainId}/jumpers?jumper=${selectedJumper.id}`}>
              Open Jumper
            </Link>
          ) : undefined
        }
      />

      <StatusNoticeBanner notice={notice} />
      <AutosaveStatusIndicator status={profileAutosave.status} />
      <SimpleModeAffirmation message={simpleAffirmation} />

      {simpleMode ? (
        <details className="details-panel" open>
          <summary className="details-panel__summary">
            <span>{iconicSetupGuide.title}</span>
            <span className="pill">Simple page guide</span>
          </summary>
          <div className="details-panel__body stack stack--compact">
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
                <p>No Iconic profile exists for this jumper yet.</p>
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
