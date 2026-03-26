import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const UI_PREFERENCES_STORAGE_KEY = 'jumpchain.uiPreferences';

interface StoredUiPreferences {
  simpleMode?: unknown;
}

interface UiPreferencesValue {
  simpleMode: boolean;
  setSimpleMode: (next: boolean) => void;
}

const UiPreferencesContext = createContext<UiPreferencesValue | undefined>(undefined);

function readStoredUiPreferences(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const rawValue = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);

    if (!rawValue) {
      return false;
    }

    const parsed = JSON.parse(rawValue) as StoredUiPreferences;
    return typeof parsed.simpleMode === 'boolean' ? parsed.simpleMode : false;
  } catch {
    return false;
  }
}

export function UiPreferencesProvider(props: { children: ReactNode }) {
  const [simpleMode, setSimpleMode] = useState(readStoredUiPreferences);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        UI_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          simpleMode,
        }),
      );
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [simpleMode]);

  const value = useMemo(
    () => ({
      simpleMode,
      setSimpleMode,
    }),
    [simpleMode],
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
