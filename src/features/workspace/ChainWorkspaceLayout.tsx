import { useEffect, useState } from 'react';
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

type ModuleKey =
  | 'overview'
  | 'jumpers'
  | 'jumps'
  | 'participation'
  | 'effects'
  | 'rules'
  | 'bodymod'
  | 'timeline'
  | 'notes'
  | 'backups';

interface WorkspaceModuleMenuItem {
  key: ModuleKey;
  label: string;
  description: string;
  to: string | null;
}

function getModuleGroupId(moduleKey: ModuleKey) {
  switch (moduleKey) {
    case 'overview':
    case 'jumpers':
    case 'jumps':
    case 'participation':
      return 'core';
    case 'effects':
    case 'rules':
    case 'bodymod':
      return 'systems';
    case 'timeline':
    case 'notes':
    case 'backups':
      return 'history';
    default:
      return 'core';
  }
}

function getActiveModuleKey(pathname: string): ModuleKey {
  if (pathname.includes('/participation/')) {
    return 'participation';
  }

  if (pathname.includes('/jumpers')) {
    return 'jumpers';
  }

  if (pathname.includes('/jumps')) {
    return 'jumps';
  }

  if (pathname.includes('/effects')) {
    return 'effects';
  }

  if (pathname.includes('/rules')) {
    return 'rules';
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
  const [openModuleGroups, setOpenModuleGroups] = useState<string[]>(['core']);
  const activeModuleKey = getActiveModuleKey(location.pathname);
  const activeModuleGroupId = getModuleGroupId(activeModuleKey);
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

  useEffect(() => {
    setOpenModuleGroups((currentGroups) =>
      currentGroups.includes(activeModuleGroupId) ? currentGroups : [...currentGroups, activeModuleGroupId],
    );
  }, [activeModuleGroupId]);

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
      case 'jumps':
        return currentJump
          ? `/chains/${resolvedChainId}/jumps/${currentJump.id}`
          : `/chains/${resolvedChainId}/jumps`;
      case 'participation':
        return currentJump ? `/chains/${resolvedChainId}/participation/${currentJump.id}${buildSearch(selectedJumperId)}` : null;
      case 'effects':
        return `/chains/${resolvedChainId}/effects`;
      case 'rules':
        return `/chains/${resolvedChainId}/rules`;
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
    summary: string;
    items: WorkspaceModuleMenuItem[];
  }> = [
    {
      id: 'core',
      title: 'Core Flow',
      summary: 'Overview, roster, jumps, and current participation.',
      items: [
        {
          key: 'overview',
          label: 'Overview',
          description: 'Branch summary and current jump control room.',
          to: getModulePath('overview'),
        },
        {
          key: 'jumpers',
          label: 'Jumpers',
          description: 'Roster, identities, and baseline editor access.',
          to: getModulePath('jumpers'),
        },
        {
          key: 'jumps',
          label: 'Jumps',
          description: 'Timeline order, statuses, and jump membership.',
          to: getModulePath('jumps'),
        },
        {
          key: 'participation',
          label: 'Participation',
          description: currentJump ? `Selections for ${currentJump.title}.` : 'Pick a current jump to unlock participation.',
          to: getModulePath('participation'),
        },
      ],
    },
    {
      id: 'systems',
      title: 'Systems',
      summary: 'Effects, rules, and bodymod continuity layers.',
      items: [
        {
          key: 'effects',
          label: 'Effects',
          description: 'Scoped perks, drawbacks, statuses, and rule overrides.',
          to: getModulePath('effects'),
        },
        {
          key: 'rules',
          label: 'Rules',
          description: 'Current-jump rules, presets, and branch defaults.',
          to: getModulePath('rules'),
        },
        {
          key: 'bodymod',
          label: 'Bodymod',
          description: 'Forms, features, and baseline profiles.',
          to: getModulePath('bodymod'),
        },
      ],
    },
    {
      id: 'history',
      title: 'History & Recovery',
      summary: 'Timeline review, notes, backups, and branch recovery.',
      items: [
        {
          key: 'timeline',
          label: 'Timeline',
          description: 'Jump order, branches, and continuity markers.',
          to: getModulePath('timeline'),
        },
        {
          key: 'notes',
          label: 'Notes',
          description: 'Chain, jump, and jumper notes in one place.',
          to: getModulePath('notes'),
        },
        {
          key: 'backups',
          label: 'Backups',
          description: 'Snapshots, exports, restores, and branch forks.',
          to: getModulePath('backups'),
        },
      ],
    },
  ];
  function toggleModuleGroup(groupId: string) {
    setOpenModuleGroups((currentGroups) =>
      currentGroups.includes(groupId)
        ? currentGroups.filter((currentGroupId) => currentGroupId !== groupId)
        : [...currentGroups, groupId],
    );
  }

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
            <p>
              Navigate from the rail, switch jumpers and jumps from menus, and keep the working branch visible without
              wasting half the screen on chrome.
            </p>
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

            <p className="workspace-sidebar-copy">
              The rail keeps the big navigation jobs in menus and leaves the buttons for the three most common context
              jumps.
            </p>
          </section>

          <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
            <div className="section-heading">
              <h3>Module Menu</h3>
              <span className="pill">{activeModuleKey}</span>
            </div>
            {moduleGroups.map((group) => (
              <details
                key={group.id}
                className="details-panel workspace-module-group"
                open={openModuleGroups.includes(group.id)}
              >
                <summary
                  className="details-panel__summary workspace-module-group__summary"
                  onClick={(event) => {
                    event.preventDefault();
                    toggleModuleGroup(group.id);
                  }}
                >
                  <strong>{group.title}</strong>
                  <span>{group.summary}</span>
                </summary>
                <div className="details-panel__body workspace-module-group__body">
                  <nav className="workspace-menu-list" aria-label={group.title}>
                    {group.items.map((item) =>
                      item.to ? (
                        <NavLink
                          key={item.key}
                          className={({ isActive }) =>
                            `workspace-menu-item${isActive ? ' active' : ''}`
                          }
                          to={item.to}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </NavLink>
                      ) : (
                        <span
                          key={item.key}
                          className="workspace-menu-item workspace-menu-item--disabled"
                          aria-disabled="true"
                        >
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </span>
                      ),
                    )}
                  </nav>
                </div>
              </details>
            ))}
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
