import type { Table } from 'dexie';
import { db } from '../../db/database';
import type { JsonMap } from '../../domain/common';
import type { BodymodProfile } from '../../domain/bodymod/types';
import type { Chain } from '../../domain/chain/types';
import type { Effect } from '../../domain/effects/types';
import type { Jumper } from '../../domain/jumper/types';
import type { Jump, JumperParticipation } from '../../domain/jump/types';
import type { Note } from '../../domain/notes/types';
import type { JumpRulesContext } from '../../domain/rules/types';
import { createId } from '../../utils/id';

function createTimestamp() {
  return new Date().toISOString();
}

export function createJsonText(value: unknown) {
  const json = JSON.stringify(value ?? null, null, 2);
  return json ?? 'null';
}

export async function touchChain(chainId: string, updatedAt = createTimestamp()) {
  await db.chains.update(chainId, { updatedAt });
}

export async function saveChainEntity(chain: Chain) {
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

export function createBlankParticipation(chainId: string, branchId: string, jumpId: string, jumperId: string): JumperParticipation {
  const now = createTimestamp();

  return {
    id: createId('part'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId,
    jumperId,
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
  jumperId: string,
  include: boolean,
) {
  const updatedAt = createTimestamp();
  const participantJumperIds = include
    ? Array.from(new Set([...jump.participantJumperIds, jumperId]))
    : jump.participantJumperIds.filter((id) => id !== jumperId);

  await db.transaction('rw', [db.chains, db.jumps, db.participations], async () => {
    await db.jumps.put({
      ...jump,
      participantJumperIds,
      updatedAt,
    });

    const existingParticipations = await db.participations.where('[jumpId+jumperId]').equals([jump.id, jumperId]).toArray();

    if (include) {
      if (existingParticipations.length === 0) {
        await db.participations.put(createBlankParticipation(chainId, jump.branchId, jump.id, jumperId));
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
  allowAltForms: boolean,
): JumpRulesContext {
  const now = createTimestamp();

  return {
    id: createId('rules'),
    chainId,
    branchId,
    createdAt: now,
    updatedAt: now,
    jumpId,
    gauntlet: false,
    warehouseAccess: 'manual',
    powerAccess: 'manual',
    itemAccess: 'manual',
    altFormAccess: allowAltForms ? 'full' : 'locked',
    supplementAccess: 'manual',
    notes: '',
    importSourceMetadata: {},
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
