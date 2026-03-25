import { NavLink, Outlet } from 'react-router-dom';

export function PageShell() {
  return (
    <div className="page-shell">
      <header className="page-shell__header">
        <div className="page-shell__brand">
          <h1 className="page-shell__title">Local-First Jumpchain Tracker</h1>
          <p className="page-shell__subtitle">Desktop-first continuity tracker for branching, imports, and local saves.</p>
        </div>
        <nav className="page-shell__nav" aria-label="Primary">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/import">Import Review</NavLink>
        </nav>
      </header>
      <div className="page-shell__desktop-note" role="note">
        This build is tuned for desktop screens. Narrow windows are intentionally not a target layout.
      </div>
      <main className="page-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
