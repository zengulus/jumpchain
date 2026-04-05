import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { SearchHighlight } from './SearchHighlight';
import { useUniversalSearchData } from './UniversalSearchContext';
import {
  extractSearchTerms,
  filterUniversalSearchResults,
  queryUniversalSearchResults,
  readRouteSearchValue,
  readUniversalSearchCategory,
  universalSearchCategoryOptions,
  withSearchParams,
  type UniversalSearchCategory,
} from './searchUtils';

interface SearchCommandItem {
  id: string;
  title: string;
  subtitle: string;
  to: string;
}

interface SearchPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  snippet?: string;
  to: string;
  kindLabel: string;
  isCommand: boolean;
}

function matchesTerms(query: string, ...values: string[]) {
  const terms = extractSearchTerms(query);

  if (terms.length === 0) {
    return true;
  }

  const haystack = values.join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function UniversalSearchBar() {
  const { simpleMode, lastVisitedChainId, getLastChainRoute } = useUiPreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: searchData, ensureLoaded, isLoading } = useUniversalSearchData();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftQuery, setDraftQuery] = useState(() => readRouteSearchValue(location.search));
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<UniversalSearchCategory>(() =>
    readUniversalSearchCategory(new URLSearchParams(location.search).get('kind')),
  );
  const [currentChainOnly, setCurrentChainOnly] = useState(
    () => new URLSearchParams(location.search).get('scope') === 'current-chain',
  );
  const currentChainId = matchPath('/chains/:chainId/*', location.pathname)?.params.chainId;
  const preferredChainId = currentChainId ?? new URLSearchParams(location.search).get('chain') ?? undefined;
  const trimmedQuery = draftQuery.trim();
  const deferredTrimmedQuery = useDeferredValue(trimmedQuery);
  const rawResults = useMemo(
    () =>
      searchData
        ? queryUniversalSearchResults({
            query: deferredTrimmedQuery,
            index: searchData.index,
            preferredChainId,
          })
        : [],
    [deferredTrimmedQuery, preferredChainId, searchData],
  );
  const filteredResults = useMemo(
    () =>
      filterUniversalSearchResults({
        results: rawResults,
        preferredChainId,
        currentChainOnly,
        category: activeCategory,
      }),
    [activeCategory, currentChainOnly, preferredChainId, rawResults],
  );
  const previewResults = filteredResults.slice(0, 8);
  const searchPagePath = withSearchParams('/search', {
    q: trimmedQuery,
    chain: preferredChainId,
    scope: currentChainOnly ? 'current-chain' : undefined,
    kind: activeCategory === 'all' ? undefined : activeCategory,
  });
  const searchLabel = simpleMode ? 'Search existing records' : 'Search';
  const searchPlaceholder = simpleMode
    ? 'Find a chain, jumper, or jump you already made...'
    : 'Search chains, jumpers, jumps, effects, notes, or use Ctrl/Cmd+K';
  const searchPanelTitle = simpleMode ? 'Search results' : 'Quick results';
  const submitLabel = simpleMode ? 'Find' : 'Search';
  const commandActions = useMemo<SearchCommandItem[]>(() => {
    const actions: SearchCommandItem[] = [];

    if (trimmedQuery.length > 0) {
      actions.push({
        id: 'command-search-page',
        title: `View all results for "${trimmedQuery}"`,
        subtitle: 'Open the full results page with the current filters applied.',
        to: searchPagePath,
      });
    }

    if (trimmedQuery.length === 0 && lastVisitedChainId) {
      actions.push({
        id: 'command-resume-last',
        title: 'Resume Last Workspace',
        subtitle: 'Jump back to the last chain page you worked in.',
        to: getLastChainRoute(lastVisitedChainId),
      });
    }

    return actions.filter((action) => matchesTerms(trimmedQuery, action.title, action.subtitle));
  }, [getLastChainRoute, lastVisitedChainId, searchPagePath, trimmedQuery]);
  const paletteItems = useMemo<SearchPaletteItem[]>(
    () => [
      ...commandActions.map((action) => ({
        ...action,
        kindLabel: 'Command',
        isCommand: true,
      })),
      ...previewResults.map((result) => ({
        id: result.id,
        title: result.title,
        subtitle: result.subtitle,
        snippet: result.snippet,
        to: result.to,
        kindLabel: result.kindLabel,
        isCommand: false,
      })),
    ],
    [commandActions, previewResults],
  );

  useEffect(() => {
    setDraftQuery(readRouteSearchValue(location.search));
    setActiveCategory(readUniversalSearchCategory(new URLSearchParams(location.search).get('kind')));
    setCurrentChainOnly(new URLSearchParams(location.search).get('scope') === 'current-chain');
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!preferredChainId && currentChainOnly) {
      setCurrentChainOnly(false);
    }
  }, [currentChainOnly, preferredChainId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeCategory, currentChainOnly, draftQuery, isOpen, paletteItems.length]);

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

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ensureLoaded();
        setIsOpen(true);
        window.setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 0);
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [ensureLoaded]);

  function handleSelectPath(to: string) {
    navigate(to);
    setIsOpen(false);
  }

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
          <div className="page-shell__search-heading">
            <span className="page-shell__search-label">{searchLabel}</span>
            <span className="page-shell__search-shortcut">Ctrl/Cmd+K</span>
          </div>
          <input
            id="site-search"
            ref={inputRef}
            type="search"
            value={draftQuery}
            placeholder={searchPlaceholder}
            onChange={(event) => {
              ensureLoaded();
              setDraftQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              ensureLoaded();
              setIsOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsOpen(false);
                return;
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                ensureLoaded();
                setIsOpen(true);
                setSelectedIndex((currentValue) => Math.min(currentValue + 1, Math.max(0, paletteItems.length - 1)));
                return;
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                ensureLoaded();
                setIsOpen(true);
                setSelectedIndex((currentValue) => Math.max(0, currentValue - 1));
                return;
              }

              if (event.key === 'Enter' && isOpen && paletteItems.length > 0) {
                event.preventDefault();
                handleSelectPath(paletteItems[Math.min(selectedIndex, paletteItems.length - 1)].to);
              }
            }}
          />
        </label>
        <button className="button button--secondary page-shell__search-submit" type="submit">
          {submitLabel}
        </button>
      </form>

      {isOpen ? (
        <div className="page-shell__search-panel">
          <div className="page-shell__search-panel-header">
            <strong>{searchPanelTitle}</strong>
            <span>
              {searchData
                ? `${commandActions.length + filteredResults.length} items`
                : isLoading
                  ? 'Building index...'
                  : 'Type to search stored data'}
            </span>
          </div>

          <div className="search-filter-row">
            {preferredChainId ? (
              <button
                className={`search-filter-chip${currentChainOnly ? ' is-active' : ''}`}
                type="button"
                onClick={() => setCurrentChainOnly(!currentChainOnly)}
              >
                Current Chain
              </button>
            ) : null}
            {universalSearchCategoryOptions.map((option) => (
              <button
                className={`search-filter-chip${activeCategory === option.id ? ' is-active' : ''}`}
                key={option.id}
                type="button"
                onClick={() => setActiveCategory(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {commandActions.length > 0 ? (
            <section className="page-shell__search-section">
              <div className="page-shell__search-section-heading">
                <strong>Commands</strong>
                <span>{commandActions.length}</span>
              </div>
              <div className="page-shell__search-results">
                {commandActions.map((action, index) => (
                  <button
                    className={`page-shell__search-result page-shell__search-result--command${selectedIndex === index ? ' is-selected' : ''}`}
                    key={action.id}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleSelectPath(action.to)}
                  >
                    <div className="page-shell__search-result-topline">
                      <strong>
                        <SearchHighlight text={action.title} query={trimmedQuery} />
                      </strong>
                      <span className="pill pill--soft">Command</span>
                    </div>
                    <span className="page-shell__search-result-subtitle">
                      <SearchHighlight text={action.subtitle} query={trimmedQuery} />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {trimmedQuery.length === 0 ? (
            <div className="page-shell__search-empty">Start typing to search stored data.</div>
          ) : trimmedQuery.length < 2 ? (
            <div className="page-shell__search-empty">
              Type at least two characters to search stored data.
            </div>
          ) : !searchData ? (
            <div className="page-shell__search-empty">Loading the current search index from IndexedDB...</div>
          ) : previewResults.length === 0 ? (
            <div className="page-shell__search-empty">No stored records match that query with the current filters.</div>
          ) : (
            <section className="page-shell__search-section">
              <div className="page-shell__search-section-heading">
                <strong>Results</strong>
                <span>{filteredResults.length}</span>
              </div>
              <div className="page-shell__search-results">
                {previewResults.map((result, index) => {
                  const paletteIndex = commandActions.length + index;

                  return (
                    <button
                      className={`page-shell__search-result${selectedIndex === paletteIndex ? ' is-selected' : ''}`}
                      key={result.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(paletteIndex)}
                      onClick={() => handleSelectPath(result.to)}
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
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {trimmedQuery.length > 0 ? (
            <div className="page-shell__search-panel-footer">
              <button className="button button--secondary" type="button" onClick={() => handleSelectPath(searchPagePath)}>
                View All Results
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
