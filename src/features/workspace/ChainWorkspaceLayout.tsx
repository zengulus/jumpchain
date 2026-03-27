import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { usePageShellNav } from '../../components/PageShell';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle, switchActiveJump } from '../../db/persistence';
import { AssistiveHint, ReadinessPill, TooltipFrame, type ReadinessTone } from './shared';

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
  description?: string;
  readiness?: ReadinessTone;
}

interface WorkspaceQuickAction {
  id: string;
  title: string;
  description: string;
  to: string;
  tone?: 'accent' | 'default';
  readiness?: ReadinessTone;
}

const WorkspaceHeaderAttachmentContext = createContext<Dispatch<SetStateAction<ReactNode | null>> | null>(null);

export function useWorkspaceHeaderAttachment(attachment: ReactNode | null) {
  const setHeaderAttachment = useContext(WorkspaceHeaderAttachmentContext);

  if (!setHeaderAttachment) {
    throw new Error('useWorkspaceHeaderAttachment must be used inside ChainWorkspaceLayout.');
  }

  useEffect(() => {
    setHeaderAttachment(attachment);

    return () => {
      setHeaderAttachment((currentAttachment) => (currentAttachment === attachment ? null : currentAttachment));
    };
  }, [attachment, setHeaderAttachment]);
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

const READINESS_OPTION_LABELS: Record<ReadinessTone, string> = {
  start: 'Start here',
  core: 'Core setup',
  optional: 'Optional later',
  advanced: 'Advanced rules',
};

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
  const [headerAttachment, setHeaderAttachment] = useState<ReactNode | null>(null);
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
  const coreSetupReady = hasJumpers && hasJumps;
  const showGuidedSetup = simpleMode && !coreSetupReady;

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
          readiness: 'start',
        }
      : {
          id: 'open-selected-jumper',
          title: `Edit ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: 'Identity, background, notes, and setup live here.',
          to: `/chains/${resolvedChainId}/jumpers${buildSearch(selectedJumperId)}`,
          tone: 'accent',
          readiness: 'core',
        },
    !hasJumps
      ? {
          id: 'create-first-jump',
          title: 'Create First Jump',
          description: 'Participation and purchases, current-jump rules, and timeline become meaningful once a jump exists.',
          to: `/chains/${resolvedChainId}/jumps`,
          tone: 'accent',
          readiness: 'core',
        }
      : {
          id: 'open-current-jump',
          title: `Open ${currentJump?.title ?? 'Current Jump'}`,
          description: 'Edit status, ordering, duration, and participant membership.',
          to: getJumpEditorPath(),
          readiness: 'core',
        },
    hasJumpers
      ? {
          id: 'open-iconic',
          title: selectedIconicProfile ? `Iconic: ${selectedJumper?.name ?? 'Selected Jumper'}` : `Create Iconic For ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: selectedIconicProfile
            ? 'Open the jumper-tied Iconic profile that belongs to the current jumper focus.'
            : 'No Iconic profile exists for this jumper yet. Start it here.',
          to: getBodymodPath(),
          readiness: 'optional',
        }
      : {
          id: 'chain-notes',
          title: 'Open Chain Notes',
          description: 'Capture setup decisions while you scaffold the chain.',
          to: `/chains/${resolvedChainId}/notes`,
          readiness: 'optional',
        },
    hasJumpers && hasJumps
      ? {
          id: 'open-jump-participation',
          title: `Participation & Purchases: ${selectedJumper?.name ?? 'Selected Jumper'}`,
          description: `Open ${currentJump?.title ?? 'the current jump'} and work on ${selectedJumper?.name ?? 'the jumper'} inside it.`,
          to: `${getJumpEditorPath()}${buildSearch(selectedJumperId)}`,
          readiness: 'core',
        }
      : {
          id: 'overview',
          title: 'Open Overview',
          description: 'Use the overview to see what the active branch already has and what is still missing.',
          to: `/chains/${resolvedChainId}/overview`,
          readiness: 'core',
        },
  ];
  const nextCoreAction = quickActions[0];
  const guidedSetupAction: WorkspaceQuickAction | null = showGuidedSetup
    ? {
        id: 'guided-setup',
        title: 'Open Guided Setup',
        description: 'Overview is still the recommended path while this chain is missing its first jumper or jump.',
        to: `/chains/${resolvedChainId}/overview`,
        tone: 'accent',
        readiness: 'start',
      }
    : null;
  const primaryQuickAction = guidedSetupAction ?? quickActions[0];
  const visibleQuickActions = simpleMode
    ? guidedSetupAction
      ? [guidedSetupAction, ...quickActions.slice(0, 2)]
      : quickActions.slice(0, 3)
    : quickActions;

  const moduleGroups: Array<{
    id: string;
    title: string;
    items: WorkspaceModuleMenuItem[];
  }> = [
    {
      id: 'core',
      title: simpleMode ? 'Core setup' : 'Core Flow',
      items: [
        {
          key: 'overview',
          label: 'Overview',
          to: getModulePath('overview'),
          description: 'Return here for guided setup, setup status, and branch-wide orientation.',
          readiness: showGuidedSetup ? 'start' : 'core',
        },
        {
          key: 'jumpers',
          label: 'Jumpers',
          to: getModulePath('jumpers'),
          description: 'Create and edit the character records this chain follows.',
          readiness: hasJumpers ? 'core' : 'start',
        },
        {
          key: 'companions',
          label: 'Companions',
          to: getModulePath('companions'),
          description: 'Track companion records once the core jumper setup exists.',
          readiness: 'optional',
        },
        {
          key: 'jumps',
          label: 'Jumps',
          to: getModulePath('jumps'),
          description: 'Create and edit the jumps this branch will move through.',
          readiness: 'core',
        },
      ],
    },
    {
      id: 'optional',
      title: simpleMode ? 'Optional later' : 'Systems',
      items: [
        {
          key: 'bodymod',
          label: 'Iconic',
          to: getModulePath('bodymod'),
          description: 'Optional jumper continuity support for harsh resets and restrictions.',
          readiness: 'optional',
        },
        {
          key: 'personal-reality',
          label: 'Personal Reality',
          to: getModulePath('personal-reality'),
          description: 'Optional supplement planning for warehouse-style infrastructure and budgets.',
          readiness: 'optional',
        },
        {
          key: 'timeline',
          label: 'Timeline',
          to: getModulePath('timeline'),
          description: 'Review the long-running chain history once the core flow exists.',
          readiness: 'optional',
        },
        {
          key: 'backups',
          label: 'Backups',
          to: getModulePath('backups'),
          description: 'Export, restore, or branch the chain when you want safety tooling.',
          readiness: 'optional',
        },
        {
          key: 'notes',
          label: 'Notes',
          to: getModulePath('notes'),
          description: 'Capture supporting reminders and rulings when you need them.',
          readiness: 'optional',
        },
      ],
    },
    {
      id: 'rules',
      title: simpleMode ? 'Advanced rules' : 'Rules & Systems',
      items: [
        {
          key: 'effects',
          label: 'Effects',
          to: getModulePath('effects'),
          description: 'Custom effect records for chain, jump, and jumper logic.',
          readiness: 'advanced',
        },
        {
          key: 'chainwide-rules',
          label: 'Chainwide Rules',
          to: getModulePath('chainwide-rules'),
          description: 'Chain-level rule flags, drawbacks, and always-on rule entries.',
          readiness: 'advanced',
        },
        {
          key: 'current-jump-rules',
          label: 'Current Jump Rules',
          to: getModulePath('current-jump-rules'),
          description: 'Jump-specific overrides and effective rule-state inspection.',
          readiness: 'advanced',
        },
      ],
    },
  ];

  function formatModuleOptionLabel(item: WorkspaceModuleMenuItem) {
    if (!simpleMode || !item.readiness) {
      return item.label;
    }

    return `${READINESS_OPTION_LABELS[item.readiness]} - ${item.label}`;
  }
  return (
    <WorkspaceHeaderAttachmentContext.Provider value={setHeaderAttachment}>
      <div className="workspace-shell stack">
        <section className="workspace-hero">
          <div className="workspace-hero__top">
            <div className="stack stack--compact workspace-hero__leading">
              <div className="workspace-hero__toolbar">
                <div className="inline-meta">
                  {simpleMode ? null : <span className="pill">Active workspace</span>}
                  <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
                  <span className="pill">{currentJump ? `Current: ${currentJump.title}` : 'No current jump'}</span>
                </div>
              </div>
              <h2>{state.bundle.chain.title}</h2>
              <p className="workspace-hero__summary">
                {simpleMode
                  ? showGuidedSetup
                    ? `Guided setup is still the recommended path. ${nextCoreAction.title} is the next core step it will point you toward.`
                    : 'Core setup is in place. You can keep using Overview for orientation or jump straight into the module you want.'
                  : `${activeBranch?.title ?? 'No active branch'} branch${currentJump ? ` | Current jump: ${currentJump.title}` : ' | No current jump selected'}.`}
              </p>
              {showGuidedSetup ? (
                <div className="actions workspace-hero__actions">
                  <button className="button" type="button" onClick={() => navigate(`/chains/${resolvedChainId}/overview`)}>
                    Open Guided Setup
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => navigate(nextCoreAction.to)}>
                    Go to {nextCoreAction.title}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="workspace-hero__stats">
              {simpleMode ? (
                <>
                  <span className="metric">
                    <strong>{workspace.jumpers.length}</strong>
                    Jumpers ready
                  </span>
                  <span className="metric">
                    <strong>{workspace.jumps.length}</strong>
                    Jumps in branch
                  </span>
                </>
              ) : (
                <>
                  <span className="metric">
                    <strong>{workspace.jumpers.length}</strong>
                    Jumpers
                  </span>
                  <span className="metric">
                    <strong>{workspace.jumps.length}</strong>
                    Jumps
                  </span>
                  <span className="metric">
                    <strong>{currentJump ? currentJump.orderIndex + 1 : '—'}</strong>
                    Current jump
                  </span>
                  <span className="metric">
                    <strong>{workspace.snapshots.length}</strong>
                    Snapshots
                  </span>
                </>
              )}
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
                <span>{simpleMode ? 'Start, reopen, or resume guided setup for a chain.' : 'Chains, creation, imports, and exports.'}</span>
              </NavLink>
              <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/search" onClick={closeNav}>
                <strong>Search</strong>
                <span>{simpleMode ? 'Find something you already created.' : 'Find records across chains and modules.'}</span>
              </NavLink>
              <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/import" onClick={closeNav}>
                <strong>Import Review</strong>
                <span>{simpleMode ? 'Review outside JSON before it becomes part of the app.' : 'Review and convert external jump data.'}</span>
              </NavLink>
            </nav>
          </section>

          {showGuidedSetup ? (
            <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
              <div className="section-heading">
                <h3>Guided setup</h3>
                <ReadinessPill tone="start" />
              </div>
              <p className="workspace-sidebar-copy">
                Overview is still the recommended path while this chain is missing its first jumper or jump.
              </p>
              <button
                className="button"
                type="button"
                onClick={() => {
                  closeNav();
                  navigate(`/chains/${resolvedChainId}/overview`);
                }}
              >
                Open Guided Setup
              </button>
            </section>
          ) : null}

          <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
            <div className="section-heading">
              <h3>Context</h3>
              <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
            </div>
            <div className="workspace-context-title">
              <strong>{state.bundle.chain.title}</strong>
              <span>{currentJump ? `Current jump: ${currentJump.orderIndex + 1}. ${currentJump.title}` : 'No current jump selected'}</span>
            </div>
            <div className="workspace-context-meta" aria-label="Workspace totals">
              <span>{formatCount(workspace.jumpers.length, 'jumper')}</span>
              <span>{formatCount(workspace.jumps.length, 'jump')}</span>
            </div>
          </section>

          <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
            <div className="section-heading">
              <h3>Navigator</h3>
              <span className="pill">{simpleMode ? 'Guided' : 'Menus'}</span>
            </div>

            {simpleMode ? (
              <div className="section-surface stack stack--compact">
                <strong>{showGuidedSetup ? 'Recommended next move' : 'Quickest route back in'}</strong>
                <p className="workspace-sidebar-copy">
                  {showGuidedSetup
                    ? `Use Guided Setup when you want the calmest route. ${nextCoreAction.title} is the next core task if you would rather jump there directly.`
                    : `${primaryQuickAction.title} is the fastest way back into the active branch from here.`}
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
                              {formatModuleOptionLabel(item)}
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
                            {formatModuleOptionLabel(item)}
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
                  <div className="workspace-action-card__top">
                    <strong>{action.title}</strong>
                    {simpleMode && action.readiness ? <ReadinessPill tone={action.readiness} /> : null}
                  </div>
                  {simpleMode ? <span>{action.description}</span> : null}
                </button>
              </TooltipFrame>
            ))}
          </div>
          </section>
        </aside>

        <div className="workspace-frame">
          {headerAttachment ? <section className="workspace-header-attachment">{headerAttachment}</section> : null}
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
    </WorkspaceHeaderAttachmentContext.Provider>
  );
}
