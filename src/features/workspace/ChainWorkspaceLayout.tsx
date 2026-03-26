import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { usePageShellNav } from '../../components/PageShell';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle, switchActiveJump } from '../../db/persistence';
import { AssistiveHint, TooltipFrame } from './shared';

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
  | 'personal-reality'
  | 'timeline'
  | 'notes'
  | 'backups';

interface WorkspaceModuleMenuItem {
  key: ModuleKey;
  label: string;
  to: string | null;
}

interface WorkspaceQuickAction {
  id: string;
  title: string;
  description: string;
  to: string;
  tone?: 'accent' | 'default';
}

function getActiveModuleKey(pathname: string): ModuleKey {
  if (pathname.includes('/participation/')) {
    return 'jumps';
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

  if (pathname.includes('/personal-reality')) {
    return 'personal-reality';
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
  const { simpleMode } = useUiPreferences();
  const { navOpen: sidebarOpen, closeNav, registerWorkspaceDrawer } = usePageShellNav();
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

  useEffect(() => {
    if (state?.status !== 'ready') {
      return undefined;
    }

    return registerWorkspaceDrawer();
  }, [registerWorkspaceDrawer, state?.status]);

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
  const selectedJumper =
    workspace.jumpers.find((jumper) => jumper.id === searchParams.get('jumper')) ??
    workspace.jumpers[0] ??
    null;
  const selectedJumperId = selectedJumper?.id ?? '';
  const selectedIconicProfile = selectedJumper
    ? workspace.bodymodProfiles.find((profile) => profile.jumperId === selectedJumper.id) ?? null
    : null;
  const hasJumpers = workspace.jumpers.length > 0;
  const hasJumps = workspace.jumps.length > 0;

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

  function getJumpEditorPath(nextJumpId?: string | null) {
    const jumpId = nextJumpId ?? currentJump?.id ?? workspace.jumps[0]?.id ?? null;

    if (!jumpId) {
      return `/chains/${resolvedChainId}/jumps`;
    }

    return `/chains/${resolvedChainId}/jumps/${jumpId}`;
  }

  function getBodymodPath(nextJumperId = selectedJumperId) {
    if (!hasJumpers) {
      return `/chains/${resolvedChainId}/jumpers`;
    }

    return `/chains/${resolvedChainId}/bodymod${buildSearch(nextJumperId)}`;
  }

  function getParticipationPath(nextJumperId = selectedJumperId) {
    if (!hasJumpers) {
      return `/chains/${resolvedChainId}/jumpers`;
    }

    if (!hasJumps || !currentJump) {
      return `/chains/${resolvedChainId}/jumps`;
    }

    const nextSearchParams = new URLSearchParams(searchParams);

    if (nextJumperId) {
      nextSearchParams.set('jumper', nextJumperId);
    } else {
      nextSearchParams.delete('jumper');
    }

    nextSearchParams.set('panel', 'participation');
    const nextSearch = nextSearchParams.toString();

    return `/chains/${resolvedChainId}/jumps/${currentJump.id}${nextSearch.length > 0 ? `?${nextSearch}` : ''}`;
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
        return getJumpEditorPath();
      case 'participation':
        return getParticipationPath();
      case 'effects':
        return `/chains/${resolvedChainId}/effects`;
      case 'chainwide-rules':
        return `/chains/${resolvedChainId}/rules`;
      case 'current-jump-rules':
        return hasJumps ? `/chains/${resolvedChainId}/current-jump-rules` : `/chains/${resolvedChainId}/jumps`;
      case 'bodymod':
        return getBodymodPath();
      case 'personal-reality':
        return `/chains/${resolvedChainId}/personal-reality`;
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

    closeNav();
    navigate(destination);
  }

  async function handleQuickJumpChange(nextJumpId: string) {
    if (!nextJumpId) {
      return;
    }

    await switchActiveJump(resolvedChainId, nextJumpId);
    closeNav();

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
    closeNav();

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

  const quickActions: WorkspaceQuickAction[] = [
    !hasJumpers
      ? {
          id: 'create-first-jumper',
          title: 'Create First Jumper',
          description: 'Start here. Iconic, jump participation and purchases, and most character-focused modules hang off a jumper.',
          to: `/chains/${resolvedChainId}/jumpers`,
          tone: 'accent',
        }
      : {
          id: 'open-selected-jumper',
          title: `Edit ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: 'Identity, background, notes, and setup live here.',
          to: `/chains/${resolvedChainId}/jumpers${buildSearch(selectedJumperId)}`,
          tone: 'accent',
        },
    !hasJumps
      ? {
          id: 'create-first-jump',
          title: 'Create First Jump',
          description: 'Participation and purchases, current-jump rules, and timeline become meaningful once a jump exists.',
          to: `/chains/${resolvedChainId}/jumps`,
          tone: 'accent',
        }
      : {
          id: 'open-current-jump',
          title: `Open ${currentJump?.title ?? 'Current Jump'}`,
          description: 'Edit status, ordering, duration, and participant membership.',
          to: getJumpEditorPath(),
        },
    hasJumpers
      ? {
          id: 'open-iconic',
          title: selectedIconicProfile ? `Iconic: ${selectedJumper?.name ?? 'Selected Jumper'}` : `Create Iconic For ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: selectedIconicProfile
            ? 'Open the jumper-tied Iconic profile that belongs to the current jumper focus.'
            : 'No Iconic profile exists for this jumper yet. Start it here.',
          to: getBodymodPath(),
        }
      : {
          id: 'chain-notes',
          title: 'Open Chain Notes',
          description: 'Capture setup decisions while you scaffold the chain.',
          to: `/chains/${resolvedChainId}/notes`,
        },
    hasJumpers && hasJumps
      ? {
          id: 'open-jump-participation',
          title: `Participation & Purchases: ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: `Open ${currentJump?.title ?? 'the current jump'} and work on ${selectedJumper?.name ?? 'the jumper'} inside it.`,
          to: `${getJumpEditorPath()}${buildSearch(selectedJumperId)}`,
        }
      : {
          id: 'overview',
          title: 'Open Overview',
          description: 'Use the overview to see what the active branch already has and what is still missing.',
          to: `/chains/${resolvedChainId}/overview`,
        },
  ];
  const primaryQuickAction = quickActions[0];
  const visibleQuickActions = simpleMode ? quickActions.slice(0, 3) : quickActions;

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
          label: 'Iconic',
          to: getModulePath('bodymod'),
        },
        {
          key: 'personal-reality',
          label: 'Personal Reality',
          to: getModulePath('personal-reality'),
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
          <div className="stack stack--compact workspace-hero__leading">
            <div className="workspace-hero__toolbar">
              <div className="inline-meta">
                <span className="pill">Active workspace</span>
                <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
                <span className="pill">{currentJump ? `Current: ${currentJump.title}` : 'No current jump'}</span>
              </div>
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

      {sidebarOpen ? (
        <button
          className="workspace-sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={closeNav}
        />
      ) : null}

      <aside className={`workspace-sidebar${sidebarOpen ? ' is-open' : ''}`} id="workspace-sidebar">
        <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
          <div className="section-heading">
            <h3>App</h3>
            <span className="pill">Everywhere</span>
          </div>
          <nav className="workspace-menu-list" aria-label="App pages">
            <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/" end onClick={closeNav}>
              <strong>Home</strong>
              <span>Chains, creation, imports, and exports.</span>
            </NavLink>
            <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/search" onClick={closeNav}>
              <strong>Search</strong>
              <span>Find records across chains and modules.</span>
            </NavLink>
            <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/import" onClick={closeNav}>
              <strong>Import Review</strong>
              <span>Review and convert external jump data.</span>
            </NavLink>
          </nav>
        </section>

        <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
          <div className="section-heading">
            <h3>Context</h3>
            <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
          </div>
          <div className="workspace-context-title">
            <strong>{state.bundle.chain.title}</strong>
            <span>{currentJump ? `Current jump: ${currentJump.title}` : 'Current jump: None selected'}</span>
          </div>
          {simpleMode ? (
            <p className="workspace-sidebar-copy">
              Start with <strong>{primaryQuickAction.title}</strong>. You can come back to the deeper navigation controls once the chain has a little structure.
            </p>
          ) : (
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
          )}
        </section>

        <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
          <div className="section-heading">
            <h3>Navigator</h3>
            <span className="pill">{simpleMode ? 'Guided' : 'Menus'}</span>
          </div>

          {simpleMode ? (
            <div className="section-surface stack stack--compact">
              <strong>Start here</strong>
              <p className="workspace-sidebar-copy">
                The quickest safe next step is <strong>{primaryQuickAction.title}</strong>. Once you have the basics in place, open the navigation controls below.
              </p>
              <button
                className="button"
                type="button"
                onClick={() => {
                  closeNav();
                  navigate(primaryQuickAction.to);
                }}
              >
                {primaryQuickAction.title}
              </button>
            </div>
          ) : null}

          {simpleMode ? (
            <details className="details-panel">
              <summary className="details-panel__summary">
                <span>More navigation</span>
                <span className="pill">Optional</span>
              </summary>
              <div className="details-panel__body stack stack--compact">
                <label className="field">
                  <span className="field-label-row">
                    <span>Go to module</span>
                    <AssistiveHint
                      placement="right"
                      text="Setup-aware defaults are applied here. Missing prerequisites route you to the screen where you can create them."
                      triggerLabel="Explain module routing"
                    />
                  </span>
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
                    <span className="field-label-row">
                      <span>Jumper focus</span>
                      <AssistiveHint
                        placement="right"
                        text={
                          selectedJumper
                            ? `Iconic and jumper-specific routes now stay tied to ${selectedJumper.name}.`
                            : 'Create the first jumper to unlock Iconic and jumper-specific participation and purchases routes.'
                        }
                        triggerLabel="Explain jumper focus"
                      />
                    </span>
                    <select
                      value={selectedJumperId}
                      onChange={(event) => handleQuickJumperChange(event.target.value)}
                      disabled={workspace.jumpers.length === 0}
                    >
                      {workspace.jumpers.length === 0 ? (
                        <option value="">Create a jumper first</option>
                      ) : (
                        workspace.jumpers.map((jumper) => (
                          <option key={jumper.id} value={jumper.id}>
                            {jumper.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="field">
                    <span className="field-label-row">
                      <span>Jump</span>
                      <AssistiveHint
                        placement="right"
                        text={
                          currentJump
                            ? `Current jump context is ${currentJump.title}.`
                            : 'Create the first jump to unlock participation and purchases plus current-jump rules.'
                        }
                        triggerLabel="Explain jump focus"
                      />
                    </span>
                    <select
                      value={currentJump?.id ?? ''}
                      onChange={(event) => void handleQuickJumpChange(event.target.value)}
                      disabled={workspace.jumps.length === 0}
                    >
                      {workspace.jumps.length === 0 ? (
                        <option value="">Create a jump first</option>
                      ) : (
                        workspace.jumps.map((jump) => (
                          <option key={jump.id} value={jump.id}>
                            {jump.orderIndex + 1}. {jump.title}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
              </div>
            </details>
          ) : (
            <>
              <label className="field">
                <span className="field-label-row">
                  <span>Go to module</span>
                  <AssistiveHint
                    placement="right"
                    text="Setup-aware defaults are applied here. Missing prerequisites route you to the screen where you can create them."
                    triggerLabel="Explain module routing"
                  />
                </span>
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
                  <span className="field-label-row">
                    <span>Jumper focus</span>
                    <AssistiveHint
                      placement="right"
                      text={
                        selectedJumper
                          ? `Iconic and jumper-specific routes now stay tied to ${selectedJumper.name}.`
                          : 'Create the first jumper to unlock Iconic and jumper-specific participation and purchases routes.'
                      }
                      triggerLabel="Explain jumper focus"
                    />
                  </span>
                  <select
                    value={selectedJumperId}
                    onChange={(event) => handleQuickJumperChange(event.target.value)}
                    disabled={workspace.jumpers.length === 0}
                  >
                    {workspace.jumpers.length === 0 ? (
                      <option value="">Create a jumper first</option>
                    ) : (
                      workspace.jumpers.map((jumper) => (
                        <option key={jumper.id} value={jumper.id}>
                          {jumper.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="field">
                  <span className="field-label-row">
                    <span>Jump</span>
                    <AssistiveHint
                      placement="right"
                      text={
                        currentJump
                          ? `Current jump context is ${currentJump.title}.`
                          : 'Create the first jump to unlock participation and purchases plus current-jump rules.'
                      }
                      triggerLabel="Explain jump focus"
                    />
                  </span>
                  <select
                    value={currentJump?.id ?? ''}
                    onChange={(event) => void handleQuickJumpChange(event.target.value)}
                    disabled={workspace.jumps.length === 0}
                  >
                    {workspace.jumps.length === 0 ? (
                      <option value="">Create a jump first</option>
                    ) : (
                      workspace.jumps.map((jump) => (
                        <option key={jump.id} value={jump.id}>
                          {jump.orderIndex + 1}. {jump.title}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
            </>
          )}

          <div className="section-heading">
            <h4>{simpleMode ? 'Next steps' : 'Suggested Next Steps'}</h4>
            <span className="pill">Context aware</span>
          </div>

          <div className="workspace-action-grid">
            {visibleQuickActions.map((action) => (
              <TooltipFrame
                key={action.id}
                tooltip={!simpleMode ? action.description : undefined}
                placement="right"
              >
                <button
                  className={`workspace-action-card${action.tone === 'accent' ? ' is-accent' : ''}`}
                  type="button"
                  onClick={() => {
                    closeNav();
                    navigate(action.to);
                  }}
                >
                  <strong>{action.title}</strong>
                  {simpleMode ? <span>{action.description}</span> : null}
                </button>
              </TooltipFrame>
            ))}
          </div>
        </section>
      </aside>

      <div className="workspace-frame">
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
