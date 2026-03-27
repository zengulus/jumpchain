import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { SearchHighlight } from './SearchHighlight';
import { useUniversalSearchData } from './UniversalSearchContext';
import { buildUniversalSearchResults, readRouteSearchValue, withSearchParams } from './searchUtils';

export function UniversalSearchBar() {
  const { simpleMode } = useUiPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const searchData = useUniversalSearchData();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draftQuery, setDraftQuery] = useState(() => readRouteSearchValue(location.search));
  const [isOpen, setIsOpen] = useState(false);
  const currentChainId = matchPath('/chains/:chainId/*', location.pathname)?.params.chainId;
  const preferredChainId = currentChainId ?? new URLSearchParams(location.search).get('chain') ?? undefined;
  const trimmedQuery = draftQuery.trim();
  const results = useMemo(
    () =>
      searchData
        ? buildUniversalSearchResults({
            query: trimmedQuery,
            overviews: searchData.overviews,
            bundles: searchData.bundles,
            preferredChainId,
          })
        : [],
    [preferredChainId, searchData, trimmedQuery],
  );
  const previewResults = results.slice(0, 12);
  const searchPagePath = withSearchParams('/search', {
    q: trimmedQuery,
    chain: preferredChainId,
  });
  const searchLabel = simpleMode ? 'Search existing records' : 'Search everything';
  const searchPlaceholder = simpleMode
    ? 'Find a chain, jumper, or jump you already made...'
    : 'Search chains, jumpers, jumps, effects, notes...';
  const searchPanelTitle = simpleMode ? 'Search results' : 'Universal Search';
  const submitLabel = simpleMode ? 'Find' : 'Search';

  useEffect(() => {
    setDraftQuery(readRouteSearchValue(location.search));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedQuery.length === 0) {
      setIsOpen(false);
      return;
    }

    navigate(searchPagePath);
    setIsOpen(false);
  }

  return (
    <div className={`page-shell__search${simpleMode ? ' is-simple' : ''}`} ref={containerRef}>
      <form className="page-shell__search-form" onSubmit={handleSubmit}>
        <label className="page-shell__search-field" htmlFor="site-search">
          <span className="page-shell__search-label">{searchLabel}</span>
          <input
            id="site-search"
            type="search"
            value={draftQuery}
            placeholder={searchPlaceholder}
            onChange={(event) => {
              setDraftQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false);
              }
            }}
          />
        </label>
        <button className="button button--secondary page-shell__search-submit" type="submit">
          {submitLabel}
        </button>
      </form>

      {isOpen && trimmedQuery.length > 0 ? (
        <div className="page-shell__search-panel">
          <div className="page-shell__search-panel-header">
            <strong>{searchPanelTitle}</strong>
            <span>{searchData ? `${results.length} matches` : 'Building index...'}</span>
          </div>

          {trimmedQuery.length < 2 ? (
            <div className="page-shell__search-empty">
              {simpleMode
                ? 'Type at least two characters to search through things you have already stored here.'
                : 'Type at least two characters to search across stored data and module pages.'}
            </div>
          ) : !searchData ? (
            <div className="page-shell__search-empty">Loading the current search index from IndexedDB...</div>
          ) : previewResults.length === 0 ? (
            <div className="page-shell__search-empty">No matches yet for that query.</div>
          ) : (
            <>
              <div className="page-shell__search-results">
                {previewResults.map((result) => (
                  <Link
                    className="page-shell__search-result"
                    key={result.id}
                    to={result.to}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="page-shell__search-result-topline">
                      <strong>
                        <SearchHighlight text={result.title} query={trimmedQuery} />
                      </strong>
                      <span className="pill pill--soft">{result.kindLabel}</span>
                    </div>
                    <span className="page-shell__search-result-subtitle">
                      <SearchHighlight text={result.subtitle} query={trimmedQuery} />
                    </span>
                    {result.snippet ? (
                      <p>
                        <SearchHighlight text={result.snippet} query={trimmedQuery} />
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>

              <div className="page-shell__search-panel-footer">
                <Link className="button button--secondary" to={searchPagePath} onClick={() => setIsOpen(false)}>
                  View All Results
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
