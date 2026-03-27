import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getChainBundle, listChainOverviews, type ChainOverview } from '../../db/persistence';
import type { NativeChainBundle } from '../../domain/save';
import { buildUniversalSearchIndex, type UniversalSearchIndexEntry } from './searchUtils';

interface UniversalSearchDataValue {
  overviews: ChainOverview[];
  bundles: NativeChainBundle[];
  index: UniversalSearchIndexEntry[];
}

interface UniversalSearchContextValue {
  data?: UniversalSearchDataValue;
  isLoading: boolean;
  ensureLoaded: () => void;
}

const UniversalSearchContext = createContext<UniversalSearchContextValue | undefined>(undefined);

export function UniversalSearchProvider(props: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const ensureLoaded = useCallback(() => {
    setEnabled(true);
  }, []);
  const data = useLiveQuery(async (): Promise<UniversalSearchDataValue | null> => {
    if (!enabled) {
      return null;
    }

    const overviews = await listChainOverviews();
    const bundles = await Promise.all(overviews.map((overview) => getChainBundle(overview.chainId)));
    const resolvedBundles = bundles.filter((bundle): bundle is NativeChainBundle => Boolean(bundle));

    return {
      overviews,
      bundles: resolvedBundles,
      index: buildUniversalSearchIndex({
        overviews,
        bundles: resolvedBundles,
      }),
    };
  }, [enabled]);
  const value = useMemo<UniversalSearchContextValue>(
    () => ({
      data: data ?? undefined,
      isLoading: enabled && data === undefined,
      ensureLoaded,
    }),
    [data, enabled, ensureLoaded],
  );

  return <UniversalSearchContext.Provider value={value}>{props.children}</UniversalSearchContext.Provider>;
}

export function useUniversalSearchData() {
  const context = useContext(UniversalSearchContext);

  if (!context) {
    throw new Error('useUniversalSearchData must be used inside UniversalSearchProvider.');
  }

  return context;
}
