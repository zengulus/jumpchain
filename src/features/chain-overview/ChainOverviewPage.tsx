import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getEffectiveCurrentJumpState } from '../../domain/chain/selectors';
import { switchActiveBranch, switchActiveJump } from '../../db/persistence';
import { StatusNoticeBanner, type StatusNotice, WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export function ChainOverviewPage() {
  const { chainId, bundle, workspace } = useChainWorkspace();
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const effectiveState = getEffectiveCurrentJumpState(workspace);
  const latestSnapshot = workspace.snapshots.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

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
        description="A thin control room for the active branch, current jump, and effective-state summary."
        badge={`Schema v${bundle.chain.schemaVersion}`}
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

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Chain Summary</h3>
            <span className="pill">{workspace.branches.length} branches</span>
          </div>
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
              <strong>{workspace.effects.length}</strong>
              Effects
            </span>
            <span className="metric">
              <strong>{workspace.notes.length}</strong>
              Notes
            </span>
          </div>
          <p>
            Native format <strong>{bundle.chain.formatVersion}</strong> | updated {formatTimestamp(bundle.chain.updatedAt)}
          </p>
          <p>
            Narratives: <strong>{bundle.chain.chainSettings.narratives}</strong> | Alt forms:{' '}
            <strong>{bundle.chain.chainSettings.altForms ? 'enabled' : 'disabled'}</strong> | Bank:{' '}
            <strong>{bundle.chain.bankSettings.enabled ? 'enabled' : 'disabled'}</strong>
          </p>
        </article>

        <article className="card stack">
          <div className="section-heading">
            <h3>Active Selection</h3>
            <span className="pill">{workspace.activeBranch?.title ?? 'No branch'}</span>
          </div>
          <label className="field">
            <span>Active branch</span>
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
            <span>Current jump</span>
            <select
              value={workspace.currentJump?.id ?? ''}
              onChange={(event) => void handleJumpChange(event.target.value || null)}
            >
              <option value="">No current jump</option>
              {workspace.jumps.map((jump) => (
                <option key={jump.id} value={jump.id}>
                  {jump.orderIndex + 1}. {jump.title}
                </option>
              ))}
            </select>
          </label>
        </article>
      </section>

      <section className="grid grid--two">
        <article className="card stack">
          <div className="section-heading">
            <h3>Current Jump Rules</h3>
            <span className="pill">{effectiveState.currentJump?.title ?? 'No jump'}</span>
          </div>
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
            <p>No snapshots exist for the active branch yet.</p>
          )}
          <Link className="button button--secondary" to={`/chains/${chainId}/backups`}>
            Open Recovery Tools
          </Link>
        </article>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Quick Route Deck</h3>
          <span className="pill">Thin data UI</span>
        </div>
        <div className="actions">
          <Link className="button button--secondary" to={`/chains/${chainId}/jumpers`}>
            Jumpers
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/companions`}>
            Companions
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/jumps`}>
            Jumps
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/effects`}>
            Effects
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/rules`}>
            Chainwide Rules
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/current-jump-rules`}>
            Current Jump Rules
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/bodymod`}>
            Iconic
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/personal-reality`}>
            Personal Reality
          </Link>
          <Link className="button button--secondary" to={`/chains/${chainId}/notes`}>
            Notes
          </Link>
        </div>
      </section>
    </div>
  );
}
