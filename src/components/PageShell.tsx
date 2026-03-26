import { NavLink, Outlet } from 'react-router-dom';
import { UiPreferencesProvider, useUiPreferences } from '../app/UiPreferencesContext';
import { UniversalSearchProvider } from '../features/search/UniversalSearchContext';
import { UniversalSearchBar } from '../features/search/UniversalSearchBar';

function PageShellContent() {
  const { simpleMode, setSimpleMode } = useUiPreferences();

  return (
    <UniversalSearchProvider>
      <div className="page-shell" data-ui-mode={simpleMode ? 'simple' : 'advanced'}>
        <header className="page-shell__header">
          <div className="page-shell__brand">
            <h1 className="page-shell__title">Local-First Jumpchain Tracker</h1>
            <p className="page-shell__subtitle">Desktop-first continuity tracker for branching, imports, and local saves.</p>
          </div>
          <UniversalSearchBar />
          <div className="page-shell__header-controls">
            <nav className="page-shell__nav" aria-label="Primary">
              <NavLink to="/" end>
                Home
              </NavLink>
              <NavLink to="/search">Search</NavLink>
              <NavLink to="/import">Import Review</NavLink>
            </nav>
            <button
              className={`page-shell__mode-toggle${simpleMode ? ' is-active' : ''}`}
              type="button"
              aria-pressed={simpleMode}
              onClick={() => setSimpleMode(!simpleMode)}
            >
              <span>Simple Mode</span>
              <strong>{simpleMode ? 'On' : 'Off'}</strong>
            </button>
          </div>
        </header>
        <div className="page-shell__desktop-note" role="note">
          This build works best on desktop. Dense worksheet modules will condense on narrower windows.
        </div>
        <main className="page-shell__main">
          <Outlet />
        </main>
      </div>
    </UniversalSearchProvider>
  );
}

export function PageShell() {
  return (
    <UiPreferencesProvider>
      <PageShellContent />
    </UiPreferencesProvider>
  );
}
