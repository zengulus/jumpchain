import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SIMPLE_MODE_GUIDE_DEFAULT_KEY,
  createEmptySimpleModeGuideRegistryState,
  createSimpleModeOverviewGuideState,
  createSimpleModePageGuideState,
  readSimpleModeOverviewGuideState,
  readSimpleModePageGuideState,
  type BranchGuideSurface,
  type ChainGuideSurface,
  type SimpleModeGuideRegistryState,
  type SimpleModeGuidePromptState,
  type SimpleModeOverviewGuideState,
  type SimpleModePageGuideState,
  type SimpleModeSupplementDecision,
} from '../features/workspace/simpleModeGuides';

export const UI_PREFERENCES_STORAGE_KEY = 'jumpchain.uiPreferences';

interface StoredUiPreferences {
  simpleMode?: unknown;
  simpleModeGuideRegistry?: unknown;
  simpleModeWizardByChain?: unknown;
  lastVisitedChainId?: unknown;
  lastChainRouteByChain?: unknown;
}

interface UiPreferencesState {
  simpleMode: boolean;
  simpleModeGuideRegistry: SimpleModeGuideRegistryState;
  lastVisitedChainId: string | null;
  lastChainRouteByChain: Record<string, string>;
}

interface UiPreferencesValue {
  simpleMode: boolean;
  setSimpleMode: (next: boolean) => void;
  lastVisitedChainId: string | null;
  getLastChainRoute: (chainId: string, fallbackPath?: string) => string;
  recordLastChainRoute: (chainId: string, nextPath: string) => void;
  getOverviewGuideState: (scopeKey: string) => SimpleModeOverviewGuideState;
  updateOverviewGuideState: (
    scopeKey: string,
    updater: (current: SimpleModeOverviewGuideState) => SimpleModeOverviewGuideState,
  ) => void;
  getBranchGuideState: (scopeKey: string, surface: Exclude<BranchGuideSurface, 'overview'>, entityKey: string) => SimpleModePageGuideState;
  updateBranchGuideState: (
    scopeKey: string,
    surface: Exclude<BranchGuideSurface, 'overview'>,
    entityKey: string,
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) => void;
  listBranchGuideStates: (scopeKey: string, surface: Exclude<BranchGuideSurface, 'overview'>) => Record<string, SimpleModePageGuideState>;
  getChainGuideState: (scopeKey: string, surface: ChainGuideSurface, entityKey: string) => SimpleModePageGuideState;
  updateChainGuideState: (
    scopeKey: string,
    surface: ChainGuideSurface,
    entityKey: string,
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) => void;
  listChainGuideStates: (scopeKey: string, surface: ChainGuideSurface) => Record<string, SimpleModePageGuideState>;
}

const UiPreferencesContext = createContext<UiPreferencesValue | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDefaultChainRoute(chainId: string) {
  return `/chains/${chainId}/overview`;
}

function isStoredChainRoute(chainId: string, path: string) {
  const chainPrefix = `/chains/${chainId}`;

  return path === chainPrefix || path.startsWith(`${chainPrefix}/`) || path.startsWith(`${chainPrefix}?`);
}

function readLastChainRouteByChain(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([chainId, path]) =>
        typeof chainId === 'string'
        && chainId.length > 0
        && typeof path === 'string'
        && isStoredChainRoute(chainId, path),
    ),
  ) as Record<string, string>;
}

function readPromptState(value: unknown): SimpleModeGuidePromptState {
  return value === 'accepted' || value === 'dismissed' ? value : 'pending';
}

function readSupplementDecision(value: unknown): SimpleModeSupplementDecision {
  return value === 'yes' || value === 'not-now' || value === 'skip-future' ? value : 'undecided';
}

function createEmptyBranchGuideScopeState() {
  return {
    overview: {},
    jumpers: {},
    companions: {},
    jumps: {},
    participation: {},
    bodymod: {},
  };
}

function createEmptyChainGuideScopeState() {
  return {
    'cosmic-backpack': {},
    'chainwide-rules': {},
    'alt-chain-builder': {},
  };
}

function readPageGuideMap(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([entityKey]) => typeof entityKey === 'string' && entityKey.length > 0)
      .map(([entityKey, state]) => [entityKey, readSimpleModePageGuideState(state)]),
  ) as Record<string, SimpleModePageGuideState>;
}

function readOverviewGuideMap(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([entityKey]) => typeof entityKey === 'string' && entityKey.length > 0)
      .map(([entityKey, state]) => [entityKey, readSimpleModeOverviewGuideState(state)]),
  ) as Record<string, SimpleModeOverviewGuideState>;
}

function readBranchGuideScopeState(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    overview: readOverviewGuideMap(record.overview),
    jumpers: readPageGuideMap(record.jumpers),
    companions: readPageGuideMap(record.companions),
    jumps: readPageGuideMap(record.jumps),
    participation: readPageGuideMap(record.participation),
    bodymod: readPageGuideMap(record.bodymod),
  };
}

function readChainGuideScopeState(value: unknown) {
  const record = isRecord(value) ? value : {};

  return {
    'cosmic-backpack': readPageGuideMap(record['cosmic-backpack']),
    'chainwide-rules': readPageGuideMap(record['chainwide-rules']),
    'alt-chain-builder': readPageGuideMap(record['alt-chain-builder']),
  };
}

function readSimpleModeGuideRegistry(value: unknown): SimpleModeGuideRegistryState {
  if (!isRecord(value)) {
    return createEmptySimpleModeGuideRegistryState();
  }

  const branch = isRecord(value.branch)
    ? Object.fromEntries(
        Object.entries(value.branch)
          .filter(([scopeKey]) => typeof scopeKey === 'string' && scopeKey.length > 0)
          .map(([scopeKey, scopeState]) => [scopeKey, readBranchGuideScopeState(scopeState)]),
      )
    : {};
  const chain = isRecord(value.chain)
    ? Object.fromEntries(
        Object.entries(value.chain)
          .filter(([scopeKey]) => typeof scopeKey === 'string' && scopeKey.length > 0)
          .map(([scopeKey, scopeState]) => [scopeKey, readChainGuideScopeState(scopeState)]),
      )
    : {};

  return {
    branch,
    chain,
  };
}

function readLegacyOverviewGuideState(value: unknown): SimpleModeOverviewGuideState {
  if (!isRecord(value)) {
    return createSimpleModeOverviewGuideState();
  }

  const jumperWizardCompleted = value.jumperWizardCompleted === true;
  const guidedJumpCount =
    typeof value.guidedJumpCount === 'number' && Number.isFinite(value.guidedJumpCount)
      ? Math.max(0, Math.trunc(value.guidedJumpCount))
      : 0;
  const promptState = readPromptState(value.wizardPromptState);
  const acknowledgedStepIds = [
    jumperWizardCompleted ? 'jumper' : null,
    guidedJumpCount > 0 ? 'jump' : null,
    guidedJumpCount > 0 ? 'participation' : null,
  ].filter((stepId): stepId is string => Boolean(stepId));

  return {
    currentStepId:
      !jumperWizardCompleted ? 'jumper' : guidedJumpCount === 0 ? 'jump' : 'participation',
    acknowledgedStepIds,
    dismissed: promptState === 'dismissed',
    updatedAt: null,
    promptState,
    iconicDecision: readSupplementDecision(value.iconicDecision),
    cosmicBackpackDecision: readSupplementDecision(value.cosmicBackpackDecision ?? value.personalRealityDecision),
    lastSupplementPromptJumpCount:
      typeof value.lastSupplementPromptJumpCount === 'number' && Number.isFinite(value.lastSupplementPromptJumpCount)
        ? Math.max(0, Math.trunc(value.lastSupplementPromptJumpCount))
        : 0,
  };
}

function readStoredUiPreferences(): UiPreferencesState {
  if (typeof window === 'undefined') {
    return {
      simpleMode: false,
      simpleModeGuideRegistry: createEmptySimpleModeGuideRegistryState(),
      lastVisitedChainId: null,
      lastChainRouteByChain: {},
    };
  }

  try {
    const rawValue = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return {
        simpleMode: false,
        simpleModeGuideRegistry: createEmptySimpleModeGuideRegistryState(),
        lastVisitedChainId: null,
        lastChainRouteByChain: {},
      };
    }

    const parsed = JSON.parse(rawValue) as StoredUiPreferences;
    const simpleModeGuideRegistry = readSimpleModeGuideRegistry(parsed.simpleModeGuideRegistry);
    const lastChainRouteByChain = readLastChainRouteByChain(parsed.lastChainRouteByChain);
    const lastVisitedChainId =
      typeof parsed.lastVisitedChainId === 'string' && parsed.lastVisitedChainId.length > 0
        ? parsed.lastVisitedChainId
        : null;

    if (isRecord(parsed.simpleModeWizardByChain)) {
      for (const [scopeKey, legacyState] of Object.entries(parsed.simpleModeWizardByChain)) {
        if (!(scopeKey in simpleModeGuideRegistry.branch)) {
          simpleModeGuideRegistry.branch[scopeKey] = createEmptyBranchGuideScopeState();
        }

        if (!(SIMPLE_MODE_GUIDE_DEFAULT_KEY in simpleModeGuideRegistry.branch[scopeKey].overview)) {
          simpleModeGuideRegistry.branch[scopeKey].overview[SIMPLE_MODE_GUIDE_DEFAULT_KEY] =
            readLegacyOverviewGuideState(legacyState);
        }
      }
    }

    return {
      simpleMode: typeof parsed.simpleMode === 'boolean' ? parsed.simpleMode : false,
      simpleModeGuideRegistry,
      lastVisitedChainId,
      lastChainRouteByChain,
    };
  } catch {
    return {
      simpleMode: false,
      simpleModeGuideRegistry: createEmptySimpleModeGuideRegistryState(),
      lastVisitedChainId: null,
      lastChainRouteByChain: {},
    };
  }
}

export function UiPreferencesProvider(props: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readStoredUiPreferences);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [preferences]);

  const setSimpleMode = useCallback((next: boolean) => {
    setPreferences((current) =>
      current.simpleMode === next
        ? current
        : {
            ...current,
            simpleMode: next,
          },
    );
  }, []);

  const getLastChainRoute = useCallback((chainId: string, fallbackPath = createDefaultChainRoute(chainId)) => {
    const storedPath = preferences.lastChainRouteByChain[chainId];

    if (!storedPath || !isStoredChainRoute(chainId, storedPath)) {
      return fallbackPath;
    }

    return storedPath;
  }, [preferences.lastChainRouteByChain]);

  const recordLastChainRoute = useCallback((chainId: string, nextPath: string) => {
    if (!isStoredChainRoute(chainId, nextPath)) {
      return;
    }

    setPreferences((current) => {
      if (
        current.lastVisitedChainId === chainId
        && current.lastChainRouteByChain[chainId] === nextPath
      ) {
        return current;
      }

      return {
        ...current,
        lastVisitedChainId: chainId,
        lastChainRouteByChain: {
          ...current.lastChainRouteByChain,
          [chainId]: nextPath,
        },
      };
    });
  }, []);

  function getOverviewGuideState(scopeKey: string) {
    return (
      preferences.simpleModeGuideRegistry.branch[scopeKey]?.overview[SIMPLE_MODE_GUIDE_DEFAULT_KEY] ??
      createSimpleModeOverviewGuideState()
    );
  }

  function updateOverviewGuideState(
    scopeKey: string,
    updater: (current: SimpleModeOverviewGuideState) => SimpleModeOverviewGuideState,
  ) {
    setPreferences((current) => {
      const currentScope = current.simpleModeGuideRegistry.branch[scopeKey] ?? createEmptyBranchGuideScopeState();
      const currentOverviewState = currentScope.overview[SIMPLE_MODE_GUIDE_DEFAULT_KEY] ?? createSimpleModeOverviewGuideState();

      return {
        ...current,
        simpleModeGuideRegistry: {
          ...current.simpleModeGuideRegistry,
          branch: {
            ...current.simpleModeGuideRegistry.branch,
            [scopeKey]: {
              ...currentScope,
              overview: {
                ...currentScope.overview,
                [SIMPLE_MODE_GUIDE_DEFAULT_KEY]: updater(currentOverviewState),
              },
            },
          },
        },
      };
    });
  }

  function getBranchGuideState(
    scopeKey: string,
    surface: Exclude<BranchGuideSurface, 'overview'>,
    entityKey: string,
  ) {
    return (
      preferences.simpleModeGuideRegistry.branch[scopeKey]?.[surface][entityKey] ??
      createSimpleModePageGuideState()
    );
  }

  function updateBranchGuideState(
    scopeKey: string,
    surface: Exclude<BranchGuideSurface, 'overview'>,
    entityKey: string,
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) {
    setPreferences((current) => {
      const currentScope = current.simpleModeGuideRegistry.branch[scopeKey] ?? createEmptyBranchGuideScopeState();
      const currentSurface = currentScope[surface];
      const currentGuideState = currentSurface[entityKey] ?? createSimpleModePageGuideState();

      return {
        ...current,
        simpleModeGuideRegistry: {
          ...current.simpleModeGuideRegistry,
          branch: {
            ...current.simpleModeGuideRegistry.branch,
            [scopeKey]: {
              ...currentScope,
              [surface]: {
                ...currentSurface,
                [entityKey]: updater(currentGuideState),
              },
            },
          },
        },
      };
    });
  }

  function listBranchGuideStates(
    scopeKey: string,
    surface: Exclude<BranchGuideSurface, 'overview'>,
  ) {
    return preferences.simpleModeGuideRegistry.branch[scopeKey]?.[surface] ?? {};
  }

  function getChainGuideState(
    scopeKey: string,
    surface: ChainGuideSurface,
    entityKey: string,
  ) {
    return (
      preferences.simpleModeGuideRegistry.chain[scopeKey]?.[surface][entityKey] ??
      createSimpleModePageGuideState()
    );
  }

  function updateChainGuideState(
    scopeKey: string,
    surface: ChainGuideSurface,
    entityKey: string,
    updater: (current: SimpleModePageGuideState) => SimpleModePageGuideState,
  ) {
    setPreferences((current) => {
      const currentScope = current.simpleModeGuideRegistry.chain[scopeKey] ?? createEmptyChainGuideScopeState();
      const currentSurface = currentScope[surface];
      const currentGuideState = currentSurface[entityKey] ?? createSimpleModePageGuideState();

      return {
        ...current,
        simpleModeGuideRegistry: {
          ...current.simpleModeGuideRegistry,
          chain: {
            ...current.simpleModeGuideRegistry.chain,
            [scopeKey]: {
              ...currentScope,
              [surface]: {
                ...currentSurface,
                [entityKey]: updater(currentGuideState),
              },
            },
          },
        },
      };
    });
  }

  function listChainGuideStates(
    scopeKey: string,
    surface: ChainGuideSurface,
  ) {
    return preferences.simpleModeGuideRegistry.chain[scopeKey]?.[surface] ?? {};
  }

  const value = useMemo(
    () => ({
      simpleMode: preferences.simpleMode,
      setSimpleMode,
      lastVisitedChainId: preferences.lastVisitedChainId,
      getLastChainRoute,
      recordLastChainRoute,
      getOverviewGuideState,
      updateOverviewGuideState,
      getBranchGuideState,
      updateBranchGuideState,
      listBranchGuideStates,
      getChainGuideState,
      updateChainGuideState,
      listChainGuideStates,
    }),
    [
      getLastChainRoute,
      preferences.lastVisitedChainId,
      preferences.simpleMode,
      preferences.simpleModeGuideRegistry,
      recordLastChainRoute,
    ],
  );

  return <UiPreferencesContext.Provider value={value}>{props.children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const value = useContext(UiPreferencesContext);

  if (!value) {
    throw new Error('useUiPreferences must be used inside UiPreferencesProvider.');
  }

  return value;
}
