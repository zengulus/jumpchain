import { useState } from 'react';
import { accessModes } from '../../domain/common';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import { db } from '../../db/database';
import type { JumpRulesContext } from '../../domain/rules/types';
import { createBlankJumpRulesContext, saveChainRecord } from '../workspace/records';
import { EmptyWorkspaceCard, JsonEditorField, StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

export function CurrentJumpRulesPage() {
  const { chainId, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const currentJump = effectiveState.currentJump;
  const currentRulesContext = effectiveState.currentRulesContext;

  async function handleCreateContext() {
    if (!workspace.activeBranch || !currentJump) {
      return;
    }

    try {
      await saveChainRecord(
        db.jumpRulesContexts,
        createBlankJumpRulesContext(chainId, workspace.activeBranch.id, currentJump.id, workspace.chain.chainSettings.altForms),
      );
      setNotice({
        tone: 'success',
        message: 'Created a jump rules context for the current jump.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to create jump rules context.',
      });
    }
  }

  async function saveRulesContext(nextValue: typeof currentRulesContext) {
    if (!nextValue) {
      return;
    }

    try {
      await saveChainRecord(db.jumpRulesContexts, nextValue);
      setNotice({
        tone: 'success',
        message: 'Current-jump rules autosaved.',
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save current-jump rules.',
      });
    }
  }

  if (!currentJump) {
    return (
      <EmptyWorkspaceCard
        title="No current jump selected"
        body="Set an active jump from Overview or the Jumps module before editing current-jump rules."
      />
    );
  }

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Current Jump Rules"
        description="Jump-local rules context plus an effective-state summary that folds in active rule effects."
        badge={currentJump.title}
      />

      <StatusNoticeBanner notice={notice} />

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Effective State</h3>
            <span className="pill">{effectiveState.gauntlet ? 'gauntlet' : 'standard'}</span>
          </div>
          <div className="inline-meta">
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
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.altFormAccess}</strong>
              Alt forms
            </span>
            <span className="metric">
              <strong>{effectiveState.effectiveAccessModes.supplementAccess}</strong>
              Supplements
            </span>
          </div>
          <p>
            {effectiveState.contributingEffects.length} active effects are contributing to the rule summary for this jump.
          </p>
          {effectiveState.contributingEffects.length > 0 ? (
            <ul className="list">
              {effectiveState.contributingEffects.map((effect) => (
                <li key={effect.id}>
                  <strong>{effect.title}</strong> ({effect.category}, {effect.state})
                </li>
              ))}
            </ul>
          ) : (
            <p>No active scoped effects are currently influencing the rules summary.</p>
          )}
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Rules Context</h3>
            <span className="pill">{currentRulesContext ? 'editable' : 'not created yet'}</span>
          </div>
          {!currentRulesContext ? (
            <>
              <p>
                This jump is currently using fallback defaults plus rule effects. Create a dedicated rules context when
                you want explicit per-jump settings.
              </p>
              <div className="actions">
                <button className="button" type="button" onClick={() => void handleCreateContext()}>
                  Create Rules Context
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field field--checkbox">
                <input
                  type="checkbox"
                  checked={currentRulesContext.gauntlet}
                  onChange={(event) =>
                    void saveRulesContext({
                      ...currentRulesContext,
                      gauntlet: event.target.checked,
                    })
                  }
                />
                <span>Gauntlet state</span>
              </label>

              <div className="field-grid field-grid--two">
                {(['warehouseAccess', 'powerAccess', 'itemAccess', 'altFormAccess', 'supplementAccess'] as const).map(
                  (key) => (
                    <label className="field" key={key}>
                      <span>{key}</span>
                      <select
                        value={currentRulesContext[key]}
                        onChange={(event) =>
                          void saveRulesContext(
                            {
                              ...currentRulesContext,
                              [key]: event.target.value as (typeof accessModes)[number],
                            } as JumpRulesContext,
                          )
                        }
                      >
                        {accessModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </label>
                  ),
                )}
              </div>

              <label className="field">
                <span>Notes</span>
                <textarea
                  rows={6}
                  value={currentRulesContext.notes}
                  onChange={(event) =>
                    void saveRulesContext({
                      ...currentRulesContext,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              <JsonEditorField
                label="Import source metadata"
                value={currentRulesContext.importSourceMetadata}
                onValidChange={(value) =>
                  saveRulesContext({
                    ...currentRulesContext,
                    importSourceMetadata:
                      typeof value === 'object' && value !== null && !Array.isArray(value)
                        ? (value as Record<string, unknown>)
                        : {},
                  })
                }
              />
            </>
          )}
        </article>
      </section>
    </div>
  );
}
