import type { Table } from 'dexie';
import { db, ensureDatabaseOpen } from '../../db/database';
import type { JsonMap } from '../../domain/common';
import type { BodymodProfile } from '../../domain/bodymod/types';
import type { Chain } from '../../domain/chain/types';
import type { Effect } from '../../domain/effects/types';
import type { Companion, Jumper } from '../../domain/jumper/types';
import type { Jump, JumperParticipation } from '../../domain/jump/types';
import type { Note } from '../../domain/notes/types';
import { createDefaultRulesModuleSettings, type RulesDefaults } from '../../domain/rules/customization';
import type { HouseRuleProfile, JumpRulesContext } from '../../domain/rules/types';
import { createId } from '../../utils/id';

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

  await table.put({
    ...record,
    updatedAt,
  });

  await touchChain(record.chainId, updatedAt);
}

export async function deleteChainRecord<T extends { chainId: string }>(
  table: Table<T, string>,
  recordId: string,
  chainId: string,
) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
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
    sourceJumpId: null,
    importSourceMetadata: {},
  };
}

export function createBlankParticipation(chainId: string, branchId: string, jumpId: string, participantId: string): JumperParticipation {
  const now = createTimestamp();

  return {
    id: createId('part'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId,
    // Legacy field name: this now stores either a jumper ID or a companion ID.
    jumperId: participantId,
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

export async function syncJumpParticipantMembership(
  chainId: string,
  jump: Jump,
  participantId: string,
  include: boolean,
) {
  await ensureDatabaseOpen();
  const updatedAt = createTimestamp();
  const participantJumperIds = include
    ? Array.from(new Set([...jump.participantJumperIds, participantId]))
    : jump.participantJumperIds.filter((id) => id !== participantId);

  await db.transaction('rw', [db.chains, db.jumps, db.participations], async () => {
    await db.jumps.put({
      ...jump,
      participantJumperIds,
      updatedAt,
    });

    const existingParticipations = await db.participations.where('[jumpId+jumperId]').equals([jump.id, participantId]).toArray();

    if (include) {
      if (existingParticipations.length === 0) {
        await db.participations.put(createBlankParticipation(chainId, jump.branchId, jump.id, participantId));
      }
    } else if (existingParticipations.length > 0) {
      await db.participations.bulkDelete(existingParticipations.map((participation) => participation.id));
    }

    await db.chains.update(chainId, { updatedAt });
  });

  return participantJumperIds;
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
