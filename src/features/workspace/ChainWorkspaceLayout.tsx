import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate, NavLink, Outlet, matchPath, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { usePageShellNav } from '../../components/PageShell';
import type { BranchWorkspace } from '../../domain/chain/selectors';
import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import { getChainBundle } from '../../db/persistence';
import { getAltChainTrackedSupplementAvailability } from '../chainwide-rules/altChainBuilder';
import { readGuideRequested } from './simpleModeGuides';
import { AssistiveHint, ReadinessPill, TooltipFrame, WorkspaceFocusBar, type ReadinessTone } from './shared';

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
  | 'master-build'
  | 'jumpers'
  | 'companions'
  | 'jumps'
  | 'participation'
  | 'effects'
  | 'alt-chain-builder'
  | 'three-boons'
  | 'chainwide-rules'
  | 'current-jump-rules'
  | 'bodymod'
  | 'cosmic-backpack'
  | 'timeline'
  | 'notes'
  | 'jumpdocs'
  | 'export'
  | 'advanced-tools'
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

const MODULE_LABELS: Record<ModuleKey, string> = {
  overview: 'Overview',
  'master-build': 'Master Build',
  jumpers: 'Jumpers',
  companions: 'Companions',
  jumps: 'Jumps',
  participation: 'Participation',
  effects: 'Effects',
  'alt-chain-builder': 'Alt-Chain Builder',
  'three-boons': 'Three Boons',
  'chainwide-rules': 'Chainwide Rules',
  'current-jump-rules': 'Current Jump Rules',
  bodymod: 'Iconic',
  'cosmic-backpack': 'Cosmic Backpack',
  timeline: 'Timeline',
  notes: 'Notes',
  jumpdocs: 'JumpDocs',
  export: 'Export',
  'advanced-tools': 'Advanced Tools',
  backups: 'Backups',
};

interface WorkspacePresentationPreferences {
  mode: WorkspacePresentationMode;
  showHeroStats: boolean;
  showQuickActions: boolean;
}

type WorkspacePresentationOverride = Partial<WorkspacePresentationPreferences> | null;

const WorkspacePresentationContext = createContext<Dispatch<SetStateAction<WorkspacePresentationOverride>> | null>(null);

function getDefaultWorkspacePresentation(activeModuleKey: ModuleKey): WorkspacePresentationPreferences {
  if (activeModuleKey === 'overview') {
    return {
      mode: 'overview',
      showHeroStats: true,
      showQuickActions: true,
    };
  }

  return {
    mode: 'editor',
    showHeroStats: false,
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

  if (pathname.includes('/master-build')) {
    return 'master-build';
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

  if (pathname.includes('/three-boons')) {
    return 'three-boons';
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

  if (pathname.includes('/jumpdocs')) {
    return 'jumpdocs';
  }

  if (pathname.includes('/export')) {
    return 'export';
  }

  if (pathname.includes('/advanced-tools')) {
    return 'advanced-tools';
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
  const focusedJumpId =
    matchPath('/chains/:chainId/jumps/:jumpId', location.pathname)?.params.jumpId
    ?? matchPath('/chains/:chainId/participation/:jumpId', location.pathname)?.params.jumpId
    ?? null;
  const focusedJump = focusedJumpId
    ? workspace.jumps.find((jump) => jump.id === focusedJumpId) ?? null
    : currentJump;
  const selectedCompanion =
    workspace.companions.find((companion) => companion.id === searchParams.get('companion')) ??
    null;
  const focusedParticipantId =
    searchParams.get('participant')
    ?? (activeModuleKey === 'jumps' ? searchParams.get('jumper') : null);
  const focusedParticipantJumper = focusedParticipantId
    ? workspace.jumpers.find((jumper) => jumper.id === focusedParticipantId) ?? null
    : null;
  const focusedParticipantCompanion = focusedParticipantId
    ? workspace.companions.find((companion) => companion.id === focusedParticipantId) ?? null
    : null;
  const focusedParticipant = focusedParticipantJumper ?? focusedParticipantCompanion;

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
      case 'master-build':
        return `/chains/${resolvedChainId}/master-build`;
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
      case 'three-boons':
        return `/chains/${resolvedChainId}/three-boons`;
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
      case 'jumpdocs':
        return `/chains/${resolvedChainId}/jumpdocs`;
      case 'export':
        return `/chains/${resolvedChainId}/export`;
      case 'advanced-tools':
        return `/chains/${resolvedChainId}/advanced-tools`;
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
  const showWorkspaceHero = presentation.mode === 'overview';
  const showQuickActions =
    showWorkspaceHero && presentation.showQuickActions && !guidedSetupActive && (!simpleMode || !showGuidedSetup);
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
  const focusBarMeta = [
    activeBranch ? `Branch: ${activeBranch.title}` : '',
    focusedJump ? `Jump: ${focusedJump.title}` : currentJump ? `Current jump: ${currentJump.title}` : '',
    activeModuleKey === 'jumpers' || activeModuleKey === 'bodymod'
      ? selectedJumper ? `Jumper: ${selectedJumper.name}` : ''
      : activeModuleKey === 'companions'
        ? selectedCompanion ? `Companion: ${selectedCompanion.name}` : ''
        : focusedParticipant
          ? `${focusedParticipantCompanion ? 'Companion' : focusedParticipantJumper ? 'Jumper' : 'Participant'}: ${focusedParticipant.name}`
          : '',
  ].filter(Boolean);
  const showFocusBar = presentation.mode !== 'overview' || headerAttachment !== null;
  const iconicAvailability = getAltChainTrackedSupplementAvailability(workspace.chain, 'iconic');
  const cosmicBackpackAvailability = getAltChainTrackedSupplementAvailability(workspace.chain, 'cosmic-backpack');
  const threeBoonsAvailability = getAltChainTrackedSupplementAvailability(workspace.chain, 'three-boons');

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
          key: 'master-build',
          label: 'Master Build',
          to: getModulePath('master-build'),
          description: 'See every perk, item, and location across all jumps in one live-filtered view.',
          readiness: hasJumps ? 'core' : 'optional',
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
          description: iconicAvailability.locked
            ? 'Locked until Alt-Chain Builder spends a Supplements pick on Iconic.'
            : 'Optional jumper continuity support for harsh resets and restrictions.',
          readiness: iconicAvailability.locked ? 'advanced' : 'optional',
        },
        {
          key: 'cosmic-backpack',
          label: 'Cosmic Backpack',
          to: getModulePath('cosmic-backpack'),
          description: cosmicBackpackAvailability.locked
            ? 'Locked until Alt-Chain Builder spends a Supplements pick on Cosmic Backpack.'
            : 'Optional warehouse alternative built around one portable bag and a short upgrade list.',
          readiness: cosmicBackpackAvailability.locked ? 'advanced' : 'optional',
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
          key: 'three-boons',
          label: 'Three Boons',
          to: getModulePath('three-boons'),
          description: threeBoonsAvailability.locked
            ? 'Locked until Alt-Chain Builder spends a Supplements pick on Three Boons.'
            : 'Track the choose-three or roll-for-four Three Boons supplement for this chain.',
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
    {
      id: 'tools',
      title: 'Advanced tools',
      items: [
        {
          key: 'jumpdocs',
          label: 'JumpDocs',
          to: getModulePath('jumpdocs'),
          description: 'Create local structured jump documents for later PDF annotation and purchase picking.',
          readiness: 'optional',
        },
        {
          key: 'export',
          label: 'Export',
          to: getModulePath('export'),
          description: 'Generate Markdown or BBCode for sharing the active branch.',
          readiness: 'optional',
        },
        {
          key: 'advanced-tools',
          label: 'Advanced Tools',
          to: getModulePath('advanced-tools'),
          description: 'Tag audits and other maintenance utilities that do not need to sit in the main workflow.',
          readiness: 'advanced',
        },
      ],
    },
  ];
  const activeModuleItem = moduleGroups.flatMap((group) => group.items).find((item) => item.key === activeModuleKey) ?? null;
  const setupCompletionCount = Number(hasJumpers) + Number(hasJumps);
  const setupCompletionPercent = Math.round((setupCompletionCount / 2) * 100);
  const unlockedSystemsCount = [iconicAvailability, cosmicBackpackAvailability, threeBoonsAvailability].filter(
    (availability) => !availability.locked,
  ).length;
  const focusCard =
    activeModuleKey === 'jumpers' || activeModuleKey === 'bodymod'
      ? selectedJumper
        ? {
            label: activeModuleKey === 'bodymod' ? 'Selected iconic owner' : 'Selected jumper',
            title: selectedJumper.name,
            body: activeModuleKey === 'bodymod'
              ? selectedIconicProfile
                ? 'Iconic profile and continuity details are keyed to this jumper.'
                : 'No Iconic profile exists for this jumper yet, so the next edit here will likely be setup.'
              : 'Identity, notes, and character-level setup are currently focused on this jumper.',
          }
        : {
            label: activeModuleKey === 'bodymod' ? 'Selected iconic owner' : 'Selected jumper',
            title: 'No jumper selected',
            body: 'Pick a jumper to anchor the current character-facing workspace.',
          }
      : activeModuleKey === 'companions'
        ? selectedCompanion
          ? {
              label: 'Selected companion',
              title: selectedCompanion.name,
              body: 'Companion-specific edits and notes will land on this record.',
            }
          : {
              label: 'Selected companion',
              title: 'No companion selected',
              body: 'Choose a companion record to make the current editing context more specific.',
            }
        : focusedParticipant
          ? {
              label: focusedParticipantCompanion ? 'Selected participant' : 'Selected jumper',
              title: focusedParticipant.name,
              body: focusedJump
                ? `This participant is currently in view against ${focusedJump.title}.`
                : 'This participant is the current focus inside the workspace.',
            }
          : focusedJump
            ? {
                label: 'Jump in focus',
                title: focusedJump.title,
                body: 'Jump-specific editing and summaries are centered on this entry right now.',
              }
            : {
                label: 'Branch in focus',
                title: activeBranch?.title ?? 'No active branch',
                body: 'You are looking at the active branch-level workspace rather than one specific record.',
              };
  const advancedHeroSummary =
    presentation.mode === 'deep-task'
      ? null
      : presentation.mode === 'overview'
        ? `${activeBranch?.title ?? 'No active branch'} branch${currentJump ? ` • Current jump: ${currentJump.title}` : ' • No current jump selected'}. ${activeModuleItem?.description ?? ''}`.trim()
        : activeModuleItem?.description ?? `${activeBranch?.title ?? 'No active branch'} branch is active.`;
  const heroSummary = showWorkspaceHero ? (simpleMode ? simpleHeroSummary : advancedHeroSummary) : null;
  const heroDetailCards = showWorkspaceHero
    ? [
        focusCard,
        simpleMode
          ? {
              label: guidedSetupActive ? 'Setup guide' : 'Core setup',
              title: `${setupCompletionCount}/2 core steps complete`,
              body: guidedSetupActive
                ? 'The guide is open on this page, so the content below is already pointing at the current setup step.'
                : showGuidedSetup
                  ? `Setup is still in progress. Next useful move: ${nextCoreAction.title}.`
                  : 'Core setup is in place, so you can move freely between modules without losing your place.',
            }
          : {
              label: 'Next useful move',
              title: primaryQuickAction.title,
              body: primaryQuickAction.description,
            },
      ]
    : [];

  return (
    <WorkspacePresentationContext.Provider value={setPresentationOverride}>
      <WorkspaceHeaderAttachmentContext.Provider value={setHeaderAttachment}>
        <div className="workspace-shell stack" data-workspace-mode={presentation.mode}>
          {showWorkspaceHero ? (
            <section className="workspace-hero">
              <div className="workspace-hero__top">
                <div className="stack stack--compact workspace-hero__leading">
                  <div className="workspace-hero__toolbar">
                    <div className="inline-meta">
                      {simpleMode ? null : <span className="pill">Active workspace</span>}
                      <span className="pill pill--soft">{activeModuleItem?.label ?? MODULE_LABELS[activeModuleKey]}</span>
                      <span className="pill">{activeBranch?.title ?? 'No branch'}</span>
                      <span className="pill">{currentJump ? `Current: ${currentJump.title}` : 'No current jump'}</span>
                      {simpleMode ? (
                        <ReadinessPill
                          tone={showGuidedSetup ? 'start' : 'core'}
                          label={showGuidedSetup ? 'Setup in progress' : 'Core ready'}
                        />
                      ) : null}
                    </div>
                  </div>
                  <h2>{state.bundle.chain.title}</h2>
                  {heroSummary ? <p className="workspace-hero__summary">{heroSummary}</p> : null}
                  {heroDetailCards.length > 0 ? (
                    <div className="workspace-hero__detail-grid">
                      {heroDetailCards.map((card) => (
                        <section className="workspace-hero__detail-card" key={card.label}>
                          <span>{card.label}</span>
                          <strong>{card.title}</strong>
                          <p>{card.body}</p>
                        </section>
                      ))}
                    </div>
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
                    {simpleMode ? (
                      <>
                        <span className="metric">
                          <strong>{setupCompletionCount}/2</strong>
                          Core setup
                        </span>
                        <span className="metric">
                          <strong>{workspace.jumpers.length}</strong>
                          Jumpers ready
                        </span>
                        <span className="metric">
                          <strong>{workspace.jumps.length}</strong>
                          Jumps in branch
                        </span>
                        <span className="metric">
                          <strong>{setupCompletionPercent}%</strong>
                          Setup progress
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
                          <strong>{unlockedSystemsCount}</strong>
                          Systems unlocked
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
          ) : null}

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
                <p className="workspace-sidebar-copy">
                  {simpleMode
                    ? 'Use these to keep momentum without hunting through the full workspace menu.'
                    : 'These actions jump straight to the most likely next edit based on the current branch state.'}
                </p>

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

              <section className={`workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact${simpleMode ? '' : ' workspace-sidebar-card--nav'}`}>
                {simpleMode ? (
                  <>
                    <div className="section-heading">
                      <div className="field-label-row">
                        <h3>Workspace</h3>
                        <AssistiveHint
                          placement="right"
                          text="These links jump directly between major workspace modules. Each destination still applies the same setup-aware defaults as before."
                          triggerLabel="Explain workspace navigation"
                        />
                      </div>
                      <span className="pill">Guided</span>
                    </div>

                    <div className="section-surface stack stack--compact">
                      <div className="section-heading">
                        <strong>Focus</strong>
                        <ReadinessPill tone={showGuidedSetup ? 'start' : 'core'} label={simpleNavigatorLabel} />
                      </div>
                      <p className="workspace-sidebar-copy">{simpleNavigatorCopy}</p>
                    </div>
                  </>
                ) : (
                  <div className="section-heading">
                    <h3>Workspace</h3>
                  </div>
                )}

                <WorkspaceModuleLinks
                  groups={moduleGroups}
                  activeModuleKey={activeModuleKey}
                  onNavigate={closeNav}
                  simpleMode={simpleMode}
                />
              </section>
            </aside>

            <div className="workspace-main">
              {showFocusBar ? (
                <section
                  className={`workspace-header-attachment${!simpleMode && presentation.mode === 'deep-task' ? ' workspace-header-attachment--inline' : ''}`}
                >
                  <WorkspaceFocusBar
                    eyebrow={simpleMode ? (presentation.mode === 'deep-task' ? 'Deep work' : 'Workspace context') : undefined}
                    title={presentation.mode === 'deep-task' ? focusedJump?.title ?? MODULE_LABELS[activeModuleKey] : MODULE_LABELS[activeModuleKey]}
                    subtitle={simpleMode ? state.bundle.chain.title : undefined}
                    meta={focusBarMeta}
                    aside={headerAttachment}
                  />
                </section>
              ) : null}
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
