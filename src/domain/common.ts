export type Identifier = string;
export type Timestamp = string;
export type JsonMap = Record<string, unknown>;

export const ownerEntityTypes = [
  'chain',
  'jumper',
  'companion',
  'jump',
  'participation',
  'branch',
  'snapshot',
  'preset',
  'note',
  'attachment',
  'system',
] as const;

export type OwnerEntityType = (typeof ownerEntityTypes)[number];

export const scopeTypes = ['global', 'chain', 'jumper', 'jump', 'participation', 'branch', 'snapshot'] as const;
export type ScopeType = (typeof scopeTypes)[number];

export const effectCategories = [
  'drawback',
  'perk',
  'item',
  'power',
  'status',
  'rule',
  'alt-form',
  'bodymod',
  'supplement',
  'other',
] as const;
export type EffectCategory = (typeof effectCategories)[number];

export const effectStates = ['active', 'inactive', 'suppressed', 'resolved'] as const;
export type EffectState = (typeof effectStates)[number];

export const jumpStatuses = ['planned', 'current', 'completed', 'hiatus'] as const;
export type JumpStatus = (typeof jumpStatuses)[number];

export const jumpTypes = ['standard', 'gauntlet', 'supplement', 'scenario', 'generic'] as const;
export type JumpType = (typeof jumpTypes)[number];

export const participationStatuses = ['planned', 'active', 'completed', 'inactive'] as const;
export type ParticipationStatus = (typeof participationStatuses)[number];

export const companionStatuses = ['active', 'inactive', 'imported', 'retired'] as const;
export type CompanionStatus = (typeof companionStatuses)[number];

export const noteTypes = ['chain', 'jump', 'jumper', 'participation', 'snapshot', 'import'] as const;
export type NoteType = (typeof noteTypes)[number];

export const accessModes = ['manual', 'limited', 'full', 'locked'] as const;
export type AccessMode = (typeof accessModes)[number];

export const bodymodModes = ['none', 'baseline', 'supplemented', 'custom'] as const;
export type BodymodMode = (typeof bodymodModes)[number];

export const sourceTypes = ['chainmaker-v2', 'native', 'unknown'] as const;
export type SourceType = (typeof sourceTypes)[number];

export const importModes = ['new-chain', 'new-branch', 'new-jumpers'] as const;
export type ImportMode = (typeof importModes)[number];

export const importStatuses = ['draft', 'imported', 'failed'] as const;
export type ImportStatus = (typeof importStatuses)[number];

export const warningSeverities = ['info', 'warning', 'error'] as const;
export type WarningSeverity = (typeof warningSeverities)[number];

export interface BaseRecord {
  id: Identifier;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ChainScopedRecord extends BaseRecord {
  chainId: Identifier;
  branchId: Identifier;
}

export interface ScopedOwnership {
  scopeType: ScopeType;
  ownerEntityType: OwnerEntityType;
  ownerEntityId: Identifier;
}

export interface SourceMetadata {
  sourceType: SourceType;
  sourceVersion: string;
  importedAt: Timestamp;
  rawFragment?: unknown;
  preservedFields?: JsonMap;
}

export interface ImportWarning {
  code: string;
  message: string;
  path?: string;
  severity: WarningSeverity;
}

export interface UnresolvedMapping {
  path: string;
  reason: string;
  severity: WarningSeverity;
  rawFragment?: unknown;
  preservedAt?: string;
}

export interface ImportSummary {
  chainName: string;
  jumperCount: number;
  jumpCount: number;
  chainDrawbackCount: number;
  altformCount: number;
  participationCount: number;
}
