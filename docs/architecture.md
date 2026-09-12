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

## AI context policy foundation

Factual conflict resolution and context admission are separate authorities; context admission is planned centrally from typed candidates.

Before this change, narration admitted mandatory layers by call order, then spent a separate mechanics allowance, accepted pre-sliced retrieval results, and filled a separate history budget. `GMService.retrieve` selected lore/memory counts after a global search limit. State analysis selected 16 retrieval hits independently, and a separate structured-task check calculated the remaining window for analysis, summaries, and document extraction.

`src/ai/planner.ts` now provides a pure `planContext` operation over `ContextCandidate` records. Each candidate carries stable identity, exact rendered content, source IDs, domain, authority, salience, mandatory status, relevance and its signal, estimated cost, source class, and an optional budget pool, chronology sequence, and presentation section. These are distinct fields, not a combined priority. Authority and domain never participate in admission sorting.

The planner reserves mandatory candidates first and throws on overflow. Optional admission follows directive, focused, required, relevant, then background salience; relevance breaks ties within a level, and ordinal candidate IDs provide the final stable key. Tail pools form explicit groups after ordinary candidates at the same salience, examine newest exchanges first, and stop admitting older exchanges after any gap. Selected history renders chronologically. Narration declares system/history/action presentation sections in its policy; the planner orders these sections after admission, independently of salience. Duplicate identities and invalid costs/caps fail explicitly. Enumeration order never serves as a tie breaker.

`src/ai/budget.ts` implements the input window minus output and 512-token safety reserve once, including provider validation. UTF-8 bytes provide the conservative token estimate; candidates account for their rendered framing and message overhead. Exact tracker strings are not summarized or rewritten. The narrator gets mandatory tracker restrictions even under thousands of optional candidates; failure occurs before narration if they cannot fit.

Retained specialist boundaries:

* Tracker selectors and `mechanicalRecords` determine which mechanics actually exist and are active. They remain the mechanical authority; campaign state cannot replace them.
* Retrieval resolves chronology, scope, supersession, and keyed factual conflicts before BM25/dense ranking. Authority no longer contributes a ranking bonus. It retains a generic search-result limit for search callers, but GM context callers request all matching records. Embeddings and reranking remain optional; missing/stale indexes and failed endpoints fall back to lexical search. Retrieved records retain source provenance and scope. No vector index is authoritative.
* Narration constructs tracker, current scene, NPC objective/epistemic, lore, memory, and exchange candidates. Mechanics and chat retain token caps; loreDepth and memoryDepth become count caps on admitted records. A too-large optional record does not consume a count slot, so a smaller subsequent candidate can fit. All search matches reach admission, removing the former global top-30 starvation behavior. Cross-class optional candidates now compete by salience and relevance rather than incidental call order; current lexical and retrieval signals retain their existing scales.
* State analysis constructs complete mandatory instructions, exchange and relevant NPC/scene state, plus eligible optional prior facts/events with a 16-record pool cap. It preserves full prior records for review. Summaries and document extraction require their complete selected sources. These tasks share planning, not narration layers. Prompt rendering remains task-specific.
* NPC epistemic labels never become objective world-state labels, including when focused or mandatory. Explicit focus is a typed planner seam; no new UI or factual-conflict mechanism is implied.

Compiled narration stores the full plan alongside existing layers/messages. Every decision records candidate metadata, relevance signal, inclusion or omission reason, and the affected budget/pool. The plan also stores the policy and its cap values. State analysis persists `extractionPlan` with its exact sent messages. Optional fields allow old contexts and turns to load without inventing historical decision metadata. Omission ID arrays no longer have the old 500-item schema cap, so large chains round-trip. Omission never means an ability is absent. Existing context export includes the narration plan.

Regression coverage includes permutation invariance, stable ties, focus/authority separation, restriction overflow/survival, NPC isolation, exact and overflowing budgets, per-pool caps, history gaps, large persisted omission lists, retrieval degradation, and Sheet Only without network calls. A structural guard rejects finite-window arithmetic in task modules. A service architecture guard replaces planner entry points with rejection sentinels and verifies narration, analysis, summaries, and document extraction all stop before model invocation. Specialist eligibility and prompt construction are intentionally outside that guard's ownership claim.
