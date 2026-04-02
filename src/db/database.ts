import Dexie, { type Table } from 'dexie';
import type { AttachmentRef } from '../domain/attachments/types';
import type { BodymodProfile } from '../domain/bodymod/types';
import type { Branch } from '../domain/branch/types';
import type { Chain } from '../domain/chain/types';
import type { Effect } from '../domain/effects/types';
import type { ImportReport } from '../domain/import/types';
import type { Companion, Jumper } from '../domain/jumper/types';
import type { CompanionParticipation, Jump, JumperParticipation } from '../domain/jump/types';
import type { Note } from '../domain/notes/types';
import type { PresetProfile } from '../domain/presets/types';
import type { HouseRuleProfile, JumpRulesContext } from '../domain/rules/types';
import type { Snapshot } from '../domain/snapshot/types';

export class JumpchainDatabase extends Dexie {
  chains!: Table<Chain, string>;
  branches!: Table<Branch, string>;
  jumpers!: Table<Jumper, string>;
  companions!: Table<Companion, string>;
  jumps!: Table<Jump, string>;
  participations!: Table<JumperParticipation, string>;
  companionParticipations!: Table<CompanionParticipation, string>;
  effects!: Table<Effect, string>;
  bodymodProfiles!: Table<BodymodProfile, string>;
  jumpRulesContexts!: Table<JumpRulesContext, string>;
  houseRuleProfiles!: Table<HouseRuleProfile, string>;
  presetProfiles!: Table<PresetProfile, string>;
  snapshots!: Table<Snapshot, string>;
  notes!: Table<Note, string>;
  attachments!: Table<AttachmentRef, string>;
  importReports!: Table<ImportReport, string>;

  constructor() {
    super('jumpchain-tracker');

    this.version(1).stores({
      chains: '&id, title, activeBranchId, updatedAt',
      branches: '&id, chainId, isActive, updatedAt',
      jumpers: '&id, chainId, branchId, isPrimary, updatedAt',
      companions: '&id, chainId, branchId, updatedAt',
      jumps: '&id, chainId, branchId, orderIndex, status, updatedAt',
      participations: '&id, chainId, branchId, jumpId, jumperId, [jumpId+jumperId], updatedAt',
      effects: '&id, chainId, branchId, scopeType, ownerEntityId, category, state, updatedAt',
      bodymodProfiles: '&id, chainId, branchId, jumperId, updatedAt',
      jumpRulesContexts: '&id, chainId, branchId, jumpId, updatedAt',
      houseRuleProfiles: '&id, chainId, branchId, updatedAt',
      presetProfiles: '&id, chainId, branchId, category, updatedAt',
      snapshots: '&id, chainId, branchId, createdAt',
      notes: '&id, chainId, branchId, ownerEntityId, noteType, updatedAt',
      attachments: '&id, chainId, branchId, ownerEntityId, updatedAt',
      importReports: '&id, chainId, sourceType, createdAt',
    });

    this.version(2).stores({
      chains: '&id, title, activeBranchId, updatedAt',
      branches: '&id, chainId, isActive, updatedAt',
      jumpers: '&id, chainId, branchId, isPrimary, updatedAt',
      companions: '&id, chainId, branchId, parentJumperId, updatedAt',
      jumps: '&id, chainId, branchId, orderIndex, status, updatedAt',
      participations: '&id, chainId, branchId, jumpId, jumperId, [jumpId+jumperId], updatedAt',
      effects: '&id, chainId, branchId, scopeType, ownerEntityId, category, state, updatedAt',
      bodymodProfiles: '&id, chainId, branchId, jumperId, updatedAt',
      jumpRulesContexts: '&id, chainId, branchId, jumpId, updatedAt',
      houseRuleProfiles: '&id, chainId, branchId, updatedAt',
      presetProfiles: '&id, chainId, branchId, category, updatedAt',
      snapshots: '&id, chainId, branchId, createdAt',
      notes: '&id, chainId, branchId, ownerEntityId, noteType, updatedAt',
      attachments: '&id, chainId, branchId, ownerEntityId, updatedAt',
      importReports: '&id, chainId, sourceType, createdAt',
    });

    this.version(3)
      .stores({
        chains: '&id, title, activeBranchId, updatedAt',
        branches: '&id, chainId, isActive, updatedAt',
        jumpers: '&id, chainId, branchId, isPrimary, updatedAt',
        companions: '&id, chainId, branchId, parentJumperId, updatedAt',
        jumps: '&id, chainId, branchId, orderIndex, status, updatedAt',
        participations: '&id, chainId, branchId, jumpId, jumperId, [jumpId+jumperId], updatedAt',
        companionParticipations: '&id, chainId, branchId, jumpId, companionId, [jumpId+companionId], updatedAt',
        effects: '&id, chainId, branchId, scopeType, ownerEntityId, category, state, updatedAt',
        bodymodProfiles: '&id, chainId, branchId, jumperId, updatedAt',
        jumpRulesContexts: '&id, chainId, branchId, jumpId, updatedAt',
        houseRuleProfiles: '&id, chainId, branchId, updatedAt',
        presetProfiles: '&id, chainId, branchId, category, updatedAt',
        snapshots: '&id, chainId, branchId, createdAt',
        notes: '&id, chainId, branchId, ownerEntityId, noteType, updatedAt',
        attachments: '&id, chainId, branchId, ownerEntityId, updatedAt',
        importReports: '&id, chainId, sourceType, createdAt',
      })
      .upgrade(async (tx) => {
        const companions = await tx.table('companions').toArray() as Companion[];
        const companionIds = new Set(companions.map((companion) => companion.id));

        if (companionIds.size === 0) {
          return;
        }

        const participationsTable = tx.table('participations');
        const companionParticipationsTable = tx.table('companionParticipations');
        const jumpsTable = tx.table('jumps');
        const existingParticipations = await participationsTable.toArray() as JumperParticipation[];
        const migratedCompanionParticipations: CompanionParticipation[] = [];
        const legacyParticipationIds: string[] = [];

        for (const participation of existingParticipations) {
          if (!companionIds.has(participation.jumperId)) {
            continue;
          }

          legacyParticipationIds.push(participation.id);
          const { jumperId, ...rest } = participation;
          migratedCompanionParticipations.push({
            ...rest,
            companionId: jumperId,
          });
        }

        if (migratedCompanionParticipations.length > 0) {
          await companionParticipationsTable.bulkPut(migratedCompanionParticipations);
          await participationsTable.bulkDelete(legacyParticipationIds);
        }

        const jumps = await jumpsTable.toArray() as Jump[];
        const legacyJumps = jumps
          .filter((jump) => jump.participantJumperIds.some((participantId) => companionIds.has(participantId)))
          .map((jump) => ({
            ...jump,
            participantJumperIds: jump.participantJumperIds.filter((participantId) => !companionIds.has(participantId)),
          }));

        if (legacyJumps.length > 0) {
          await jumpsTable.bulkPut(legacyJumps);
        }
      });
  }
}

export const db = new JumpchainDatabase();

export async function ensureDatabaseOpen() {
  if (db.isOpen()) {
    return;
  }

  await db.open();
}
