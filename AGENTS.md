# AGENTS.md

These instructions apply to coding agents working in this repository.

## Product definition

This project is:

> A serious Jumpchain tracker that can optionally become a persistent local AI GM.

It is **not**:

> An AI chat application with a Jumpchain sheet bolted onto it.

The existing tracker remains primary.

---

# Non-negotiable invariants

## Sheet Only must always work

The complete tracker must remain usable when:

* AI is disabled
* the local AI service is not running
* no LLM is installed
* no embeddings model exists
* no vector index exists
* the machine is offline

Do not introduce AI runtime dependencies into ordinary tracker workflows.

Any change that breaks this is unacceptable.

---

## Tracker state is mechanical authority

The native Jumpchain sheet is the source of truth for:

* perks
* items
* drawbacks
* bodymod
* companions
* jump participation
* restrictions
* effects
* jump configuration
* other mechanical state

Do not maintain a second independently editable AI copy of these mechanics.

The AI service may compile, select and interpret tracker records.

It may not silently replace them.

---

## AI narration cannot directly rewrite mechanics

Generated prose is provisional narrative.

Campaign-state changes must use the proposal/review/validation system.

Mechanical sheet changes must not be inferred and applied merely because the narrator wrote them.

---

## Never silently drop active restrictions

Current rules, drawbacks and other hard restrictions have priority over optional context.

If required context does not fit, fail generation clearly.

Do not solve budget problems by hiding constraints from the model.

---

## Do not level-scale the world

The GM should simulate consequences, not manufacture balanced encounters.

Do not:

* invent counters because the Jumper is powerful
* make enemies stronger solely to preserve challenge
* give NPCs unexplained knowledge of Jumper abilities
* weaken powers for dramatic convenience
* interpret every vague perk maximally
* turn every strong perk into omnipotence

Easy situations are allowed to remain easy.

Overwhelming abilities are allowed to be overwhelming.

Actual restrictions remain actual restrictions.

---

# Authority and salience are separate

Do not implement a single vague concept of "priority."

## Authority asks

> If two claims conflict, which one determines reality?

Examples:

* active tracker restriction beats an unrestricted ability use
* campaign-established divergence beats stale default canon
* NPC belief does not beat objective fact
* inference does not beat source material
* tone does not beat mechanics

## Salience asks

> What should the model pay attention to this turn?

Desired general cascade:

1. explicit presentation/tone directive
2. explicit focus
3. active drawbacks/restrictions
4. current scene and present entities
5. relevant sheet mechanics
6. relevant campaign memory
7. relevant world knowledge
8. background material

These levels affect context allocation and attention.

They do not rewrite truth.

Example:

A focused perk should be preferentially injected.

It does not override a drawback that disables it.

A horror tone directive should alter narration.

It does not create an otherwise impossible threat.

---

# Source classes

Treat these distinctly.

## Authoritative tracker state

Hard mechanical state.

Do not vector-store this as the only copy.

## Campaign-established state

Reviewed facts/events/NPC changes produced during play.

This may supersede canonical assumptions inside this campaign.

## Canonical/source knowledge

Worldbooks, setting documents, JumpDocs and other source material.

## NPC epistemic state

What a particular NPC knows, believes, suspects or falsely believes.

Never serialize this as objective reality.

## Inference/speculation

Useful for reasoning but low authority.

Never silently fossilize inference into canon.

---

# Context compiler rules

`src/ai/context.ts` should remain deterministic and heavily tested.

The compiler should:

* validate chain/branch/jump alignment
* reserve budget for hard constraints
* preserve exact mechanical record text
* select optional mechanics by relevance
* expose why information was injected
* obey context budgets
* report omissions
* distinguish authority from salience
* make context inspectable

Do not rely on the narrator model to repair a badly assembled context.

Whenever possible, make the compiler do deterministic bookkeeping and let the LLM do interpretation.

---

# Retrieval rules

Retrieval should use hybrid techniques where useful.

Rare proper nouns, perk names and fandom terminology make lexical matching important.

Semantic similarity is complementary, not a replacement.

Retrieval must respect:

* chronology
* source provenance
* authority
* supersession
* entity/location metadata
* current jump
* campaign divergence

A vector index is disposable.

Never make source data depend on its continued existence.

---

# NPC rules

Maintain distinctions between:

* reality
* NPC knowledge
* NPC belief
* NPC suspicion
* NPC belief about the Jumper
* NPC goals/plans

NPCs may be wrong.

They may lack information.

They may act on false information.

Do not grant them narrator knowledge.

---

# Agent working procedure

Before changing code:

1. inspect the relevant existing implementation
2. inspect nearby tests
3. identify the actual source of truth
4. make the smallest coherent change
5. preserve existing architecture unless there is a concrete reason not to

Do not rewrite broad subsystems merely because a local change is easier in a new architecture.

When a larger redesign really is necessary, preserve the invariants above.

---

# Scope discipline

If you are given a bounded task, stay bounded.

Do not opportunistically:

* redesign unrelated UI
* replace storage systems
* add frameworks
* replace retrieval engines
* rewrite schemas unrelated to the task
* introduce cloud services
* add distributed inference infrastructure

Small agents in particular should prefer narrow improvements plus tests.

---

# Validation

Use Zod or existing validation boundaries for model/service/user-derived data.

Do not trust:

* LLM JSON
* imported documents
* API payloads
* persisted AI campaign files
* arbitrary worldbook imports

Validate before applying.

---

# Error behaviour

Prefer explicit failure to silent state corruption.

Good:

> Required drawback context exceeds the configured model window.

Bad:

> silently omit the drawback and continue generating.

Good:

> embedding provider unavailable; fall back to lexical retrieval.

Bad:

> destroy or invalidate worldbook state because the vector index failed.

---

# Compatibility

Primary environment:

* Windows
* Node >= 22.12
* local browser UI
* local Node sidecar
* OpenAI-compatible local inference servers

Do not require WSL, Docker or internet access.

Use cross-platform path/process APIs.

---

# Tests and completion

For changes touching AI core, add or update tests.

Before declaring a task complete, run:

```bash
npm test
npm run build
```

Do not claim completion with known test/build failures unless the failure is demonstrably pre-existing and unrelated; report that explicitly.

Do not hand-edit generated build output.

---

# Current architectural direction

The next major GM-context work should evolve toward an explicit priority system with at least two dimensions:

* epistemic/mechanical authority
* turn-level salience

Likely presentation layers include:

* explicit tone
* focus directives
* hard restrictions
* authoritative state
* NPC epistemics
* campaign memories
* canonical/world knowledge
* recent conversation

Do not prematurely encode all of these into one integer priority.

Preserve enough structure that conflict resolution and context selection can evolve independently.