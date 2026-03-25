import type { ChainMakerV2CleanerChange, ChainMakerV2CleanerResult } from './types';

const JUMP_RECORD_FIELDS = [
  'notes',
  'bankDeposits',
  'currencyExchanges',
  'supplementPurchases',
  'supplementInvestments',
  'originCategories',
  'currencies',
  'purchaseSubtypes',
  'subsystemSummaries',
  'purchases',
  'retainedDrawbacks',
  'drawbacks',
  'drawbackOverrides',
  'origins',
  'altForms',
  'narratives',
  'budgets',
  'stipends',
] as const;

const JUMP_ARRAY_FIELDS = ['characters', 'originCategoryList'] as const;
const JUMP_BOOLEAN_FIELDS = ['useSupplements', 'useAltForms', 'useNarratives'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function addChange(
  changes: ChainMakerV2CleanerChange[],
  path: string,
  reason: string,
  before: unknown,
  after: unknown,
) {
  changes.push({
    path,
    reason,
    before,
    after,
  });
}

function deriveSourceIdList(record: Record<string, unknown>) {
  return Object.values(record)
    .map((entry) => (isRecord(entry) ? parseOptionalNumber(entry._id) : null))
    .filter((entry): entry is number => entry !== null)
    .sort((left, right) => left - right);
}

function cleanCharacterRecord(
  character: Record<string, unknown>,
  pathPrefix: string,
  changes: ChainMakerV2CleanerChange[],
) {
  const nextCharacter = { ...character };
  const age = nextCharacter.originalAge;

  if (typeof age !== 'string') {
    return nextCharacter;
  }

  const trimmed = age.trim();

  if (trimmed.length === 0) {
    delete nextCharacter.originalAge;
    addChange(
      changes,
      `${pathPrefix}.originalAge`,
      'Blank original age strings are dropped so the importer can fall back safely.',
      age,
      undefined,
    );
    return nextCharacter;
  }

  const parsed = Number(trimmed);

  if (Number.isFinite(parsed)) {
    nextCharacter.originalAge = parsed;
    addChange(
      changes,
      `${pathPrefix}.originalAge`,
      'Numeric original age strings are coerced to numbers before DTO validation.',
      age,
      parsed,
    );
    return nextCharacter;
  }

  if (trimmed !== age) {
    nextCharacter.originalAge = trimmed;
    addChange(
      changes,
      `${pathPrefix}.originalAge`,
      'Non-numeric original age strings are trimmed and preserved for later review.',
      age,
      trimmed,
    );
  }

  return nextCharacter;
}

function ensureRecordField(
  target: Record<string, unknown>,
  field: string,
  pathPrefix: string,
  changes: ChainMakerV2CleanerChange[],
) {
  if (isRecord(target[field])) {
    return;
  }

  const previous = target[field];
  target[field] = {};
  addChange(
    changes,
    `${pathPrefix}.${field}`,
    'Missing or invalid per-jump container was replaced with an empty record.',
    previous,
    {},
  );
}

function ensureArrayField(
  target: Record<string, unknown>,
  field: string,
  pathPrefix: string,
  changes: ChainMakerV2CleanerChange[],
) {
  if (Array.isArray(target[field])) {
    return;
  }

  const previous = target[field];
  target[field] = [];
  addChange(
    changes,
    `${pathPrefix}.${field}`,
    'Missing or invalid array field was replaced with an empty array.',
    previous,
    [],
  );
}

function ensureBooleanField(
  target: Record<string, unknown>,
  field: string,
  pathPrefix: string,
  changes: ChainMakerV2CleanerChange[],
) {
  if (typeof target[field] === 'boolean') {
    return;
  }

  const previous = target[field];
  target[field] = false;
  addChange(
    changes,
    `${pathPrefix}.${field}`,
    'Missing or invalid boolean toggle was defaulted to false.',
    previous,
    false,
  );
}

function cleanJumpRecord(jump: Record<string, unknown>, pathPrefix: string, changes: ChainMakerV2CleanerChange[]) {
  const nextJump = { ...jump };

  for (const field of JUMP_RECORD_FIELDS) {
    ensureRecordField(nextJump, field, pathPrefix, changes);
  }

  for (const field of JUMP_ARRAY_FIELDS) {
    ensureArrayField(nextJump, field, pathPrefix, changes);
  }

  for (const field of JUMP_BOOLEAN_FIELDS) {
    ensureBooleanField(nextJump, field, pathPrefix, changes);
  }

  return nextJump;
}

function cleanNestedRecord(
  record: Record<string, unknown>,
  pathPrefix: string,
  cleaner: (value: Record<string, unknown>, path: string, changes: ChainMakerV2CleanerChange[]) => Record<string, unknown>,
  changes: ChainMakerV2CleanerChange[],
) {
  const nextRecord = { ...record };

  for (const [key, value] of Object.entries(record)) {
    if (!isRecord(value)) {
      continue;
    }

    nextRecord[key] = cleaner(value, `${pathPrefix}.${key}`, changes);
  }

  return nextRecord;
}

export function cleanChainMakerV2Raw(raw: unknown): ChainMakerV2CleanerResult {
  if (!isRecord(raw)) {
    return {
      cleanedRaw: raw,
      changes: [],
    };
  }

  const changes: ChainMakerV2CleanerChange[] = [];
  const nextRaw: Record<string, unknown> = {
    ...raw,
  };

  if (!Array.isArray(nextRaw.chainDrawbacks)) {
    const previous = nextRaw.chainDrawbacks;
    nextRaw.chainDrawbacks = [];
    addChange(
      changes,
      'chainDrawbacks',
      'Missing or invalid chain drawback list was replaced with an empty array.',
      previous,
      [],
    );
  }

  if (!isRecord(nextRaw.altforms)) {
    const previous = nextRaw.altforms;
    nextRaw.altforms = {};
    addChange(
      changes,
      'altforms',
      'Missing or invalid altform record was replaced with an empty record.',
      previous,
      {},
    );
  }

  if (nextRaw.purchases !== undefined && !isRecord(nextRaw.purchases)) {
    const previous = nextRaw.purchases;
    nextRaw.purchases = {};
    addChange(
      changes,
      'purchases',
      'Invalid top-level purchase catalog was replaced with an empty record.',
      previous,
      {},
    );
  }

  if (!Array.isArray(nextRaw.characterList) && isRecord(nextRaw.characters)) {
    const derivedCharacterList = deriveSourceIdList(nextRaw.characters);
    const previous = nextRaw.characterList;
    nextRaw.characterList = derivedCharacterList;
    addChange(
      changes,
      'characterList',
      'Missing or invalid character list was rebuilt from character records.',
      previous,
      derivedCharacterList,
    );
  }

  if (!Array.isArray(nextRaw.jumpList) && isRecord(nextRaw.jumps)) {
    const derivedJumpList = deriveSourceIdList(nextRaw.jumps);
    const previous = nextRaw.jumpList;
    nextRaw.jumpList = derivedJumpList;
    addChange(
      changes,
      'jumpList',
      'Missing or invalid jump list was rebuilt from jump records.',
      previous,
      derivedJumpList,
    );
  }

  if (isRecord(nextRaw.characters)) {
    nextRaw.characters = cleanNestedRecord(nextRaw.characters, 'characters', cleanCharacterRecord, changes);
  }

  if (isRecord(nextRaw.jumps)) {
    nextRaw.jumps = cleanNestedRecord(nextRaw.jumps, 'jumps', cleanJumpRecord, changes);
  }

  return {
    cleanedRaw: changes.length > 0 ? nextRaw : raw,
    changes,
  };
}
