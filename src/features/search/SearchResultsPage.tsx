import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { SearchHighlight } from './SearchHighlight';
import { useUniversalSearchData } from './UniversalSearchContext';
import {
  extractSearchTerms,
  filterUniversalSearchResults,
  normalizeSearchQuery,
  queryUniversalSearchResults,
  readUniversalSearchCategory,
  universalSearchCategoryOptions,
  withSearchParams,
} from './searchUtils';

function appendSearchTerm(query: string, term: string) {
  return Array.from(new Set([...extractSearchTerms(query), ...extractSearchTerms(term)])).join(' ');
}

export function SearchResultsPage() {
  const { simpleMode } = useUiPreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: searchData, ensureLoaded, isLoading } = useUniversalSearchData();
  const query = searchParams.get('q') ?? '';
  const preferredChainId = searchParams.get('chain') ?? undefined;
  const currentChainOnly = searchParams.get('scope') === 'current-chain';
  const activeCategory = readUniversalSearchCategory(searchParams.get('kind'));
  const normalizedQuery = normalizeSearchQuery(query);
  const rawResults = useMemo(
    () =>
      searchData && normalizedQuery.length > 0
        ? queryUniversalSearchResults({
            query,
            index: searchData.index,
            preferredChainId,
          })
        : [],
    [normalizedQuery.length, preferredChainId, query, searchData],
  );
  const results = useMemo(
    () =>
      filterUniversalSearchResults({
        results: rawResults,
        preferredChainId,
        currentChainOnly,
        category: activeCategory,
      }),
    [activeCategory, currentChainOnly, preferredChainId, rawResults],
  );

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  function updateFilter(key: 'scope' | 'kind', value: string | null) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (value && value.trim().length > 0) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }

      return nextParams;
    });
  }

  return (
    <div className="search-page stack">
      <section className="hero stack stack--compact">
        <h2>Universal Search</h2>
        <p>
          {simpleMode
            ? 'Search everything from one place, filter the results, then jump straight to the matching page.'
            : 'Search stored records, narrow the results, and jump straight to the matching page.'}
        </p>
        <div className="inline-meta">
          <span className="pill">{normalizedQuery.length > 0 ? `Query: ${query}` : 'Enter a query in the header'}</span>
          {searchData ? <span className="pill pill--soft">{results.length} matches</span> : <span className="pill pill--soft">{isLoading ? 'Loading...' : 'Search idle'}</span>}
        </div>

        <div className="search-filter-row">
          {preferredChainId ? (
            <button
              className={`search-filter-chip${currentChainOnly ? ' is-active' : ''}`}
              type="button"
              onClick={() => updateFilter('scope', currentChainOnly ? null : 'current-chain')}
            >
              Current Chain
            </button>
          ) : null}
          {universalSearchCategoryOptions.map((option) => (
            <button
              className={`search-filter-chip${activeCategory === option.id ? ' is-active' : ''}`}
              key={option.id}
              type="button"
              onClick={() => updateFilter('kind', option.id === 'all' ? null : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {!searchData ? (
        <section className="card stack">
          <h3>Loading search index</h3>
          <p>Reading stored chains and active-branch workspaces out of IndexedDB.</p>
        </section>
      ) : normalizedQuery.length === 0 ? (
        <section className="card stack">
          <h3>No query yet</h3>
          <p>Use the top banner search box or `Ctrl/Cmd+K` to start filtering across chains and workspace modules.</p>
        </section>
      ) : results.length === 0 ? (
        <section className="card stack">
          <h3>No matches</h3>
          <p>No stored chain data or workspace pages matched that query with the current filters.</p>
        </section>
      ) : (
        <section className="search-page__results">
          {results.map((result) => (
            <article className="search-page__result" key={result.id}>
              <Link className="search-page__result-link" to={result.to}>
                <div className="search-page__result-topline">
                  <div className="stack stack--compact">
                    <strong>
                      <SearchHighlight text={result.title} query={query} />
                    </strong>
                    {simpleMode ? null : (
                      <span className="search-page__result-subtitle">
                        <SearchHighlight text={result.subtitle} query={query} />
                      </span>
                    )}
                  </div>
                  <div className="inline-meta">
                    <span className="pill">{result.chainTitle}</span>
                    {simpleMode ? null : <span className="pill pill--soft">{result.kindLabel}</span>}
                  </div>
                </div>
                {simpleMode ? (
                  <span className="search-page__result-subtitle">
                    <SearchHighlight text={result.subtitle} query={query} />
                  </span>
                ) : null}
                {result.snippet ? (
                  <p>
                    <SearchHighlight text={result.snippet} query={query} />
                  </p>
                ) : null}
              </Link>

              {result.tags.length > 0 ? (
                <div className="search-page__result-tags">
                  {result.tags.map((tag) => (
                    <Link
                      className="pill pill--soft search-page__result-tag"
                      key={`${result.id}-${tag}`}
                      to={withSearchParams('/search', {
                        q: appendSearchTerm(query, tag),
                        chain: preferredChainId,
                        scope: currentChainOnly ? 'current-chain' : undefined,
                        kind: activeCategory === 'all' ? undefined : activeCategory,
                      })}
                    >
                      <SearchHighlight text={tag} query={query} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
