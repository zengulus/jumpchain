# Jumpchain Tracker — Repository Skills

This file is a practical map for agents working in this repository.

Read `AGENTS.md` first for non-negotiable architectural and product rules.

## Project shape

This repository contains two related but separable systems:

### Sheet tracker

The original Jumpchain tracker is a React/Vite/TypeScript application.

Important areas:

* `src/domain/` — domain logic and selectors
* `src/schemas/` — authoritative tracker schemas and persistence validation
* `src/db/` — browser persistence
* `src/features/` — tracker UI/features
* `src/components/` — reusable UI
* `src/tests/` — unit/integration tests

The tracker must remain fully usable without AI.

### AI GM subsystem

AI functionality is additive.

Important areas:

* `src/ai/schema.ts` — campaign, provider, context, provenance, NPC, worldbook, event schemas
* `src/ai/context.ts` — mechanical state extraction and GM context compilation
* `src/ai/retrieval.ts` — lexical/dense/hybrid retrieval and chronology/provenance filtering
* `src/ai/state.ts` — proposed campaign-state changes, validation, audit and rollback
* `src/ai/documents.ts` — worldbook/document/JumpDoc ingestion
* `src/ai/backup.ts` — AI campaign backup/restore
* `server/gm.ts` — GM orchestration
* `server/provider.ts` — OpenAI-compatible provider integration
* `server/store.ts` — local AI campaign/config/index persistence
* `server/http.ts` — local service API
* `server/main.ts` — service entry point
* `server/mock.ts` — test/mock provider behaviour
* `scripts/start-local.mjs` — Windows/local startup orchestration
* `scripts/build-service.mjs` — service build

The browser tracker is the system of record for mechanical Jumpchain state.

The AI campaign database stores narrative/campaign state. It does not replace the tracker.

---

# Core conceptual skills

## 1. Distinguish authority from salience

This distinction is fundamental.

### Authority

Authority answers:

> What is true when information conflicts?

Approximate hierarchy:

1. explicit reviewed player/GM rulings
2. active authoritative restrictions and drawbacks
3. authoritative tracker mechanics
4. campaign-established facts
5. canonical source/worldbook material
6. NPC beliefs
7. inference
8. speculation

This is not necessarily represented as one simple numeric ordering. For example, NPC beliefs are authoritative evidence of what an NPC believes but are not evidence that the belief is objectively true.

### Salience

Salience answers:

> What should receive attention/context budget for this turn?

Desired direction:

1. explicit presentation/tone instruction
2. explicitly focused records/entities/themes
3. active drawbacks/restrictions
4. current scene and active entities
5. mechanically relevant Jumper/companion records
6. relevant campaign memories
7. relevant world knowledge
8. background material

Never implement salience by changing epistemic authority.

A focused perk becomes more likely to appear in context. It does not become mechanically stronger.

A tone directive controls presentation. It cannot make impossible events possible.

---

## 2. Mechanical state is authoritative structured data

Never ask the LLM to reconstruct the Jumper sheet from narrative memory.

Use `NativeChainBundle`, branch workspace selectors and the existing tracker records.

`src/ai/context.ts::mechanicalRecords()` is the current bridge between tracker state and AI context.

Important behaviour already exists:

* future purchases are excluded
* temporary purchases expire appropriately
* merged selections are handled
* active drawbacks are required context
* current rules are required context
* inactive/resolved effects are excluded
* active bodymod state is available
* tracker/AI branch or jump disagreement causes an error instead of a guessed fallback

Preserve these properties.

---

## 3. Required restrictions must fail loudly

Active mechanical restrictions are never optional context.

If the model context cannot fit required rules/drawbacks, generation should fail with a useful error instead of silently omitting them.

Do not "solve" context pressure by dropping hard constraints.

Optional perks, lore and old memories may be omitted.

Restrictions may not.

---

## 4. Omission does not mean absence

Large chains can contain thousands of abilities.

Only relevant records should normally be injected.

Therefore:

> An ability omitted from the current prompt must never be interpreted as an ability the Jumper does not possess.

This principle belongs both in compiler behaviour and GM instructions.

---

## 5. NPC epistemics are separate from world truth

NPC state currently contains concepts such as:

* beliefs
* knowledge
* suspicions
* beliefs about the Jumper
* goals
* plans
* opinions
* resources

Never flatten these into objective campaign facts.

Example:

`Kirei believes Erica is powerless`

does not imply:

`Erica is powerless`.

Similarly, canonical character knowledge can become obsolete after campaign events.

Campaign-established changes must be able to override stale canonical assumptions without deleting history.

---

## 6. Campaign state is proposed, reviewed and auditable

Narration does not directly mutate campaign truth.

Current flow:

1. GM generates narration
2. extraction/model pass proposes structured changes
3. Zod validates the proposal
4. semantic state validation runs
5. user reviews/accepts or rejects changes
6. accepted changes are audited
7. rollback remains possible

Do not bypass this flow for convenience.

Permanent mechanical tracker changes require still greater care and should not emerge from ordinary prose generation.

---

# Common development tasks

## Changing tracker mechanics

Start with:

* `src/domain/`
* `src/schemas/`
* related feature code
* existing tracker tests

Do not implement tracker rules in the AI service if they belong in the tracker domain.

The AI should consume tracker rules, not independently reinvent them.

---

## Changing GM context

Start with:

* `src/ai/context.ts`
* `src/ai/schema.ts`
* `src/tests/aiCore.test.ts`

Check:

* required vs optional records
* token budget
* deterministic ordering
* provenance
* authority
* salience
* context inspector compatibility
* exact source text preservation

Avoid putting model-dependent reasoning inside the deterministic compiler unless necessary.

---

## Changing retrieval

Start with:

* `src/ai/retrieval.ts`
* `server/gm.ts`
* `src/tests/aiCore.test.ts`

Retrieval should preserve:

* lexical search for rare names and exact terms
* semantic/vector search when configured
* chronology
* provenance
* metadata filtering
* campaign divergence from canon
* rebuildable/disposable indexes

Embeddings are indexes, not storage.

If an index disappears, source data must remain intact and lexical retrieval should continue working.

---

## Changing provider support

Start with:

* `server/provider.ts`
* `src/ai/schema.ts`
* `server/gm.ts`
* `src/tests/aiService.test.ts`

Primary target is local OpenAI-compatible endpoints.

Do not assume cloud connectivity.

Provider failure must not damage state.

The narrator, extraction, summarization, embeddings and reranking roles may use separate providers.

---

## Changing campaign schemas

Start with:

* `src/ai/schema.ts`

Then inspect:

* persistence in `server/store.ts`
* backup/restore
* HTTP request/response schemas
* fixtures
* migration behaviour
* all `CampaignSchema.parse` call sites

AI campaign schema versioning is deliberately separate from native tracker schema versioning.

Do not casually break old campaign saves.

---

## Changing PDF/worldbook ingestion

Start with:

* `src/ai/documents.ts`
* existing JumpDoc PDF functionality under `src/features/jumpdocs/`

Jump PDFs and ordinary lore/source PDFs are different data types.

Jump PDFs may produce reviewed structured `JumpDoc` data.

Setting/source documents normally produce world knowledge.

Preserve source provenance/page/bounds where available.

Never silently treat hallucinated extraction as source text.

---

# Testing

Normal commands:

```bash
npm test
npm run build
```

Local AI development:

```bash
npm run dev:ai
```

Production-style local AI startup:

```bash
npm run start:ai
```

Direct service development:

```bash
npm run service
```

Node requirement:

```text
>= 22.12.0
```

Before finishing a meaningful change:

1. run targeted tests while developing
2. run `npm test`
3. run `npm run build`
4. fix TypeScript/build failures rather than suppressing them
5. ensure Sheet Only behaviour still works when AI services are absent

For AI core changes, prefer adding focused tests to:

* `src/tests/aiCore.test.ts`

For server/API/provider behaviour, prefer:

* `src/tests/aiService.test.ts`

Reuse `src/tests/aiFixture.ts` when appropriate.

---

# Windows/local-first requirements

Windows is a primary platform.

Do not introduce:

* mandatory WSL
* mandatory Docker
* POSIX-only shell assumptions
* Unix-only path handling
* cloud-only dependencies

Use Node/cross-platform APIs.

The intended hardware includes consumer NVIDIA GPUs, especially approximately 16 GB VRAM.

Avoid architectures requiring multiple GPUs or several permanently resident GPU models.

Narrator inference is expected to be the expensive operation.

Embeddings/reranking should remain replaceable and capable of CPU/local use.

---

# Generated/build output

Do not hand-edit generated bundles.

Change source files and regenerate outputs with the existing build scripts.

Do not commit `.ai-data`, test output or local runtime state.

---

# Preferred engineering style

Prefer:

* small typed interfaces
* Zod validation at trust boundaries
* deterministic state transformations
* explicit provenance
* explicit failure over silent corruption
* pure/testable compiler and retrieval functions
* replaceable provider/storage abstractions
* focused changes with regression tests

Avoid:

* duplicate sources of truth
* implicit state hidden in prompts
* model output being trusted without validation
* giant god objects
* premature distributed inference infrastructure
* coupling Sheet Only functionality to the AI sidecar

When in doubt, preserve the tracker, preserve authority boundaries, and make AI behaviour inspectable.