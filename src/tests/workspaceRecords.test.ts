import { db } from '../db/database';
import { createBlankChain, getChainBundle } from '../db/persistence';
import type { AttachmentRef } from '../domain/attachments/types';
import type { Effect } from '../domain/effects/types';
import type { Note } from '../domain/notes/types';
import {
  createBlankCompanion,
  createBlankEffect,
  createBlankJump,
  createBlankJumper,
  createBlankNote,
  deleteCompanionCascade,
  saveChainRecord,
  syncJumpParticipantMembership,
} from '../features/workspace/records';

async function resetDatabase() {
  db.close();
  await db.delete();
}

describe('workspace record helpers', () => {
  it('removes participation rows when a jumper is removed from a jump', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Participant Cleanup');
    const branchId = bundle.chain.activeBranchId;
    const jumper = createBlankJumper(bundle.chain.id, branchId);
    const jump = createBlankJump(bundle.chain.id, branchId, 0);

    await saveChainRecord(db.jumpers, jumper);
    await saveChainRecord(db.jumps, jump);
    await syncJumpParticipantMembership(bundle.chain.id, jump, jumper.id, 'jumper', true);

    const withParticipation = await getChainBundle(bundle.chain.id);

    expect(withParticipation?.jumps[0]?.participantJumperIds).toEqual([jumper.id]);
    expect(withParticipation?.participations).toHaveLength(1);

    const persistedJump = withParticipation?.jumps[0];

    if (!persistedJump) {
      throw new Error('Expected the persisted jump to exist.');
    }

    await syncJumpParticipantMembership(bundle.chain.id, persistedJump, jumper.id, 'jumper', false);

    const withoutParticipation = await getChainBundle(bundle.chain.id);

    expect(withoutParticipation?.jumps[0]?.participantJumperIds).toEqual([]);
    expect(withoutParticipation?.participations).toHaveLength(0);
  });

  it('creates participation rows for companions when they join a jump', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Companion Participation');
    const branchId = bundle.chain.activeBranchId;
    const companion = createBlankCompanion(bundle.chain.id, branchId);
    const jump = createBlankJump(bundle.chain.id, branchId, 0);

    await saveChainRecord(db.companions, companion);
    await saveChainRecord(db.jumps, jump);
    await syncJumpParticipantMembership(bundle.chain.id, jump, companion.id, 'companion', true);

    const persisted = await getChainBundle(bundle.chain.id);

    expect(persisted?.jumps[0]?.participantJumperIds).toEqual([]);
    expect(persisted?.participations).toHaveLength(0);
    expect(persisted?.companionParticipations).toHaveLength(1);
    expect(persisted?.companionParticipations[0]?.companionId).toBe(companion.id);
  });

  it('cascades companion-owned and companion-participation-owned records on delete', async () => {
    await resetDatabase();
    const bundle = await createBlankChain('Companion Cascade');
    const branchId = bundle.chain.activeBranchId;
    const companion = {
      ...createBlankCompanion(bundle.chain.id, branchId),
      name: 'Cascade Target',
    };
    const jump = createBlankJump(bundle.chain.id, branchId, 0);

    await saveChainRecord(db.companions, companion);
    await saveChainRecord(db.jumps, jump);
    await syncJumpParticipantMembership(bundle.chain.id, jump, companion.id, 'companion', true);

    const withParticipation = await getChainBundle(bundle.chain.id);
    const companionParticipation = withParticipation?.companionParticipations[0];

    if (!companionParticipation) {
      throw new Error('Expected a companion participation record.');
    }

    const companionNote: Note = {
      ...createBlankNote(bundle.chain.id, branchId, companion.id),
      ownerEntityType: 'companion',
      ownerEntityId: companion.id,
      scopeType: 'companion',
      noteType: 'companion',
      title: 'Companion note',
    };
    const companionEffect: Effect = {
      ...createBlankEffect(bundle.chain.id, branchId, companion.id),
      ownerEntityType: 'companion',
      ownerEntityId: companion.id,
      scopeType: 'companion',
      title: 'Companion effect',
    };
    const participationNote: Note = {
      ...createBlankNote(bundle.chain.id, branchId, companionParticipation.id),
      ownerEntityType: 'participation',
      ownerEntityId: companionParticipation.id,
      scopeType: 'participation',
      noteType: 'participation',
      title: 'Participation note',
    };
    const companionAttachment: AttachmentRef = {
      id: 'attachment-companion-test',
      chainId: bundle.chain.id,
      branchId,
      createdAt: companion.createdAt,
      updatedAt: companion.updatedAt,
      ownerEntityType: 'companion',
      ownerEntityId: companion.id,
      scopeType: 'companion',
      label: 'Companion attachment',
      kind: 'link',
      url: 'https://example.invalid/companion',
      storage: 'external',
    };

    await saveChainRecord(db.notes, companionNote);
    await saveChainRecord(db.effects, companionEffect);
    await saveChainRecord(db.notes, participationNote);
    await saveChainRecord(db.attachments, companionAttachment);

    await deleteCompanionCascade(bundle.chain.id, companion.id);

    const persisted = await getChainBundle(bundle.chain.id);

    expect(persisted?.companions).toHaveLength(0);
    expect(persisted?.companionParticipations).toHaveLength(0);
    expect(persisted?.notes).toHaveLength(0);
    expect(persisted?.effects).toHaveLength(0);
    expect(persisted?.attachments).toHaveLength(0);
  });
});
