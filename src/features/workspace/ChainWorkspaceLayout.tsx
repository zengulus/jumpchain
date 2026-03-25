import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle } from '../../db/persistence';

export interface ChainWorkspaceOutletContext {
  chainId: string;
  bundle: NativeChainBundle;
  workspace: BranchWorkspace;
}

interface WorkspaceState {
  status: 'ready' | 'missing-chain' | 'missing-param';
  bundle?: NativeChainBundle;
  workspace?: BranchWorkspace;
}

const workspaceLinks = [
  ['overview', 'Overview'],
  ['jumpers', 'Jumpers'],
  ['jumps', 'Jumps'],
  ['effects', 'Effects'],
  ['rules', 'Rules'],
  ['bodymod', 'Bodymod'],
  ['timeline', 'Timeline'],
  ['notes', 'Notes'],
  ['backups', 'Backups'],
] as const;

export function ChainWorkspaceLayout() {
  const { chainId } = useParams();
  const state = useLiveQuery(async (): Promise<WorkspaceState> => {
      if (!chainId) {
        return { status: 'missing-param' };
      }

      const bundle = await getChainBundle(chainId);

      if (!bundle) {
        return { status: 'missing-chain' };
      }

      return {
        status: 'ready',
        bundle,
        workspace: buildBranchWorkspace(bundle, bundle.chain.activeBranchId),
      };
    }, [chainId]);

  if (!chainId) {
    return <Navigate to="/" replace />;
  }

  if (!state) {
    return (
      <section className="card stack">
        <h2>Loading chain workspace</h2>
        <p>Pulling the active branch, jump timeline, and module records out of IndexedDB.</p>
      </section>
    );
  }

  if (state.status !== 'ready' || !state.bundle || !state.workspace) {
    return (
      <section className="card stack">
        <h2>Chain not found</h2>
        <p>This chain is not available in IndexedDB anymore. Return to Home and create or import one again.</p>
      </section>
    );
  }

  const activeBranch = state.workspace.activeBranch;
  const currentJump = state.workspace.currentJump;

  return (
    <div className="workspace-shell stack">
      <section className="workspace-hero">
        <div className="stack stack--compact">
          <span className="pill">Active workspace</span>
          <h2>{state.bundle.chain.title}</h2>
          <p>
            Working branch: <strong>{activeBranch?.title ?? 'Unavailable'}</strong>
            {currentJump ? ` | Current jump: ${currentJump.title}` : ' | No current jump selected yet'}
          </p>
        </div>
      </section>

      <nav className="workspace-subnav" aria-label="Chain modules">
        {workspaceLinks.map(([path, label]) => (
          <NavLink key={path} to={`/chains/${chainId}/${path}`}>
            {label}
          </NavLink>
        ))}
        {currentJump ? (
          <NavLink to={`/chains/${chainId}/participation/${currentJump.id}`}>Participation</NavLink>
        ) : null}
      </nav>

      <Outlet
        context={{
          chainId,
          bundle: state.bundle,
          workspace: state.workspace,
        } satisfies ChainWorkspaceOutletContext}
      />
    </div>
  );
}
