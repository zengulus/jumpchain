import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { UiPreferencesProvider, useUiPreferences } from '../app/UiPreferencesContext';
import { UniversalSearchProvider } from '../features/search/UniversalSearchContext';
import { UniversalSearchBar } from '../features/search/UniversalSearchBar';
import { readGuideRequested } from '../features/workspace/simpleModeGuides';

interface PageShellNavContextValue {
  navOpen: boolean;
  setNavOpen: Dispatch<SetStateAction<boolean>>;
  closeNav: () => void;
  toggleNav: () => void;
  registerWorkspaceDrawer: () => () => void;
}

const PageShellNavContext = createContext<PageShellNavContextValue | null>(null);

interface AppNavItem {
  to: string;
  label: string;
  description: string;
  end?: boolean;
}

export function usePageShellNav() {
  const context = useContext(PageShellNavContext);

  if (!context) {
    throw new Error('usePageShellNav must be used inside PageShell.');
  }

  return context;
}

const APP_NAV_ITEMS: AppNavItem[] = [
  {
    to: '/',
    label: 'Home',
    description: 'Chains, creation, imports, and exports.',
    end: true,
  },
  {
    to: '/search',
    label: 'Search',
    description: 'Find records across chains and modules.',
  },
  {
    to: '/import',
    label: 'Import Review',
    description: 'Review and convert external jump data.',
  },
] as const;

function AppNavigationLinks({ onNavigate, simpleMode }: { onNavigate: () => void; simpleMode: boolean }) {
  return (
    <nav className="workspace-menu-list" aria-label="App">
      {APP_NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          className={({ isActive }) => `workspace-menu-item${isActive ? ' active' : ''}`}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
        >
          <strong>{item.label}</strong>
          <span>
            {simpleMode
              ? item.to === '/'
                ? 'Open a chain or start a new one.'
                : item.to === '/search'
                  ? 'Find an existing record.'
                  : 'Review external JSON before importing it.'
              : item.description}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

function ViewModeToggle(props: { simpleMode: boolean; onToggle: () => void }) {
  return (
    <button
      className={`page-shell__mode-toggle${props.simpleMode ? ' is-active' : ''}`}
      type="button"
      aria-pressed={props.simpleMode}
      onClick={props.onToggle}
    >
      <span>View mode</span>
      <strong>{props.simpleMode ? 'Simple' : 'Normal'}</strong>
    </button>
  );
}

function PageShellContent() {
  const location = useLocation();
  const { simpleMode, setSimpleMode } = useUiPreferences();
  const [navOpen, setNavOpen] = useState(false);
  const [workspaceDrawerRegistered, setWorkspaceDrawerRegistered] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  const closeNav = useCallback(() => {
    setNavOpen(false);
  }, []);

  const toggleNav = useCallback(() => {
    setNavOpen((currentValue) => !currentValue);
  }, []);

  const registerWorkspaceDrawer = useCallback(() => {
    setWorkspaceDrawerRegistered(true);

    return () => {
      setWorkspaceDrawerRegistered(false);
    };
  }, []);

  const navContextValue = useMemo<PageShellNavContextValue>(
    () => ({
      navOpen,
      setNavOpen,
      closeNav,
      toggleNav,
      registerWorkspaceDrawer,
    }),
    [closeNav, navOpen, registerWorkspaceDrawer, toggleNav],
  );
  const activeDrawerId = workspaceDrawerRegistered ? 'workspace-sidebar' : 'page-shell-drawer';
  const guidedSetupActive =
    simpleMode
    && Boolean(matchPath('/chains/:chainId/*', location.pathname))
    && readGuideRequested(new URLSearchParams(location.search));

  return (
    <PageShellNavContext.Provider value={navContextValue}>
      <UniversalSearchProvider>
        <div
          className="page-shell"
          data-ui-mode={simpleMode ? 'simple' : 'advanced'}
          data-has-workspace-nav={workspaceDrawerRegistered ? 'true' : 'false'}
        >
          <header className="page-shell__header">
            <button
              className={`page-shell__nav-toggle${navOpen ? ' is-active' : ''}`}
              type="button"
              aria-expanded={navOpen}
              aria-controls={activeDrawerId}
              onClick={toggleNav}
            >
              <span className="page-shell__nav-toggle__icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>Navigation</span>
            </button>
            <div className="page-shell__brand">
              <h1 className="page-shell__title">
                <Link className="page-shell__title-link" to="/">
                  Local-First Jumpchain Tracker
                </Link>
              </h1>
              <p className="page-shell__subtitle">
                {simpleMode
                  ? 'Resume a chain or start a new one.'
                  : 'Local-first continuity, imports, snapshots, and supplement planning.'}
              </p>
            </div>
            {guidedSetupActive ? null : <UniversalSearchBar />}
            <div className="page-shell__header-controls">
              <ViewModeToggle simpleMode={simpleMode} onToggle={() => setSimpleMode(!simpleMode)} />
            </div>
          </header>

          {!workspaceDrawerRegistered ? (
            <>
              {navOpen ? (
                <button
                  className="page-shell__drawer-backdrop"
                  type="button"
                  aria-label="Close navigation"
                  onClick={closeNav}
                />
              ) : null}
                <aside className={`page-shell__drawer${navOpen ? ' is-open' : ''}`} id="page-shell-drawer">
                  <section className="workspace-sidebar-card workspace-sidebar-card--dense stack stack--compact">
                    <div className="section-heading">
                      <h3>App</h3>
                      <span className="pill">{simpleMode ? 'Simple' : 'Normal'}</span>
                    </div>
                    <AppNavigationLinks onNavigate={closeNav} simpleMode={simpleMode} />
                  </section>
                </aside>
            </>
          ) : null}

          <div className="page-shell__desktop-note" role="note">
            {simpleMode
              ? 'Simple mode works best on desktop or a wider window.'
              : 'Normal mode keeps more data visible at once on desktop or a wider window.'}
          </div>
          <main className="page-shell__main">
            <Outlet />
          </main>
        </div>
      </UniversalSearchProvider>
    </PageShellNavContext.Provider>
  );
}

export function PageShell() {
  return (
    <UiPreferencesProvider>
      <PageShellContent />
    </UiPreferencesProvider>
  );
}
