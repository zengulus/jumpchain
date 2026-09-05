# Sprint 1 Foundation

This repo now starts from an importer-first foundation:

- `src/domain` defines the native entities and enums.
- `src/schemas` defines Zod validation for native records, imports, and save envelopes.
- `src/db` defines Dexie persistence with IndexedDB as the working store.
- `src/domain/import` detects and adapts ChainMaker v2 JSON through a normalized model before native mapping.
- `src/features/home` and `src/features/advanced-import` provide the first thin UI over real data.

The current implementation intentionally favors schema safety and preservation of unmapped source data over polished module screens.

## SillyTavern World Info interoperability

Jumpchain can import and export SillyTavern World Info / lorebook JSON files as worldbooks (`src/ai/sillyTavern.ts`):

- Import detects native Jumpchain worldbook JSON vs. SillyTavern World Info JSON automatically; unrelated JSON is rejected with a clear error.
- SillyTavern activation/insertion metadata (keys, secondary keys, UIDs, order, position, probability, vectorized flags, and unknown extension fields) is preserved for round-trip export.
- Jumpchain does **not** emulate SillyTavern's activation algorithm. Imported lore becomes world knowledge served by Jumpchain's own hybrid retrieval/context engine; ST metadata never controls Jumpchain context behaviour.
- Disabled ST entries import as `enabled: false` and are excluded from retrieval/index candidates while remaining persisted and editable.

Additional planning docs:

- `docs/companion-management-suite.md` outlines the next-step companion management suite.

## Supported Viewport Widths

The current app deliberately targets desktop and laptop widths.

- Mobile widths are not a supported UX target.
- Tablet widths are not a supported UX target.
- Narrow-screen behavior should be treated as best-effort fallback, not as a polished or guaranteed layout.

## GitHub Pages

This app is intended to run on GitHub Pages as built static assets, not by serving the source tree directly.

- Vite builds the app into `dist/`.
- `.github/workflows/deploy-pages.yml` deploys the built `dist/` artifact to GitHub Pages.
- The app uses `createHashRouter`, so Pages does not need SPA rewrite support.
