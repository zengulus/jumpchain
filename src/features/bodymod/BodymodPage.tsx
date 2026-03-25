import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bodymodModes } from '../../domain/common';
import { db } from '../../db/database';
import { createBlankBodymodProfile, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function BodymodPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const selectedJumperId = searchParams.get('jumper') ?? workspace.jumpers[0]?.id ?? null;
  const selectedJumper = workspace.jumpers.find((jumper) => jumper.id === selectedJumperId) ?? workspace.jumpers[0] ?? null;
  const profile = selectedJumper
    ? workspace.bodymodProfiles.find((entry) => entry.jumperId === selectedJumper.id) ?? null
    : null;

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
        message: 'Created a bodymod profile for this jumper.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create bodymod profile.',
      });
    }
  }

  async function saveProfile(nextValue: typeof profile) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.bodymodProfiles, nextValue);
      setNotice({
        tone: 'success',
        message: 'Bodymod changes autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save bodymod changes.',
      });
    }
  }

  if (!workspace.activeBranch) {
    return <EmptyWorkspaceCard title="No active branch" body="Create or restore a branch before editing bodymod data." />;
  }

  if (workspace.jumpers.length === 0) {
    return <EmptyWorkspaceCard title="No jumpers available" body="Create a jumper first, then define a bodymod profile." />;
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Bodymod"
        description="One profile per jumper, with a simple summary up front and imported altforms preserved in advanced data blocks."
        badge={`${workspace.bodymodProfiles.length} profiles`}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="workspace-two-column">
        <aside className="card stack">
          <div className="section-heading">
            <h3>Jumpers</h3>
            <span className="pill">{workspace.activeBranch.title}</span>
          </div>
          <div className="selection-list">
            {workspace.jumpers.map((jumper) => (
              <button
                key={jumper.id}
                className={`selection-list__item${selectedJumper?.id === jumper.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setSearchParams({ jumper: jumper.id })}
              >
                <strong>{jumper.name}</strong>
                <span>{workspace.bodymodProfiles.some((entry) => entry.jumperId === jumper.id) ? 'profile ready' : 'no profile yet'}</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="card stack">
          {selectedJumper ? (
            <>
              <div className="section-heading">
                <h3>{selectedJumper.name}</h3>
                {!profile ? (
                  <button className="button" type="button" onClick={() => void handleCreateProfile()}>
                    Create Profile
                  </button>
                ) : null}
              </div>

              {!profile ? (
                <p>No bodymod profile exists for this jumper yet.</p>
              ) : (
                <>
                  <section className="stack stack--compact">
                    <h4>Simple</h4>
                    <div className="field-grid field-grid--two">
                      <label className="field">
                        <span>Mode</span>
                        <select
                          value={profile.mode}
                          onChange={(event) =>
                            void saveProfile({
                              ...profile,
                              mode: event.target.value as (typeof bodymodModes)[number],
                            })
                          }
                        >
                          {bodymodModes.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Summary</span>
                        <input
                          value={profile.summary}
                          onChange={(event) =>
                            void saveProfile({
                              ...profile,
                              summary: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  </section>

                  <section className="stack stack--compact">
                    <h4>Advanced</h4>
                    <JsonEditorField
                      label="Forms"
                      value={profile.forms}
                      onValidChange={(value) =>
                        saveProfile({
                          ...profile,
                          forms: Array.isArray(value) ? (value as typeof profile.forms) : [],
                        })
                      }
                    />
                    <JsonEditorField
                      label="Features"
                      value={profile.features}
                      onValidChange={(value) =>
                        saveProfile({
                          ...profile,
                          features: Array.isArray(value) ? (value as typeof profile.features) : [],
                        })
                      }
                    />
                    <JsonEditorField
                      label="Import source metadata"
                      value={profile.importSourceMetadata}
                      onValidChange={(value) =>
                        saveProfile({
                          ...profile,
                          importSourceMetadata:
                            typeof value === 'object' && value !== null && !Array.isArray(value)
                              ? (value as Record<string, unknown>)
                              : {},
                        })
                      }
                    />
                  </section>
                </>
              )}
            </>
          ) : null}
        </article>
      </section>
    </div>
  );
}
