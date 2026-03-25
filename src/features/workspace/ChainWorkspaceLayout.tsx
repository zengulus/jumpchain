import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle, switchActiveJump } from '../../db/persistence';

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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const resolvedChainId = chainId;
  const workspace = state.workspace;
  const activeBranch = workspace.activeBranch;
  const currentJump = workspace.currentJump;
  const selectedJumperId = searchParams.get('jumper') ?? workspace.jumpers[0]?.id ?? '';

  function buildSearch(nextJumperId: string) {
    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextJumperId) {
      nextSearchParams.set('jumper', nextJumperId);
    } else {
      nextSearchParams.delete('jumper');
    }

    const nextSearch = nextSearchParams.toString();
    return nextSearch.length > 0 ? `?${nextSearch}` : '';
  }

  function openJumperRoute(nextJumperId: string, target: 'jumpers' | 'bodymod' | 'participation') {
    const search = buildSearch(nextJumperId);

    if (target === 'jumpers') {
      navigate(`/chains/${resolvedChainId}/jumpers${search}`);
      return;
    }

    if (target === 'bodymod') {
      navigate(`/chains/${resolvedChainId}/bodymod${search}`);
      return;
    }

    if (currentJump) {
      navigate(`/chains/${resolvedChainId}/participation/${currentJump.id}${search}`);
    }
  }

  async function handleQuickJumpChange(nextJumpId: string) {
    if (!nextJumpId) {
      return;
    }

    await switchActiveJump(resolvedChainId, nextJumpId);

    if (location.pathname.endsWith('/jumps') || location.pathname.includes('/jumps/')) {
      navigate(`/chains/${resolvedChainId}/jumps/${nextJumpId}${location.search}`);
      return;
    }

    if (location.pathname.includes('/participation/')) {
      navigate(`/chains/${resolvedChainId}/participation/${nextJumpId}${location.search}`);
    }
  }

  function handleQuickJumperChange(nextJumperId: string) {
    const search = buildSearch(nextJumperId);

    if (location.pathname.includes('/jumpers')) {
      navigate(`/chains/${resolvedChainId}/jumpers${search}`);
      return;
    }

    if (location.pathname.includes('/bodymod')) {
      navigate(`/chains/${resolvedChainId}/bodymod${search}`);
      return;
    }

    if (location.pathname.includes('/participation/')) {
      navigate(`${location.pathname}${search}`);
      return;
    }

    navigate(`${location.pathname}${search}`);
  }

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

      <div className="workspace-frame">
        <aside className="workspace-sidebar">
          <section className="workspace-sidebar-card stack">
            <div className="section-heading">
              <h3>Workspace Focus</h3>
              <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
            </div>
            <div className="summary-grid">
              <div className="metric">
                <strong>{workspace.jumpers.length}</strong>
                Jumpers
              </div>
              <div className="metric">
                <strong>{workspace.jumps.length}</strong>
                Jumps
              </div>
              <div className="metric">
                <strong>{workspace.effects.length}</strong>
                Effects
              </div>
              <div className="metric">
                <strong>{workspace.snapshots.length}</strong>
                Snapshots
              </div>
            </div>
            <p className="workspace-sidebar-copy">
              Current jump: <strong>{currentJump?.title ?? 'None selected'}</strong>
            </p>
            <p className="workspace-sidebar-copy">
              Modules stay pinned in a left rail so desktop editing flows don&apos;t bounce around between pages.
            </p>
          </section>

          <section className="workspace-sidebar-card stack">
            <div className="section-heading">
              <h3>Quick Switch</h3>
              <span className="pill">global</span>
            </div>

            <label className="field">
              <span>Jump</span>
              <select
                value={currentJump?.id ?? ''}
                onChange={(event) => void handleQuickJumpChange(event.target.value)}
                disabled={workspace.jumps.length === 0}
              >
                {workspace.jumps.map((jump) => (
                  <option key={jump.id} value={jump.id}>
                    {jump.orderIndex + 1}. {jump.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Jumper</span>
              <select
                value={selectedJumperId}
                onChange={(event) => handleQuickJumperChange(event.target.value)}
                disabled={workspace.jumpers.length === 0}
              >
                {workspace.jumpers.map((jumper) => (
                  <option key={jumper.id} value={jumper.id}>
                    {jumper.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="actions workspace-quick-actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'jumpers')}
                disabled={!selectedJumperId}
              >
                Open Jumper
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'bodymod')}
                disabled={!selectedJumperId}
              >
                Open Bodymod
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'participation')}
                disabled={!currentJump}
              >
                Open Participation
              </button>
            </div>

            <p className="workspace-sidebar-copy">
              Jump switching updates the chain&apos;s active jump. Jumper switching follows you into jumper, bodymod, and
              participation editors through the URL.
            </p>
          </section>

          <nav className="workspace-subnav" aria-label="Chain modules">
            {workspaceLinks.map(([path, label]) => (
              <NavLink key={path} to={`/chains/${resolvedChainId}/${path}`}>
                {label}
              </NavLink>
            ))}
            {currentJump ? (
              <NavLink to={`/chains/${resolvedChainId}/participation/${currentJump.id}`}>Participation</NavLink>
            ) : null}
          </nav>
        </aside>

        <section className="workspace-content">
          <Outlet
            context={{
              chainId: resolvedChainId,
              bundle: state.bundle,
              workspace,
            } satisfies ChainWorkspaceOutletContext}
          />
        </section>
      </div>
    </div>
  );
}
