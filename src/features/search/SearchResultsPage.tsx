import { Link, useSearchParams } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { SearchHighlight } from './SearchHighlight';
import { useUniversalSearchData } from './UniversalSearchContext';
import { buildUniversalSearchResults, normalizeSearchQuery } from './searchUtils';

export function SearchResultsPage() {
  const { simpleMode } = useUiPreferences();
  const [searchParams] = useSearchParams();
  const searchData = useUniversalSearchData();
  const query = searchParams.get('q') ?? '';
  const preferredChainId = searchParams.get('chain') ?? undefined;
  const normalizedQuery = normalizeSearchQuery(query);
  const results =
    searchData && normalizedQuery.length > 0
      ? buildUniversalSearchResults({
          query,
          overviews: searchData.overviews,
          bundles: searchData.bundles,
          preferredChainId,
        })
      : [];

  return (
    <div className="search-page stack">
      <section className="hero stack stack--compact">
        <h2>Universal Search</h2>
        <p>
          {simpleMode
            ? 'Search everything from one place, then jump straight to the matching page.'
            : 'Search chains, active-branch records, notes, effects, participation data, backups, and the Personal Reality builder from one place.'}
        </p>
        <div className="inline-meta">
          <span className="pill">{normalizedQuery.length > 0 ? `Query: ${query}` : 'Enter a query in the header'}</span>
          {searchData ? <span className="pill pill--soft">{results.length} matches</span> : <span className="pill pill--soft">Loading...</span>}
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
          <p>Use the top banner search box to start filtering across chains and workspace modules.</p>
        </section>
      ) : results.length === 0 ? (
        <section className="card stack">
          <h3>No matches</h3>
          <p>No stored chain data or workspace pages matched that query.</p>
        </section>
      ) : (
        <section className="search-page__results">
          {results.map((result) => (
            <Link className="search-page__result" key={result.id} to={result.to}>
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
          ))}
        </section>
      )}
    </div>
  );
}
