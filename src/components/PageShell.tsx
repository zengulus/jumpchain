import { NavLink, Outlet } from 'react-router-dom';
import { UniversalSearchProvider } from '../features/search/UniversalSearchContext';
import { UniversalSearchBar } from '../features/search/UniversalSearchBar';

export function PageShell() {
  return (
    <UniversalSearchProvider>
      <div className="page-shell">
        <header className="page-shell__header">
          <div className="page-shell__brand">
            <h1 className="page-shell__title">Local-First Jumpchain Tracker</h1>
            <p className="page-shell__subtitle">Desktop-first continuity tracker for branching, imports, and local saves.</p>
          </div>
          <UniversalSearchBar />
          <nav className="page-shell__nav" aria-label="Primary">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/import">Import Review</NavLink>
          </nav>
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
