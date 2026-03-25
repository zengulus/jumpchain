import { z } from 'zod';
import {
  AccessModeSchema,
  BaseRecordSchema,
  BodymodModeSchema,
  ChainScopedRecordSchema,
  EffectCategorySchema,
  EffectStateSchema,
  IdentifierSchema,
  JsonMapSchema,
  JumpStatusSchema,
  JumpTypeSchema,
  NoteTypeSchema,
  ParticipationStatusSchema,
  ScopeTypeSchema,
  ScopedOwnershipSchema,
} from './common';

export const ChainSettingsSchema = z.object({
  chainDrawbacksForCompanions: z.boolean(),
  chainDrawbacksSupplements: z.boolean(),
  narratives: z.enum(['enabled', 'disabled']),
  altForms: z.boolean(),
});

export const BankSettingsSchema = z.object({
  enabled: z.boolean(),
  maxDeposit: z.number(),
  depositRatio: z.number(),
  interestRate: z.number(),
});

export const ChainSchema = BaseRecordSchema.extend({
  title: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  formatVersion: z.string().min(1),
  activeBranchId: IdentifierSchema,
  activeJumpId: IdentifierSchema.nullish(),
  sourceMetadata: z
    .object({
      sourceType: z.enum(['chainmaker-v2', 'native', 'unknown']),
      sourceVersion: z.string().min(1),
      importedAt: z.string().datetime(),
      rawFragment: z.unknown().optional(),
      preservedFields: JsonMapSchema.optional(),
    })
    .optional(),
  chainSettings: ChainSettingsSchema,
  bankSettings: BankSettingsSchema,
  importSourceMetadata: JsonMapSchema,
});

export const JumperSchema = ChainScopedRecordSchema.extend({
  name: z.string().min(1),
  isPrimary: z.boolean(),
  gender: z.string(),
  originalAge: z.number().nullable().optional(),
  notes: z.string(),
  originalFormSourceId: z.number().nullable().optional(),
  personality: z.object({
    personality: z.string(),
    motivation: z.string(),
    likes: z.string(),
    dislikes: z.string(),
    quirks: z.string(),
  }),
  background: z.object({
    summary: z.string(),
    description: z.string(),
  }),
  importSourceMetadata: JsonMapSchema,
});

export const CompanionSchema = ChainScopedRecordSchema.extend({
  name: z.string().min(1),
  parentJumperId: IdentifierSchema.nullish(),
  importSourceMetadata: JsonMapSchema,
});

export const JumpDurationSchema = z.object({
  days: z.number(),
  months: z.number(),
  years: z.number(),
});

export const JumpSchema = ChainScopedRecordSchema.extend({
  title: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  status: JumpStatusSchema,
  jumpType: JumpTypeSchema,
  duration: JumpDurationSchema,
  participantJumperIds: z.array(IdentifierSchema),
  sourceJumpId: z.number().nullable().optional(),
  importSourceMetadata: JsonMapSchema,
});

export const JumperParticipationSchema = ChainScopedRecordSchema.extend({
  jumpId: IdentifierSchema,
  jumperId: IdentifierSchema,
  status: ParticipationStatusSchema,
  notes: z.string(),
  purchases: z.array(z.unknown()),
  drawbacks: z.array(z.unknown()),
  retainedDrawbacks: z.array(z.unknown()),
  origins: z.record(z.string(), z.unknown()),
  budgets: z.record(z.string(), z.number()),
  stipends: z.record(z.string(), z.record(z.string(), z.number())),
  narratives: z.object({
    accomplishments: z.string(),
    challenges: z.string(),
    goals: z.string(),
  }),
  altForms: z.array(z.unknown()),
  bankDeposit: z.number(),
  currencyExchanges: z.array(z.unknown()),
  supplementPurchases: z.record(z.string(), z.unknown()),
  supplementInvestments: z.record(z.string(), z.unknown()),
  drawbackOverrides: z.record(z.string(), z.unknown()),
  importSourceMetadata: JsonMapSchema,
});

export const EffectSchema = ChainScopedRecordSchema.merge(ScopedOwnershipSchema).extend({
  title: z.string().min(1),
  description: z.string(),
  category: EffectCategorySchema,
  state: EffectStateSchema,
  sourceEffectId: z.union([z.string(), z.number()]).nullable().optional(),
  importSourceMetadata: JsonMapSchema,
});

export const BodymodFormSchema = z.object({
  sourceAltformId: z.number().nullable().optional(),
  name: z.string(),
  sex: z.string(),
  species: z.string(),
  physicalDescription: z.string(),
  capabilities: z.string(),
  imageUploaded: z.boolean(),
  heightValue: z.number().nullable().optional(),
  heightUnit: z.number().nullable().optional(),
  weightValue: z.number().nullable().optional(),
  weightUnit: z.number().nullable().optional(),
  importSourceMetadata: JsonMapSchema,
});

export const BodymodProfileSchema = ChainScopedRecordSchema.extend({
  jumperId: IdentifierSchema,
  mode: BodymodModeSchema,
  summary: z.string(),
  forms: z.array(BodymodFormSchema),
  features: z.array(JsonMapSchema),
  importSourceMetadata: JsonMapSchema,
});

export const JumpRulesContextSchema = ChainScopedRecordSchema.extend({
  jumpId: IdentifierSchema.nullish(),
  gauntlet: z.boolean(),
  warehouseAccess: AccessModeSchema,
  powerAccess: AccessModeSchema,
  itemAccess: AccessModeSchema,
  altFormAccess: AccessModeSchema,
  supplementAccess: AccessModeSchema,
  notes: z.string(),
  importSourceMetadata: JsonMapSchema,
});

export const HouseRuleProfileSchema = ChainScopedRecordSchema.extend({
  title: z.string().min(1),
  description: z.string(),
  settings: JsonMapSchema,
});

export const BranchSchema = BaseRecordSchema.extend({
  chainId: IdentifierSchema,
  title: z.string().min(1),
  sourceBranchId: IdentifierSchema.nullish(),
  forkedFromJumpId: IdentifierSchema.nullish(),
  isActive: z.boolean(),
  notes: z.string(),
  sourceMetadata: z
    .object({
      sourceType: z.enum(['chainmaker-v2', 'native', 'unknown']),
      sourceVersion: z.string().min(1),
      importedAt: z.string().datetime(),
      rawFragment: z.unknown().optional(),
      preservedFields: JsonMapSchema.optional(),
    })
    .optional(),
});

export const SnapshotSchema = BaseRecordSchema.extend({
  chainId: IdentifierSchema,
  branchId: IdentifierSchema,
  title: z.string().min(1),
  description: z.string(),
  createdFromJumpId: IdentifierSchema.nullish(),
  summary: JsonMapSchema,
});

export const NoteSchema = ChainScopedRecordSchema.merge(ScopedOwnershipSchema).extend({
  noteType: NoteTypeSchema,
  title: z.string().min(1),
  content: z.string(),
  tags: z.array(z.string()),
});

export const AttachmentRefSchema = ChainScopedRecordSchema.merge(ScopedOwnershipSchema).extend({
  label: z.string().min(1),
  kind: z.enum(['file', 'link', 'image']),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  url: z.string().optional(),
  storage: z.enum(['embedded', 'external', 'local']),
});

export const PresetProfileSchema = ChainScopedRecordSchema.extend({
  name: z.string().min(1),
  category: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
  applicableScopes: z.array(ScopeTypeSchema),
  settingsPayload: JsonMapSchema,
  overrides: JsonMapSchema,
});
