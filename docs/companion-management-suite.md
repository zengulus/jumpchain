# Companion Management Suite Plan

## Purpose

Build a dedicated companion-management suite that treats companions as first-class continuity records rather than loose metadata hanging off jumpers.

The suite should support:

- imported companions where source data exists
- manually created companions for native-only chains
- parent-jumper relationships without requiring them
- per-jump participation and notes
- companion-scoped effects, bodymod, and rule interactions where relevant
- branch-safe, snapshot-safe behavior

## Product Goals

1. Companions should be easy to add and browse from the main workspace.
2. Companion data should follow the same local-first and migration-safe rules as the rest of the app.
3. Companion continuity should survive import, export, branch creation, snapshot restore, and native re-import.
4. The UI should support a simple roster flow first, with advanced editing available in-place.

## Initial Scope

### Core records

- `Companion`
- companion-owned `Note`
- companion-owned `Effect`
- companion participation in jumps

### Out of first scope

- full companion import adapters from every possible source format
- companion-specific presets
- companion relationship graphs beyond parent jumper and freeform notes

## Domain Model Direction

## Companion record

The existing `Companion` entity is a start, but the suite should standardize these expectations:

- `chainId`
- `branchId`
- `name`
- `parentJumperId?: string | null`
- `role?: string`
- `status?: active | inactive | imported | retired`
- `originJumpId?: string | null`
- `importSourceMetadata`

## Participation model

Companions should not get a separate incompatible jump model.

Recommended direction:

- extend `JumperParticipation` into a broader participant model later, or
- add a parallel `CompanionParticipation` record with a deliberately similar shape in the near term

Near-term recommendation:

- add `CompanionParticipation`
- keep it structurally close to `JumperParticipation`
- avoid forcing a polymorphic participant refactor immediately

That gives us a usable suite faster while preserving a migration path to a unified participant model later.

## Ownership and scope expectations

Companions must be valid owners for:

- effects
- notes
- attachments

Companion records must also survive:

- branch cloning
- snapshot creation
- snapshot restore
- native safe-copy import

## Workspace UX Plan

## New module

Add a dedicated `Companions` module to the workspace rail near `Jumpers`.

Recommended order:

1. Overview
2. Jumpers
3. Companions
4. Jumps
5. Participation

## Companion module layout

### Left column

- roster list
- filters for `all`, `attached`, `independent`, `inactive`
- add companion action

### Main editor

- simple section
  - name
  - parent jumper
  - role/status
- continuity section
  - origin jump
  - current branch notes
- advanced section
  - raw source metadata
  - internal ids and references where useful

## Companion quick actions

From the companion module and jumper module:

- open parent jumper
- open notes
- open effects
- open participation for current jump

## Participation UX

Companions need a visible answer to:

- Are they in this jump?
- What did they take?
- What drawbacks or notes apply to them?

Recommended first version:

- add a companion participation panel to the existing Participation workspace
- jumper participation remains first
- companions appear in a secondary section below jumpers

That is a better first move than building a totally separate participation screen.

## Persistence and Migration Tasks

1. Confirm Dexie indexes for companion lookup by `chainId`, `branchId`, and `parentJumperId`.
2. Add companion participation storage if introduced.
3. Ensure export/import serializers include the new records.
4. Add migration scaffolding even if only schema v1 exists initially.

## Import Strategy

Companion import should follow the same safety rules as the ChainMaker importer:

- detect what maps cleanly
- preserve what does not
- never silently discard unresolved source companion data

If a source format has ambiguous companion semantics:

- import the safe subset into native companion records
- store unresolved source fields in `importSourceMetadata`
- add warnings to the import report

## Test Plan

### Unit tests

- companion schema validation
- companion selector helpers
- parent jumper linking helpers
- branch/snapshot cloning behavior

### Integration tests

- create companion in IndexedDB and reload it
- attach companion to jumper and preserve relationship
- add companion-owned note/effect and reload workspace
- export native save and re-import with same visible companion state
- restore snapshot into a new branch with companion continuity intact

## Delivery Phases

### Phase 1

- companion module screen
- CRUD for companion records
- parent jumper assignment
- native persistence and tests

### Phase 2

- companion participation records
- current-jump companion participation editing
- companion notes/effects shortcuts

### Phase 3

- importer support where source data exists
- unresolved mapping reporting
- better continuity summaries in timeline and overview

## Acceptance Criteria

- user can create, edit, and delete a companion locally
- user can attach or detach a companion from a jumper
- companion data persists across reloads
- companion data survives native export/import
- companion data survives branch creation and snapshot restore
- workspace has a dedicated companion management area with simple and advanced editing
