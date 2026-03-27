import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const UI_PREFERENCES_STORAGE_KEY = 'jumpchain.uiPreferences';

export type SimpleModeSupplementDecision = 'undecided' | 'yes' | 'not-now' | 'skip-future';
export type SimpleModeWizardPromptState = 'pending' | 'accepted' | 'dismissed';

export interface SimpleModeWizardState {
  wizardPromptState: SimpleModeWizardPromptState;
  jumperWizardCompleted: boolean;
  guidedJumpCount: number;
  lastSupplementPromptJumpCount: number;
  iconicDecision: SimpleModeSupplementDecision;
  cosmicBackpackDecision: SimpleModeSupplementDecision;
  iconicGuideCompleted: boolean;
  cosmicBackpackGuideCompleted: boolean;
}

interface StoredUiPreferences {
  simpleMode?: unknown;
  simpleModeWizardByChain?: unknown;
}

interface UiPreferencesState {
  simpleMode: boolean;
  simpleModeWizardByChain: Record<string, SimpleModeWizardState>;
}

interface UiPreferencesValue {
  simpleMode: boolean;
  setSimpleMode: (next: boolean) => void;
  getSimpleModeWizardState: (chainId: string) => SimpleModeWizardState;
  updateSimpleModeWizardState: (
    chainId: string,
    updater: (current: SimpleModeWizardState) => SimpleModeWizardState,
  ) => void;
}

const UiPreferencesContext = createContext<UiPreferencesValue | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDefaultSimpleModeWizardState(): SimpleModeWizardState {
  return {
    wizardPromptState: 'pending',
    jumperWizardCompleted: false,
    guidedJumpCount: 0,
    lastSupplementPromptJumpCount: 0,
    iconicDecision: 'undecided',
    cosmicBackpackDecision: 'undecided',
    iconicGuideCompleted: false,
    cosmicBackpackGuideCompleted: false,
  };
}

function readSimpleModeWizardPromptState(value: unknown): SimpleModeWizardPromptState {
  return value === 'accepted' || value === 'dismissed' ? value : 'pending';
}

function readSimpleModeDecision(value: unknown): SimpleModeSupplementDecision {
  return value === 'yes' || value === 'not-now' || value === 'skip-future' ? value : 'undecided';
}

function readSimpleModeWizardState(value: unknown): SimpleModeWizardState {
  if (!isRecord(value)) {
    return createDefaultSimpleModeWizardState();
  }

  return {
    wizardPromptState: readSimpleModeWizardPromptState(value.wizardPromptState),
    jumperWizardCompleted: value.jumperWizardCompleted === true,
    guidedJumpCount:
      typeof value.guidedJumpCount === 'number' && Number.isFinite(value.guidedJumpCount)
        ? Math.max(0, Math.trunc(value.guidedJumpCount))
        : 0,
    lastSupplementPromptJumpCount:
      typeof value.lastSupplementPromptJumpCount === 'number' && Number.isFinite(value.lastSupplementPromptJumpCount)
        ? Math.max(0, Math.trunc(value.lastSupplementPromptJumpCount))
        : 0,
    iconicDecision: readSimpleModeDecision(value.iconicDecision),
    cosmicBackpackDecision: readSimpleModeDecision(value.cosmicBackpackDecision ?? value.personalRealityDecision),
    iconicGuideCompleted: value.iconicGuideCompleted === true,
    cosmicBackpackGuideCompleted: value.cosmicBackpackGuideCompleted === true || value.personalRealityGuideCompleted === true,
  };
}

function readStoredUiPreferences(): UiPreferencesState {
  if (typeof window === 'undefined') {
    return {
      simpleMode: false,
      simpleModeWizardByChain: {},
    };
  }

  try {
    const rawValue = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return {
        simpleMode: false,
        simpleModeWizardByChain: {},
      };
    }

    const parsed = JSON.parse(rawValue) as StoredUiPreferences;
    const simpleModeWizardByChain = isRecord(parsed.simpleModeWizardByChain)
      ? Object.fromEntries(
          Object.entries(parsed.simpleModeWizardByChain)
            .filter(([chainId]) => typeof chainId === 'string' && chainId.length > 0)
            .map(([chainId, value]) => [chainId, readSimpleModeWizardState(value)]),
        )
      : {};

    return {
      simpleMode: typeof parsed.simpleMode === 'boolean' ? parsed.simpleMode : false,
      simpleModeWizardByChain,
    };
  } catch {
    return {
      simpleMode: false,
      simpleModeWizardByChain: {},
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

  function setSimpleMode(next: boolean) {
    setPreferences((current) => ({
      ...current,
      simpleMode: next,
    }));
  }

  function getSimpleModeWizardState(chainId: string) {
    return preferences.simpleModeWizardByChain[chainId] ?? createDefaultSimpleModeWizardState();
  }

  function updateSimpleModeWizardState(
    chainId: string,
    updater: (current: SimpleModeWizardState) => SimpleModeWizardState,
  ) {
    setPreferences((current) => ({
      ...current,
      simpleModeWizardByChain: {
        ...current.simpleModeWizardByChain,
        [chainId]: updater(current.simpleModeWizardByChain[chainId] ?? createDefaultSimpleModeWizardState()),
      },
    }));
  }

  const value = useMemo(
    () => ({
      simpleMode: preferences.simpleMode,
      setSimpleMode,
      getSimpleModeWizardState,
      updateSimpleModeWizardState,
    }),
    [preferences.simpleMode, preferences.simpleModeWizardByChain],
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
