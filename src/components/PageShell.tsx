import { NavLink, Outlet } from 'react-router-dom';

export function PageShell() {
  return (
    <div className="page-shell">
      <header className="page-shell__header">
        <h1 className="page-shell__title">Local-First Jumpchain Tracker</h1>
        <nav className="page-shell__nav" aria-label="Primary">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/import">Import Review</NavLink>
        </nav>
      </header>
      <main className="page-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
