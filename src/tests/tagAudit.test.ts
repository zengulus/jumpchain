import { describe, expect, it } from 'vitest';
import type { BranchWorkspace } from '../domain/chain/selectors';
import {
  applyTagsToNoteAuditEntry,
  applyTagsToSelectionAuditEntry,
  buildTagAuditEntries,
  filterUntaggedEntries,
} from '../features/advanced-tools/tagAudit';

const now = '2026-04-07T00:00:00.000Z';

function createWorkspace() {
  return {
    chain: {
      id: 'chain-1',
      title: 'Alpha Chain',
    },
    jumpers: [
      {
        id: 'jumper-1',
        name: 'Erica',
      },
    ],
    companions: [],
    jumps: [
      {
        id: 'jump-1',
        title: 'Harry Potter',
      },
    ],
    participations: [
      {
        id: 'part-1',
        participantId: 'jumper-1',
        jumpId: 'jump-1',
        purchases: [
          {
            name: 'Archive Charm',
            tags: ['Archive'],
            purchaseType: 0,
            subtype: 0,
            selectionKind: 'purchase',
          },
          {
            name: 'Untitled Cloak',
            tags: [],
            purchaseType: 1,
            subtype: 1,
            selectionKind: 'purchase',
          },
        ],
        drawbacks: [
          {
            name: 'Detention',
            tags: ['School'],
            selectionKind: 'drawback',
          },
        ],
        retainedDrawbacks: [],
        importSourceMetadata: {
          purchaseSubtypes: {
            '0': { name: 'Perk', type: 0 },
            '1': { name: 'Item', type: 1 },
          },
        },
      },
    ],
    notes: [
      {
        id: 'note-1',
        chainId: 'chain-1',
        branchId: 'branch-1',
        createdAt: now,
        updatedAt: now,
        scopeType: 'chain',
        ownerEntityType: 'chain',
        ownerEntityId: 'chain-1',
        noteType: 'chain',
        title: 'Loose Ends',
        content: '',
        tags: [],
      },
    ],
  } as unknown as BranchWorkspace;
}

describe('tag audit', () => {
  it('builds note and selection audit entries with direct routes', () => {
    const entries = buildTagAuditEntries({
      chainId: 'chain-1',
      workspace: createWorkspace(),
    });

    expect(entries.some((entry) => entry.kind === 'selection' && entry.to.includes('participationTab=items'))).toBe(true);
    expect(entries.some((entry) => entry.kind === 'selection' && entry.to.includes('participationTab=drawbacks'))).toBe(true);
    expect(entries.some((entry) => entry.kind === 'note' && entry.to.includes('/notes?note=note-1'))).toBe(true);
  });

  it('finds only fully untagged records when no target tags are given', () => {
    const entries = buildTagAuditEntries({
      chainId: 'chain-1',
      workspace: createWorkspace(),
    });

    const untagged = filterUntaggedEntries(entries, []);

    expect(untagged.map((entry) => entry.title)).toEqual(['Loose Ends', 'Untitled Cloak']);
  });

  it('finds records missing all requested tags', () => {
    const entries = buildTagAuditEntries({
      chainId: 'chain-1',
      workspace: createWorkspace(),
    });

    const missingArchiveOrSchool = filterUntaggedEntries(entries, ['Archive', 'School']);

    expect(missingArchiveOrSchool.map((entry) => entry.title)).toEqual(['Loose Ends', 'Untitled Cloak']);
  });

  it('applies note tags as normalized lists', () => {
    const workspace = createWorkspace();
    const note = workspace.notes[0];
    const updated = applyTagsToNoteAuditEntry(note, ['Archive', ' archive ', 'Research']);

    expect(updated.tags).toEqual(['Archive', 'Research']);
  });

  it('applies selection tags back onto the stored participation array', () => {
    const workspace = createWorkspace();
    const selectionEntry = buildTagAuditEntries({
      chainId: 'chain-1',
      workspace,
    }).find((entry) => entry.kind === 'selection' && entry.title === 'Untitled Cloak');

    if (!selectionEntry || selectionEntry.kind !== 'selection') {
      throw new Error('Expected a selection audit entry for Untitled Cloak.');
    }

    const updated = applyTagsToSelectionAuditEntry(workspace.participations[0], selectionEntry, ['Stealth', 'Travel']);

    expect((updated.purchases[1] as { tags: string[] }).tags).toEqual(['Stealth', 'Travel']);
  });
});
