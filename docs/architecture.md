# Sprint 1 Foundation

This repo now starts from an importer-first foundation:

- `src/domain` defines the native entities and enums.
- `src/schemas` defines Zod validation for native records, imports, and save envelopes.
- `src/db` defines Dexie persistence with IndexedDB as the working store.
- `src/domain/import` detects and adapts ChainMaker v2 JSON through a normalized model before native mapping.
- `src/features/home` and `src/features/advanced-import` provide the first thin UI over real data.

The current implementation intentionally favors schema safety and preservation of unmapped source data over polished module screens.

Additional planning docs:

- `docs/companion-management-suite.md` outlines the next-step companion management suite.

## GitHub Pages

This app is intended to run on GitHub Pages as built static assets, not by serving the source tree directly.

- Vite builds the app into `dist/`.
- `.github/workflows/deploy-pages.yml` deploys the built `dist/` artifact to GitHub Pages.
- The app uses `createHashRouter`, so Pages does not need SPA rewrite support.
