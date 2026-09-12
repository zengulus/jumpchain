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
* One canonical searchable projection (`retrieval.ts::searchableText`: title, entities/aliases, tags, text) feeds BM25 documents, embedding index construction, reranking inputs, and the index fingerprint, so metadata authored for retrieval behaves consistently across lexical and dense retrieval and metadata edits invalidate dense indexes. Narration-time lore queries are built by one pure helper (`narrationLoreQuery`: action plus the scene's location and active threads), shared by generation retrieval and mechanics-pool scoring; these are ranking signals only — never activation triggers, hard filters, or SillyTavern key emulation.
* Narration constructs tracker, current scene, NPC objective/epistemic, lore, memory, and exchange candidates. Mechanics and chat retain token caps; loreDepth and memoryDepth become count caps on admitted records. A too-large optional record does not consume a count slot, so a smaller subsequent candidate can fit. All search matches reach admission, removing the former global top-30 starvation behavior. Cross-class optional candidates now compete by salience and relevance rather than incidental call order; current lexical and retrieval signals retain their existing scales.
* State analysis constructs complete mandatory instructions, exchange and relevant NPC/scene state, plus eligible optional prior facts/events with a 16-record pool cap. It preserves full prior records for review. Summaries and document extraction require their complete selected sources. These tasks share planning, not narration layers. Prompt rendering remains task-specific.
* NPC epistemic labels never become objective world-state labels, including when focused or mandatory. Explicit focus is a typed planner seam; no new UI or factual-conflict mechanism is implied.

Compiled narration stores the full plan alongside existing layers/messages. Every decision records candidate metadata, relevance signal, inclusion or omission reason, and the affected budget/pool. The plan also stores the policy and its cap values. State analysis persists `extractionPlan` with its exact sent messages. Optional fields allow old contexts and turns to load without inventing historical decision metadata. Omission ID arrays no longer have the old 500-item schema cap, so large chains round-trip. Omission never means an ability is absent. Existing context export includes the narration plan.

Regression coverage includes permutation invariance, stable ties, focus/authority separation, restriction overflow/survival, NPC isolation, exact and overflowing budgets, per-pool caps, history gaps, large persisted omission lists, retrieval degradation, and Sheet Only without network calls. A structural guard rejects finite-window arithmetic in task modules. A service architecture guard replaces planner entry points with rejection sentinels and verifies narration, analysis, summaries, and document extraction all stop before model invocation. Specialist eligibility and prompt construction are intentionally outside that guard's ownership claim.

## Campaign-state transition authority

Campaign-state evolution is expressed as typed semantic operations. One transition authority validates capabilities and invariants and computes the resulting state. Callers may construct different operations and possess different capabilities, but they do not independently mutate persisted `CampaignState`.

### Pre-change mutation census

The repository search found these paths before implementation:

| Path | Prior responsibility | New ownership |
| --- | --- | --- |
| `state.ts::applyProposal` | Whole-scene/NPC replacements; memory insertion/supersession; model-specific checks | Removed; `planTransition` computes a typed plan |
| `state.ts::auditChange` | Accepted arbitrary next-state snapshots and assigned `campaign.state` | Removed; `commitTransition` accepts and revalidates a plan |
| `GMService.analyze` | Asked for complete objects and model-generated IDs; separately called proposal validation | Requests narrow operations and persists an inspectable transition preview |
| HTTP `/review` | Repeated stale checks, applied proposal, then called audit helper | `reviewProposal` invokes the shared commit/validation path |
| HTTP `/state` | Validated and directly audited a full replacement state | Lowers legacy full-state payloads, or accepts operations, under a fixed player capability |
| HTTP `/summarize` | Cloned state and pushed a summary; separate source validation in GM | Shared `summaryEvents` preflight, `summary.create` planning, common commit |
| Scene/NPC editors, declaration button, advanced JSON editor | Constructed replacement campaign-state payloads | Construct typed player operations using the shared lowering adapter |
| `rollbackLatest` | Restored audit snapshots and invalidated continuity/proposals | Retained as a bounded snapshot-restoration specialist with a storage receipt |
| Campaign creation/import/fork, backup remapping, store deserialization | Constructed new or historical campaign snapshots | Retained specialists, validated before saving; no ordinary forward-edit role |
| `validateState`, proposal prompt, HTTP, GM | Distributed ID/reference/chronology/provenance/authority checks | Transition semantics in `transitions.ts`; review guards in `state.ts`; prompt derived from validated vocabulary |

Tracker selectors/context compilation and retrieval also check relevant alignment, chronology, or supersession for their read tasks. Those specialist read boundaries remain intact; they neither authorize nor commit state changes. Native tracker persistence/import code is outside campaign-state evolution. Settings, providers, and worldbooks are configuration/source records, not `CampaignState`.

### Planning, operations, and capabilities

`planTransition(previous, operations, trustedContext, transitionId)` is pure. It validates the input vocabulary, computes on a private copy, resolves dependencies against earlier operations, validates the complete result, and returns a `TransitionPlan`. Failure exposes no partially changed state. Tracker validation uses a fresh snapshot so selector caches cannot make planning depend on earlier calls with a reused mutable bundle.

A plan contains requested normalized operations, version and transition identity, campaign/chain/branch identity, origin, exchange provenance, tracker fingerprint when relevant, created-handle/ID mappings, affected IDs, before/after snapshots, and validation status. There are no object paths, arbitrary reducers, custom operations, or generic patch callbacks.

| Capability | Operation vocabulary | Boundaries |
| --- | --- | --- |
| Model proposal | `scene.update`, `scene.advance`, `scene.presence`; `npc.create`, `npc.update`, `npc.list`, `npc.events`; `fact.create`, `event.create`, `memory.supersede` | Explicit review; no corrective/delete powers; no arbitrary IDs or provenance; no forged player/canonical/mechanical authority; no historical overwrites; no Jump change/time reversal or companion reassignment |
| Player edit | Above ordinary domain operations plus `scene.correct`, `npc.correct`, `fact.correct`, `event.correct`, `summary.correct`, `record.delete`, `records.order` | Preserves full editor correction/deletion/reordering, including chronology resets and valid companion relinking; final consistency and mechanical isolation still apply |
| Generated summary | `summary.create` only | Inferred summary, complete current source events, unchanged summary chronology; no other mutation powers |

`scene.update` and `npc.update` take finite, schema-whitelisted field fragments. `npc.list` adds/removes exact strings in a named NPC list. NPC beliefs, suspicions, and knowledge stay on the NPC; no operation infers objective facts from those strings. `npc.events` attaches typed event references. Player-only corrections intentionally carry complete affected records because the advanced editor permits arbitrary corrections within those record schemas; lowering touches only changed records and emits deletions/order operations where needed. It does not replace unrelated collections. The old `/state` full-state payload remains supported through that same adapter.

Creation uses local handles matching a short identifier grammar, with references shaped as `{id: existingId}` or `{local: earlierHandle}`. The engine assigns IDs from escaped campaign/transition/kind/handle components, checks collisions across all record classes, and resolves only earlier handles of the correct class. The model never chooses persistent creation IDs. Facts/events receive the actual trusted exchange ID as provenance; supplied creation provenance or IDs fail schema validation. Player-authored correction records retain their explicit IDs/provenance. Preview and commit use the same transition identity, so generated IDs remain identical.

Model instructions enumerate the actual operation schema and use a typed, exhaustive example map keyed by every model operation. Adding a kind requires a matching prompt example at compile time; tests parse those examples against the corresponding schemas. Field/list vocabularies come from the actual schemas. Prompts explain constraints, but enforcement stays in the engine.

`validateState` remains the whole-state consistency check used during loading and at the end of a transition: global record-ID uniqueness, NPC presence references, mechanical-authority exclusion, valid same-type supersession and acyclic chains, summary event references, and tracker scene/companion alignment when a bundle is supplied. Actor-dependent rules—such as model provenance, immutable memories, future-dated new memories, no player-declaration supersession, and capability limits—belong to transition planning. Historical/player-corrected timelines keep their prior broader semantics. Existing historical summaries may reference events subsequently superseded; new generated summaries must select current events.

### Review, commit, and persistence

State analysis stores `turn.transitionPlan` alongside the version-2 proposal. The review UI shows operations, origin, source exchange, generated identities, affected records, and before/after consequences. The UI also exposes transition metadata in audit history.

`applyTransition` checks target identity, origin, source exchange, exact prior state, and relevant tracker fingerprint, then recomputes and compares the entire plan. It never trusts a persisted `validation: valid` marker or supplied `after` state. Model commitment also requires an explicitly reviewed pending turn in continuity, with an unchanged proposal body and generation state/tracker. Stale proposals fail; callers must reject, fork, or regenerate.

`commitTransition` is the sole forward assignment/audit pathway. It writes exactly one audit entry containing origin, human action, turn, operations/plan, and before/after snapshots. The audit identity is the transition identity, preventing replay. HTTP owns requests and revision checks; `LocalStore.transaction` retains its serialized atomic file replacement. A process-local receipt binds the campaign object and exact before/after state to a successful commit or rollback. Saving changed state without that receipt fails—even through a new callback or direct `save` call. Validation happens before persistence, and failed transactions leave the file unchanged. Low-level atomic file replacement is private to the store.

The regression guard exercises unauthorized mutation callbacks and direct saves, then verifies model review, player edits, and summary insertion all fail without writes when shared transition application rejects them. It checks runtime ownership rather than banning assignments containing a particular word. New campaign initialization and deserialization are allowed because they have no existing persisted state to advance. Receipts are an internal programming boundary, not a security sandbox against arbitrary trusted code with filesystem access.

### Retained specialists and compatibility

Rollback intentionally restores an audited historical snapshot instead of running a forward model operation. It checks divergence and snapshot consistency, marks the existing audit rolled back, invalidates turn continuity from the related turn onward, rejects pending proposals, and authorizes only that exact storage write. Repeating rollback does not replay the same audit. Older audit entries without transition metadata still work.

Initial creation, imports/backup ID remapping, and forks initialize a new campaign identity from validated snapshots. They are not alternate editing APIs for an existing campaign. Imported/forked pending proposals require new analysis; historical contexts and accepted/rejected proposals remain inspectable. Backup remapping may translate native tracker references throughout snapshots, but those historical plans cannot authorize a new transition on the restored identity.

Campaign schema version remains 1. The persisted proposal field accepts either legacy `{rationale, changes}` or version-2 `{version:2, rationale, operations}`. Migration retains all legacy proposal bodies and contexts, but changes a legacy pending proposal to rejected with an explicit retry-analysis message. This avoids treating old whole-object echoes as narrow, reviewed plans. New transition metadata on turns/audits is optional for old saves. Reanalysis produces a new version-2 proposal and preview without changing campaign state.

No competing routine forward campaign-state mutation authority remains. Context admission, retrieval, native tracker mechanics, settings/worldbooks, initial snapshot construction, and rollback retain their documented specialist ownership.
