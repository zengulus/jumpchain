import { db } from '../db/database';
import { createBlankChain, getChainBundle } from '../db/persistence';
import {
  createBlankCompanion,
  createBlankJump,
  createBlankJumper,
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
    await syncJumpParticipantMembership(bundle.chain.id, jump, jumper.id, true);

    const withParticipation = await getChainBundle(bundle.chain.id);

    expect(withParticipation?.jumps[0]?.participantJumperIds).toEqual([jumper.id]);
    expect(withParticipation?.participations).toHaveLength(1);

    const persistedJump = withParticipation?.jumps[0];

    if (!persistedJump) {
      throw new Error('Expected the persisted jump to exist.');
    }

    await syncJumpParticipantMembership(bundle.chain.id, persistedJump, jumper.id, false);

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
    await syncJumpParticipantMembership(bundle.chain.id, jump, companion.id, true);

    const persisted = await getChainBundle(bundle.chain.id);

    expect(persisted?.jumps[0]?.participantJumperIds).toEqual([companion.id]);
    expect(persisted?.participations).toHaveLength(1);
    expect(persisted?.participations[0]?.jumperId).toBe(companion.id);
  });
});
