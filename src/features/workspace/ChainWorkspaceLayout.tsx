import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

type ModuleKey =
  | 'overview'
  | 'jumpers'
  | 'companions'
  | 'jumps'
  | 'participation'
  | 'effects'
  | 'chainwide-rules'
  | 'current-jump-rules'
  | 'bodymod'
  | 'timeline'
  | 'notes'
  | 'backups';

interface WorkspaceModuleMenuItem {
  key: ModuleKey;
  label: string;
  to: string | null;
}

function getActiveModuleKey(pathname: string): ModuleKey {
  if (pathname.includes('/participation/')) {
    return 'participation';
  }

  if (pathname.includes('/jumpers')) {
    return 'jumpers';
  }

  if (pathname.includes('/companions')) {
    return 'companions';
  }

  if (pathname.includes('/jumps')) {
    return 'jumps';
  }

  if (pathname.includes('/effects')) {
    return 'effects';
  }

  if (pathname.includes('/current-jump-rules')) {
    return 'current-jump-rules';
  }

  if (pathname.includes('/rules')) {
    return 'chainwide-rules';
  }

  if (pathname.includes('/bodymod')) {
    return 'bodymod';
  }

  if (pathname.includes('/timeline')) {
    return 'timeline';
  }

  if (pathname.includes('/notes')) {
    return 'notes';
  }

  if (pathname.includes('/backups')) {
    return 'backups';
  }

  return 'overview';
}

export function ChainWorkspaceLayout() {
  const { chainId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeModuleKey = getActiveModuleKey(location.pathname);
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

  function getModulePath(moduleKey: ModuleKey) {
    switch (moduleKey) {
      case 'overview':
        return `/chains/${resolvedChainId}/overview`;
      case 'jumpers':
        return `/chains/${resolvedChainId}/jumpers${buildSearch(selectedJumperId)}`;
      case 'companions':
        return `/chains/${resolvedChainId}/companions`;
      case 'jumps':
        return currentJump
          ? `/chains/${resolvedChainId}/jumps/${currentJump.id}`
          : `/chains/${resolvedChainId}/jumps`;
      case 'participation':
        return currentJump ? `/chains/${resolvedChainId}/participation/${currentJump.id}${buildSearch(selectedJumperId)}` : null;
      case 'effects':
        return `/chains/${resolvedChainId}/effects`;
      case 'chainwide-rules':
        return `/chains/${resolvedChainId}/rules`;
      case 'current-jump-rules':
        return `/chains/${resolvedChainId}/current-jump-rules`;
      case 'bodymod':
        return `/chains/${resolvedChainId}/bodymod${buildSearch(selectedJumperId)}`;
      case 'timeline':
        return `/chains/${resolvedChainId}/timeline`;
      case 'notes':
        return `/chains/${resolvedChainId}/notes`;
      case 'backups':
        return `/chains/${resolvedChainId}/backups`;
      default:
        return `/chains/${resolvedChainId}/overview`;
    }
  }

  function handleModuleMenuChange(nextModuleKey: string) {
    const destination = getModulePath(nextModuleKey as ModuleKey);

    if (!destination) {
      return;
    }

    navigate(destination);
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

  const moduleGroups: Array<{
    id: string;
    title: string;
    items: WorkspaceModuleMenuItem[];
  }> = [
    {
      id: 'core',
      title: 'Core Flow',
      items: [
        {
          key: 'overview',
          label: 'Overview',
          to: getModulePath('overview'),
        },
        {
          key: 'jumpers',
          label: 'Jumpers',
          to: getModulePath('jumpers'),
        },
        {
          key: 'companions',
          label: 'Companions',
          to: getModulePath('companions'),
        },
        {
          key: 'jumps',
          label: 'Jumps',
          to: getModulePath('jumps'),
        },
        {
          key: 'participation',
          label: 'Participation',
          to: getModulePath('participation'),
        },
      ],
    },
    {
      id: 'systems',
      title: 'Systems',
      items: [
        {
          key: 'effects',
          label: 'Effects',
          to: getModulePath('effects'),
        },
        {
          key: 'chainwide-rules',
          label: 'Chainwide Rules',
          to: getModulePath('chainwide-rules'),
        },
        {
          key: 'current-jump-rules',
          label: 'Current Jump Rules',
          to: getModulePath('current-jump-rules'),
        },
        {
          key: 'bodymod',
          label: 'Bodymod',
          to: getModulePath('bodymod'),
        },
      ],
    },
    {
      id: 'history',
      title: 'History & Recovery',
      items: [
        {
          key: 'timeline',
          label: 'Timeline',
          to: getModulePath('timeline'),
        },
        {
          key: 'notes',
          label: 'Notes',
          to: getModulePath('notes'),
        },
        {
          key: 'backups',
          label: 'Backups',
          to: getModulePath('backups'),
        },
      ],
    },
  ];
  return (
    <div className="workspace-shell stack">
      <section className="workspace-hero">
        <div className="workspace-hero__top">
          <div className="stack stack--compact">
            <div className="inline-meta">
              <span className="pill">Active workspace</span>
              <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
              <span className="pill">{currentJump ? `Current: ${currentJump.title}` : 'No current jump'}</span>
            </div>
            <h2>{state.bundle.chain.title}</h2>
          </div>
          <div className="workspace-hero__stats">
            <span className="metric">
              <strong>{workspace.jumpers.length}</strong>
              Jumpers
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
              <strong>{workspace.snapshots.length}</strong>
              Snapshots
            </span>
          </div>
        </div>
      </section>

      <div className="workspace-frame">
        <aside className="workspace-sidebar">
          <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
            <div className="section-heading">
              <h3>Context</h3>
              <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
            </div>
            <div className="workspace-context-title">
              <strong>{state.bundle.chain.title}</strong>
              <span>{currentJump ? `Current jump: ${currentJump.title}` : 'Current jump: None selected'}</span>
            </div>
            <div className="workspace-stat-strip" aria-label="Workspace totals">
              <div className="workspace-stat-chip">
                <strong>{workspace.jumpers.length}</strong>
                <span>Jumpers</span>
              </div>
              <div className="workspace-stat-chip">
                <strong>{workspace.jumps.length}</strong>
                <span>Jumps</span>
              </div>
              <div className="workspace-stat-chip">
                <strong>{workspace.effects.length}</strong>
                <span>Effects</span>
              </div>
              <div className="workspace-stat-chip">
                <strong>{workspace.snapshots.length}</strong>
                <span>Snapshots</span>
              </div>
            </div>
          </section>

          <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
            <div className="section-heading">
              <h3>Navigator</h3>
              <span className="pill">Menus</span>
            </div>

            <label className="field">
              <span>Go to module</span>
              <select value={activeModuleKey} onChange={(event) => handleModuleMenuChange(event.target.value)}>
                {moduleGroups.map((group) => (
                  <optgroup key={group.id} label={group.title}>
                    {group.items.map((item) => (
                      <option key={item.key} value={item.key} disabled={!item.to}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="workspace-switch-grid">
              <label className="field">
                <span>Jumper focus</span>
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
            </div>

            <div className="workspace-utility-row">
              <button
                className="button button--secondary workspace-utility-button"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'jumpers')}
                disabled={!selectedJumperId}
              >
                Jumpers
              </button>
              <button
                className="button button--secondary workspace-utility-button"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'participation')}
                disabled={!currentJump}
              >
                Participation
              </button>
              <button
                className="button button--secondary workspace-utility-button"
                type="button"
                onClick={() => openJumperRoute(selectedJumperId, 'bodymod')}
                disabled={!selectedJumperId}
              >
                Bodymod
              </button>
            </div>
          </section>
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
