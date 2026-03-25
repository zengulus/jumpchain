import { createContext, useContext, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getChainBundle, listChainOverviews, type ChainOverview } from '../../db/persistence';
import type { NativeChainBundle } from '../../domain/save';

interface UniversalSearchDataValue {
  overviews: ChainOverview[];
  bundles: NativeChainBundle[];
}

const UniversalSearchContext = createContext<UniversalSearchDataValue | undefined>(undefined);

export function UniversalSearchProvider(props: { children: ReactNode }) {
  const value = useLiveQuery(async (): Promise<UniversalSearchDataValue> => {
    const overviews = await listChainOverviews();
    const bundles = await Promise.all(overviews.map((overview) => getChainBundle(overview.chainId)));

    return {
      overviews,
      bundles: bundles.filter((bundle): bundle is NativeChainBundle => Boolean(bundle)),
    };
  }, []);

  return <UniversalSearchContext.Provider value={value}>{props.children}</UniversalSearchContext.Provider>;
}

export function useUniversalSearchData() {
  return useContext(UniversalSearchContext);
}
