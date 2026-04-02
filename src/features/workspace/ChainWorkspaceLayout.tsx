import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { usePageShellNav } from '../../components/PageShell';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle } from '../../db/persistence';
import { readGuideRequested } from './simpleModeGuides';
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
  | 'alt-chain-builder'
  | 'chainwide-rules'
  | 'current-jump-rules'
  | 'bodymod'
  | 'cosmic-backpack'
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

interface WorkspaceModuleGroup {
  id: string;
  title: string;
  items: WorkspaceModuleMenuItem[];
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
type WorkspacePresentationMode = 'overview' | 'editor' | 'deep-task';

interface WorkspacePresentationPreferences {
  mode: WorkspacePresentationMode;
  showHeroStats: boolean;
  showQuickActions: boolean;
}

type WorkspacePresentationOverride = Partial<WorkspacePresentationPreferences> | null;

const WorkspacePresentationContext = createContext<Dispatch<SetStateAction<WorkspacePresentationOverride>> | null>(null);

function getDefaultWorkspacePresentation(activeModuleKey: ModuleKey): WorkspacePresentationPreferences {
  if (activeModuleKey === 'overview' || activeModuleKey === 'timeline' || activeModuleKey === 'backups') {
    return {
      mode: 'overview',
      showHeroStats: true,
      showQuickActions: true,
    };
  }

  return {
    mode: 'editor',
    showHeroStats: true,
    showQuickActions: false,
  };
}

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

export function useWorkspacePresentation(override: WorkspacePresentationOverride) {
  const setPresentationOverride = useContext(WorkspacePresentationContext);

  if (!setPresentationOverride) {
    throw new Error('useWorkspacePresentation must be used inside ChainWorkspaceLayout.');
  }

  useEffect(() => {
    setPresentationOverride(override);

    return () => {
      setPresentationOverride(null);
    };
  }, [override, setPresentationOverride]);
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

  if (pathname.includes('/alt-chain-builder')) {
    return 'alt-chain-builder';
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

  if (pathname.includes('/cosmic-backpack') || pathname.includes('/personal-reality')) {
    return 'cosmic-backpack';
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

function WorkspaceModuleLinks(props: {
  groups: WorkspaceModuleGroup[];
  activeModuleKey: ModuleKey;
  onNavigate: () => void;
  simpleMode: boolean;
}) {
  return (
    <div className="workspace-nav-groups">
      {props.groups.map((group) => (
        <section className="workspace-nav-group stack stack--compact" key={group.id}>
          <span className="workspace-nav-group__label">{group.title}</span>
          <nav className="workspace-menu-list" aria-label={group.title}>
            {group.items.map((item) =>
              item.to ? (
                <NavLink
                  key={item.key}
                  className={() =>
                    `workspace-menu-item${props.activeModuleKey === item.key ? ' active' : ''}${props.simpleMode ? '' : ' is-compact'}`
                  }
                  to={item.to}
                  aria-current={props.activeModuleKey === item.key ? 'page' : undefined}
                  onClick={props.onNavigate}
                >
                  <div className="workspace-menu-item__topline">
                    <strong>{item.label}</strong>
                    {props.simpleMode && item.readiness ? <ReadinessPill tone={item.readiness} /> : null}
                  </div>
                  {props.simpleMode && item.description ? <span>{item.description}</span> : null}
                </NavLink>
              ) : null,
            )}
          </nav>
        </section>
      ))}
    </div>
  );
}

export function ChainWorkspaceLayout() {
  const { chainId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { simpleMode } = useUiPreferences();
  const { navOpen: sidebarOpen, closeNav, registerWorkspaceDrawer } = usePageShellNav();
  const [headerAttachment, setHeaderAttachment] = useState<ReactNode | null>(null);
  const [presentationOverride, setPresentationOverride] = useState<WorkspacePresentationOverride>(null);
  const activeModuleKey = getActiveModuleKey(location.pathname);
  const basePresentation = useMemo(() => getDefaultWorkspacePresentation(activeModuleKey), [activeModuleKey]);
  const presentation = useMemo<WorkspacePresentationPreferences>(
    () => ({
      ...basePresentation,
      ...presentationOverride,
    }),
    [basePresentation, presentationOverride],
  );

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

  const outletContext = useMemo<ChainWorkspaceOutletContext | null>(() => {
    if (!chainId || state?.status !== 'ready' || !state.bundle || !state.workspace) {
      return null;
    }

    return {
      chainId,
      bundle: state.bundle,
      workspace: state.workspace,
    };
  }, [chainId, state]);

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
  const guidedSetupActive = simpleMode && readGuideRequested(searchParams);

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
      case 'alt-chain-builder':
        return `/chains/${resolvedChainId}/alt-chain-builder`;
      case 'chainwide-rules':
        return `/chains/${resolvedChainId}/rules`;
      case 'current-jump-rules':
        return hasJumps ? `/chains/${resolvedChainId}/current-jump-rules` : `/chains/${resolvedChainId}/jumps`;
      case 'bodymod':
        return getBodymodPath();
      case 'cosmic-backpack':
        return `/chains/${resolvedChainId}/cosmic-backpack`;
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
  const primaryQuickAction = quickActions[0];
  const visibleQuickActions = simpleMode ? quickActions.slice(0, 3) : quickActions;
  const showHeroGuideAction = showGuidedSetup && !guidedSetupActive && activeModuleKey !== 'overview';
  const showQuickActions = presentation.showQuickActions && !guidedSetupActive && (!simpleMode || !showGuidedSetup);
  const simpleHeroSummary = guidedSetupActive
    ? 'Setup guide is open on this page.'
    : showGuidedSetup
      ? activeModuleKey === 'overview'
        ? 'Finish the next setup step below.'
        : 'Setup is still in progress. Overview will take you to the next unfinished step.'
      : presentation.mode === 'overview'
        ? 'Core setup is in place. Pick the module you want to work in.'
        : presentation.mode === 'editor'
          ? 'Editing inside the active branch.'
          : null;
  const simpleNavigatorLabel = guidedSetupActive ? 'Guide open' : showGuidedSetup ? 'Setup in progress' : 'Ready';
  const simpleNavigatorCopy = guidedSetupActive
    ? 'Use the page content below to finish the current step.'
    : showGuidedSetup
      ? activeModuleKey === 'overview'
        ? 'Overview is already showing the next setup step.'
        : `Next core step: ${nextCoreAction.title}.`
      : `Quickest route back in: ${primaryQuickAction.title}.`;

  const moduleGroups: WorkspaceModuleGroup[] = [
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
          key: 'cosmic-backpack',
          label: 'Cosmic Backpack',
          to: getModulePath('cosmic-backpack'),
          description: 'Optional warehouse alternative built around one portable bag and a short upgrade list.',
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
          key: 'alt-chain-builder',
          label: 'Alt-Chain Builder',
          to: getModulePath('alt-chain-builder'),
          description: 'Work through the Alt-Chain worksheet and generate chainwide rule entries from it.',
          readiness: 'advanced',
        },
        {
          key: 'chainwide-rules',
          label: 'Chainwide Rules',
          to: getModulePath('chainwide-rules'),
          description: 'Edit chainwide rule effects, drawbacks, and branch-level rule flags after the builder posts into them.',
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

  return (
    <WorkspacePresentationContext.Provider value={setPresentationOverride}>
      <WorkspaceHeaderAttachmentContext.Provider value={setHeaderAttachment}>
        <div className="workspace-shell stack" data-workspace-mode={presentation.mode}>
          <section className="workspace-hero">
            <div className="workspace-hero__top">
              <div className="stack stack--compact workspace-hero__leading">
                <div className="workspace-hero__toolbar">
                  <div className="inline-meta">
                    {simpleMode ? null : <span className="pill">Active workspace</span>}
                    <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
                    {presentation.mode === 'deep-task' ? null : <span className="pill">{currentJump ? `Current: ${currentJump.title}` : 'No current jump'}</span>}
                  </div>
                </div>
                <h2>{state.bundle.chain.title}</h2>
                {simpleMode ? simpleHeroSummary ? <p className="workspace-hero__summary">{simpleHeroSummary}</p> : null : presentation.mode === 'overview' ? (
                  <p className="workspace-hero__summary">
                    {`${activeBranch?.title ?? 'No active branch'} branch${currentJump ? ` | Current jump: ${currentJump.title}` : ' | No current jump selected'}.`}
                  </p>
                ) : null}
                {showHeroGuideAction ? (
                  <div className="actions workspace-hero__actions">
                    <button className="button" type="button" onClick={() => navigate(`/chains/${resolvedChainId}/overview`)}>
                      Continue setup
                    </button>
                  </div>
                ) : null}
              </div>
              {presentation.showHeroStats ? (
                <div className="workspace-hero__stats">
                  {simpleMode && guidedSetupActive ? null : presentation.mode === 'editor' ? (
                    <>
                      <span className="metric">
                        <strong>{workspace.jumpers.length}</strong>
                        Jumpers
                      </span>
                      <span className="metric">
                        <strong>{workspace.jumps.length}</strong>
                        Jumps
                      </span>
                    </>
                  ) : simpleMode ? (
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
              ) : null}
            </div>
          </section>

          <div className="workspace-frame">
            {sidebarOpen ? (
              <button
                className="workspace-sidebar-backdrop"
                type="button"
                aria-label="Close navigation"
                onClick={closeNav}
              />
            ) : null}

            <aside className={`workspace-sidebar${sidebarOpen ? ' is-open' : ''}`} id="workspace-sidebar">
              {!showQuickActions ? null : (
                <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
                  <div className="section-heading">
                    <h4>{simpleMode ? 'Shortcuts' : 'Suggested Next Steps'}</h4>
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
              )}

              <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
                <div className="section-heading">
                  <div className="field-label-row">
                    <h3>Workspace</h3>
                    <AssistiveHint
                      placement="right"
                      text="These links jump directly between major workspace modules. Each destination still applies the same setup-aware defaults as before."
                      triggerLabel="Explain workspace navigation"
                    />
                  </div>
                  <span className="pill">{simpleMode ? 'Guided' : 'Browse'}</span>
                </div>

                {simpleMode ? (
                  <div className="section-surface stack stack--compact">
                    <div className="section-heading">
                      <strong>Focus</strong>
                      <ReadinessPill tone={showGuidedSetup ? 'start' : 'core'} label={simpleNavigatorLabel} />
                    </div>
                    <p className="workspace-sidebar-copy">{simpleNavigatorCopy}</p>
                  </div>
                ) : (
                  <p className="workspace-sidebar-copy">Move between setup, systems, and reference pages without opening a chooser first.</p>
                )}

                <WorkspaceModuleLinks
                  groups={moduleGroups}
                  activeModuleKey={activeModuleKey}
                  onNavigate={closeNav}
                  simpleMode={simpleMode}
                />

                <details className="details-panel">
                  <summary className="details-panel__summary">
                    <span>Legacy features</span>
                    <span className="pill">Low use</span>
                  </summary>
                  <div className="details-panel__body stack stack--compact">
                    <p className="workspace-sidebar-copy">Import Review is still available for older external JSON flows.</p>
                    <NavLink className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`} to="/import" onClick={closeNav}>
                      <strong>Import Review</strong>
                      <span>Review and convert external jump data.</span>
                    </NavLink>
                  </div>
                </details>
              </section>
            </aside>

            <div className="workspace-main">
              {headerAttachment ? <section className="workspace-header-attachment">{headerAttachment}</section> : null}
              <section className="workspace-content">
                <Outlet context={outletContext as ChainWorkspaceOutletContext} />
              </section>
            </div>
          </div>
      </div>
      </WorkspaceHeaderAttachmentContext.Provider>
    </WorkspacePresentationContext.Provider>
  );
}
