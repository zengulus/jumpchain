import type { Table } from 'dexie';
import { db, ensureDatabaseOpen } from '../../db/database';
import type { JsonMap } from '../../domain/common';
import type { BodymodProfile } from '../../domain/bodymod/types';
import type { Chain } from '../../domain/chain/types';
import type { Effect } from '../../domain/effects/types';
import type { Companion, Jumper } from '../../domain/jumper/types';
import type { CompanionParticipation, Jump, JumperParticipation, WorkspaceParticipation } from '../../domain/jump/types';
import { normalizeCurrencyExchange, normalizeParticipationSelections } from '../../domain/jump/selection';
import type { JumpDoc } from '../../domain/jumpdoc/types';
import type { Note } from '../../domain/notes/types';
import { createDefaultRulesModuleSettings, type RulesDefaults } from '../../domain/rules/customization';
import type { HouseRuleProfile, JumpRulesContext } from '../../domain/rules/types';
import { createId } from '../../utils/id';
import { rememberRecordDelete, rememberRecordSave } from './undo';

function createTimestamp() {
  return new Date().toISOString();
}

export function createJsonText(value: unknown) {
  const json = JSON.stringify(value ?? null, null, 2);
  return json ?? 'null';
}

export async function touchChain(chainId: string, updatedAt = createTimestamp()) {
  await ensureDatabaseOpen();
  await db.chains.update(chainId, { updatedAt });
}

export async function saveChainEntity(chain: Chain) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
  await rememberRecordSave(db.chains, chain);
  await db.chains.put({
    ...chain,
    updatedAt,
  });
}

export async function saveChainRecord<T extends { id: string; chainId: string; updatedAt: string }>(
  table: Table<T, string>,
  record: T,
) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
  await rememberRecordSave(table, record);

  await table.put({
    ...record,
    updatedAt,
  });

  await touchChain(record.chainId, updatedAt);
}

export async function deleteChainRecord<T extends { id: string; chainId: string }>(
  table: Table<T, string>,
  recordId: string,
  chainId: string,
) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
  await rememberRecordDelete(table, recordId, chainId);
  await table.delete(recordId);
  await touchChain(chainId, updatedAt);
}

export function createBlankJumper(chainId: string, branchId: string): Jumper {
  const now = createTimestamp();

  return {
    id: createId('jumper'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    name: 'New Jumper',
    isPrimary: false,
    gender: '',
    originalAge: null,
    notes: '',
    originalFormSourceId: null,
    personality: {
      personality: '',
      motivation: '',
      likes: '',
      dislikes: '',
      quirks: '',
    },
    background: {
      summary: '',
      description: '',
    },
    importSourceMetadata: {},
  };
}

export function createBlankCompanion(chainId: string, branchId: string): Companion {
  const now = createTimestamp();

  return {
    id: createId('companion'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    name: 'New Companion',
    parentJumperId: null,
    role: '',
    status: 'active',
    originJumpId: null,
    importSourceMetadata: {},
  };
}

export function createBlankJump(chainId: string, branchId: string, orderIndex: number): Jump {
  const now = createTimestamp();

  return {
    id: createId('jump'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    title: `Jump ${orderIndex + 1}`,
    orderIndex,
    status: 'planned',
    jumpType: 'standard',
    duration: {
      years: 10,
      months: 0,
      days: 0,
    },
    participantJumperIds: [],
    jumpDocIds: [],
    sourceJumpId: null,
    importSourceMetadata: {},
  };
}

export function createBlankJumpDoc(chainId: string, branchId: string): JumpDoc {
  const now = createTimestamp();

  return {
    id: createId('jumpdoc'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    title: 'New JumpDoc',
    author: '',
    source: '',
    pdfAttachmentId: null,
    pdfUrl: null,
    notes: '',
    pdfAnnotationBounds: [],
    currencies: {
      '0': {
        name: 'Choice Points',
        abbrev: 'CP',
        budget: 1000,
        essential: true,
      },
    },
    originCategories: {
      origin: {
        name: 'Origin',
        singleLine: true,
        defaultValue: 'Drop-In',
      },
    },
    purchaseSubtypes: {
      '0': {
        name: 'Perk',
        type: 0,
        currencyKey: '0',
        stipend: null,
        essential: true,
      },
      '1': {
        name: 'Item',
        type: 1,
        currencyKey: '0',
        stipend: null,
        essential: true,
      },
    },
    origins: [],
    purchases: [],
    drawbacks: [],
    scenarios: [],
    companions: [],
    importSourceMetadata: {},
  };
}

function createBlankParticipationFields(
  chainId: string,
  branchId: string,
  jumpId: string,
): Omit<JumperParticipation, 'id' | 'jumperId'> {
  const now = createTimestamp();

  return {
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId,
    status: 'planned',
    notes: '',
    purchases: [],
    drawbacks: [],
    retainedDrawbacks: [],
    origins: {},
    budgets: {},
    stipends: {},
    narratives: {
      accomplishments: '',
      challenges: '',
      goals: '',
    },
    altForms: [],
    bankDeposit: 0,
    currencyExchanges: [],
    supplementPurchases: {},
    supplementInvestments: {},
    drawbackOverrides: {},
    importSourceMetadata: {},
  };
}

export function createBlankJumperParticipation(
  chainId: string,
  branchId: string,
  jumpId: string,
  jumperId: string,
): JumperParticipation {
  return {
    id: createId('part'),
    ...createBlankParticipationFields(chainId, branchId, jumpId),
    jumperId,
  };
}

export function createBlankCompanionParticipation(
  chainId: string,
  branchId: string,
  jumpId: string,
  companionId: string,
): CompanionParticipation {
  return {
    id: createId('part'),
    ...createBlankParticipationFields(chainId, branchId, jumpId),
    companionId,
  };
}

export function createBlankParticipation(
  chainId: string,
  branchId: string,
  jumpId: string,
  participant: Pick<WorkspaceParticipation, 'participantId' | 'participantKind'>,
): JumperParticipation | CompanionParticipation {
  return participant.participantKind === 'companion'
    ? createBlankCompanionParticipation(chainId, branchId, jumpId, participant.participantId)
    : createBlankJumperParticipation(chainId, branchId, jumpId, participant.participantId);
}

export async function saveParticipationRecord(
  participation: JumperParticipation | CompanionParticipation | WorkspaceParticipation,
) {
  const normalizedParticipation = {
    ...participation,
    purchases: normalizeParticipationSelections(participation.purchases, 'purchase'),
    drawbacks: normalizeParticipationSelections(participation.drawbacks, 'drawback'),
    retainedDrawbacks: normalizeParticipationSelections(participation.retainedDrawbacks, 'retained-drawback'),
    currencyExchanges: participation.currencyExchanges.map((exchange) => normalizeCurrencyExchange(exchange)),
  };

  if ('participantKind' in normalizedParticipation) {
    if (normalizedParticipation.participantKind === 'companion') {
      const { participantId, participantKind, ...rest } = normalizedParticipation;
      await saveChainRecord(db.companionParticipations, {
        ...rest,
        companionId: participantId,
      });
      return;
    }

    const { participantId, participantKind, ...rest } = normalizedParticipation;
    await saveChainRecord(db.participations, {
      ...rest,
      jumperId: participantId,
    });
    return;
  }

  if ('companionId' in normalizedParticipation) {
    await saveChainRecord(db.companionParticipations, normalizedParticipation);
    return;
  }

  await saveChainRecord(db.participations, normalizedParticipation);
}

export async function syncJumpParticipantMembership(
  chainId: string,
  jump: Jump,
  participantId: string,
  participantKind: WorkspaceParticipation['participantKind'],
  include: boolean,
) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
  const participantJumperIds =
    participantKind === 'jumper'
      ? include
        ? Array.from(new Set([...jump.participantJumperIds, participantId]))
        : jump.participantJumperIds.filter((id) => id !== participantId)
      : jump.participantJumperIds;

  await db.transaction(
    'rw',
    [db.chains, db.jumps, db.participations, db.companionParticipations],
    async () => {
      await db.jumps.put({
        ...jump,
        participantJumperIds,
        updatedAt,
      });

      if (participantKind === 'companion') {
        const existingParticipations = await db.companionParticipations
          .where('[jumpId+companionId]')
          .equals([jump.id, participantId])
          .toArray();

        if (include) {
          if (existingParticipations.length === 0) {
            await db.companionParticipations.put(
              createBlankCompanionParticipation(chainId, jump.branchId, jump.id, participantId),
            );
          }
        } else if (existingParticipations.length > 0) {
          await db.companionParticipations.bulkDelete(existingParticipations.map((participation) => participation.id));
        }
      } else {
        const existingParticipations = await db.participations
          .where('[jumpId+jumperId]')
          .equals([jump.id, participantId])
          .toArray();

        if (include) {
          if (existingParticipations.length === 0) {
            await db.participations.put(createBlankJumperParticipation(chainId, jump.branchId, jump.id, participantId));
          }
        } else if (existingParticipations.length > 0) {
          await db.participations.bulkDelete(existingParticipations.map((participation) => participation.id));
        }
      }

      await db.chains.update(chainId, { updatedAt });
    },
  );

  return participantJumperIds;
}

export async function deleteCompanionCascade(chainId: string, companionId: string) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();

  await db.transaction(
    'rw',
    [
      db.chains,
      db.companions,
      db.jumps,
      db.participations,
      db.companionParticipations,
      db.notes,
      db.effects,
      db.attachments,
    ],
    async () => {
      const companionParticipationIds = await db.companionParticipations
        .where('companionId')
        .equals(companionId)
        .primaryKeys();
      const legacyParticipationIds = await db.participations.where('jumperId').equals(companionId).primaryKeys();
      const allParticipationIds = [...companionParticipationIds, ...legacyParticipationIds].map((id) => String(id));
      const impactedJumps = await db.jumps.toArray();

      await db.companions.delete(companionId);
      await db.companionParticipations.where('companionId').equals(companionId).delete();
      await db.participations.where('jumperId').equals(companionId).delete();

      const jumpsToUpdate = impactedJumps
        .filter((jump) => jump.participantJumperIds.includes(companionId))
        .map((jump) => ({
          ...jump,
          participantJumperIds: jump.participantJumperIds.filter((participantId) => participantId !== companionId),
          updatedAt,
        }));

      if (jumpsToUpdate.length > 0) {
        await db.jumps.bulkPut(jumpsToUpdate);
      }

      await deleteOwnedRecordsForEntity('companion', companionId);

      for (const participationId of allParticipationIds) {
        await deleteOwnedRecordsForEntity('participation', participationId);
      }

      await db.chains.update(chainId, { updatedAt });
    },
  );
}

export async function deleteJumpCascade(chainId: string, jumpId: string) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();

  await db.transaction(
    'rw',
    [
      db.chains,
      db.jumps,
      db.participations,
      db.companionParticipations,
      db.jumpRulesContexts,
      db.notes,
      db.effects,
      db.attachments,
    ],
    async () => {
      const targetJump = await db.jumps.get(jumpId);
      const jumperParticipationIds = await db.participations.where('jumpId').equals(jumpId).primaryKeys();
      const companionParticipationIds = await db.companionParticipations.where('jumpId').equals(jumpId).primaryKeys();
      const allParticipationIds = [...jumperParticipationIds, ...companionParticipationIds].map((id) => String(id));

      await db.jumps.delete(jumpId);
      await db.participations.where('jumpId').equals(jumpId).delete();
      await db.companionParticipations.where('jumpId').equals(jumpId).delete();
      await db.jumpRulesContexts.where('jumpId').equals(jumpId).delete();

      await deleteOwnedRecordsForEntity('jump', jumpId);

      for (const participationId of allParticipationIds) {
        await deleteOwnedRecordsForEntity('participation', participationId);
      }

      const chain = await db.chains.get(chainId);
      let activeJumpId = chain?.activeJumpId ?? null;

      if (activeJumpId === jumpId) {
        const branchJumps = targetJump
          ? await db.jumps.where('branchId').equals(targetJump.branchId).toArray()
          : await db.jumps.where('chainId').equals(chainId).toArray();
        const orderedJumps = branchJumps.slice().sort((left, right) => left.orderIndex - right.orderIndex);
        const nextJump =
          targetJump
            ? orderedJumps.find((jump) => jump.orderIndex > targetJump.orderIndex) ?? orderedJumps[orderedJumps.length - 1] ?? null
            : orderedJumps[orderedJumps.length - 1] ?? null;

        activeJumpId = nextJump?.id ?? null;
      }

      await db.chains.update(chainId, {
        activeJumpId,
        updatedAt,
      });
    },
  );
}

async function deleteOwnedRecordsForEntity(ownerEntityType: Note['ownerEntityType'], ownerEntityId: string) {
  const notes = await db.notes
    .filter((note) => note.ownerEntityType === ownerEntityType && note.ownerEntityId === ownerEntityId)
    .primaryKeys();
  const effects = await db.effects
    .filter((effect) => effect.ownerEntityType === ownerEntityType && effect.ownerEntityId === ownerEntityId)
    .primaryKeys();
  const attachments = await db.attachments
    .filter((attachment) => attachment.ownerEntityType === ownerEntityType && attachment.ownerEntityId === ownerEntityId)
    .primaryKeys();

  if (notes.length > 0) {
    await db.notes.bulkDelete(notes.map((id) => String(id)));
  }

  if (effects.length > 0) {
    await db.effects.bulkDelete(effects.map((id) => String(id)));
  }

  if (attachments.length > 0) {
    await db.attachments.bulkDelete(attachments.map((id) => String(id)));
  }
}

export function createBlankEffect(chainId: string, branchId: string, ownerEntityId: string): Effect {
  const now = createTimestamp();

  return {
    id: createId('effect'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    scopeType: 'chain',
    ownerEntityType: 'chain',
    ownerEntityId,
    title: 'New Effect',
    description: '',
    category: 'other',
    state: 'active',
    sourceEffectId: null,
    importSourceMetadata: {},
  };
}

export function createBlankJumpRulesContext(
  chainId: string,
  branchId: string,
  jumpId: string,
  defaults: RulesDefaults,
): JumpRulesContext {
  const now = createTimestamp();

  return {
    id: createId('rules'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId,
    gauntlet: defaults.gauntlet,
    warehouseAccess: defaults.warehouseAccess,
    powerAccess: defaults.powerAccess,
    itemAccess: defaults.itemAccess,
    altFormAccess: defaults.altFormAccess,
    supplementAccess: defaults.supplementAccess,
    notes: '',
    importSourceMetadata: {},
  };
}

export function createBlankHouseRuleProfile(
  chainId: string,
  branchId: string,
  allowAltForms: boolean,
): HouseRuleProfile {
  const now = createTimestamp();

  return {
    id: createId('house'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    title: 'Current Jump Rules Profile',
    description: 'Branch-level defaults and module customization for the rules workspace.',
    settings: createDefaultRulesModuleSettings(allowAltForms) as unknown as JsonMap,
  };
}

export function createBlankBodymodProfile(chainId: string, branchId: string, jumperId: string): BodymodProfile {
  const now = createTimestamp();

  return {
    id: createId('bodymod'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumperId,
    mode: 'baseline',
    summary: '',
    benchmarkNotes: '',
    interpretationNotes: '',
    iconicSelections: [],
    forms: [],
    features: [],
    importSourceMetadata: {},
  };
}

export function createBlankNote(chainId: string, branchId: string, ownerEntityId: string): Note {
  const now = createTimestamp();

  return {
    id: createId('note'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    scopeType: 'chain',
    ownerEntityType: 'chain',
    ownerEntityId,
    noteType: 'chain',
    title: 'New Note',
    content: '',
    tags: [],
  };
}

export function cloneJsonMap(value: unknown): JsonMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as JsonMap;
}
