import { z } from 'zod';
import {
  accessModes,
  bodymodModes,
  companionStatuses,
  effectCategories,
  effectStates,
  importModes,
  importStatuses,
  jumpStatuses,
  jumpTypes,
  noteTypes,
  ownerEntityTypes,
  participationStatuses,
  scopeTypes,
  sourceTypes,
  warningSeverities,
} from '../domain/common';

export const IdentifierSchema = z.string().min(1);
export const TimestampSchema = z.string().datetime();
export const JsonMapSchema = z.record(z.string(), z.unknown());

export const OwnerEntityTypeSchema = z.enum(ownerEntityTypes);
export const ScopeTypeSchema = z.enum(scopeTypes);
export const EffectCategorySchema = z.enum(effectCategories);
export const EffectStateSchema = z.enum(effectStates);
export const JumpStatusSchema = z.enum(jumpStatuses);
export const JumpTypeSchema = z.enum(jumpTypes);
export const ParticipationStatusSchema = z.enum(participationStatuses);
export const CompanionStatusSchema = z.enum(companionStatuses);
export const NoteTypeSchema = z.enum(noteTypes);
export const AccessModeSchema = z.enum(accessModes);
export const BodymodModeSchema = z.enum(bodymodModes);
export const SourceTypeSchema = z.enum(sourceTypes);
export const ImportModeSchema = z.enum(importModes);
export const ImportStatusSchema = z.enum(importStatuses);
export const WarningSeveritySchema = z.enum(warningSeverities);

export const BaseRecordSchema = z.object({
  id: IdentifierSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const ChainScopedRecordSchema = BaseRecordSchema.extend({
  chainId: IdentifierSchema,
  branchId: IdentifierSchema,
});

export const ScopedOwnershipSchema = z.object({
  scopeType: ScopeTypeSchema,
  ownerEntityType: OwnerEntityTypeSchema,
  ownerEntityId: IdentifierSchema,
});
