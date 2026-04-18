import { z } from 'zod';
import { iconicSelectionKinds } from '../domain/bodymod/types';
import type { CompanionParticipation, JumperParticipation } from '../domain/jump/types';
import { normalizeCurrencyExchange, normalizeParticipationSelection } from '../domain/jump/selection';
import type { CurrencyExchangeRecord, ParticipationSelection } from '../domain/jump/selection';
import type { JumpDoc } from '../domain/jumpdoc/types';
import {
  AccessModeSchema,
  BaseRecordSchema,
  BodymodModeSchema,
  ChainScopedRecordSchema,
  CompanionStatusSchema,
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
  SourceTypeSchema,
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
      sourceType: SourceTypeSchema,
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
  parentJumperId: IdentifierSchema.nullish().default(null),
  role: z.string().default(''),
  status: CompanionStatusSchema.default('active'),
  originJumpId: IdentifierSchema.nullish().default(null),
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
  jumpDocIds: z.array(IdentifierSchema).default([]),
  sourceJumpId: z.number().nullable().optional(),
  importSourceMetadata: JsonMapSchema,
});

export const SelectionCostSchema = z.object({
  amount: z.number(),
  currencyKey: z.string(),
});

export const SelectionPrerequisiteSchema = z.object({
  type: z.enum(['origin', 'purchase', 'drawback', 'scenario']),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  title: z.string().optional(),
  positive: z.boolean().optional(),
  importSourceMetadata: JsonMapSchema.optional(),
});

export const AlternativeCostSchema = z.object({
  costs: z.array(SelectionCostSchema),
  prerequisites: z.array(SelectionPrerequisiteSchema),
  mandatory: z.boolean(),
  label: z.string().optional(),
});

export const ScenarioRewardSchema = z.object({
  type: z.enum(['currency', 'perk', 'item', 'stipend', 'note']),
  title: z.string().optional(),
  amount: z.number().optional(),
  currencyKey: z.string().optional(),
  subtypeKey: z.string().optional(),
  note: z.string().optional(),
  sourceSelectionId: z.union([z.string(), z.number()]).nullable().optional(),
});

export const ComboBoostSchema = z.object({
  boosterTitle: z.string(),
  description: z.string(),
  sourceSelectionId: z.union([z.string(), z.number()]).nullable().optional(),
});

export const MergedSelectionSourceSchema = z.object({
  id: IdentifierSchema.optional(),
  title: z.string(),
  purchaseSection: z.enum(['perk', 'subsystem', 'item', 'location', 'other']).optional(),
  participationId: IdentifierSchema.optional(),
  jumpId: IdentifierSchema.optional(),
  participantName: z.string().optional(),
  jumpTitle: z.string().optional(),
  sourcePurchaseId: z.union([z.string(), z.number()]).nullable().optional(),
});

export const ParticipationSelectionSchema = z.object({
  id: IdentifierSchema.optional(),
  selectionKind: z.enum(['purchase', 'drawback', 'retained-drawback', 'scenario', 'companion-import']),
  title: z.string().min(1),
  summary: z.string().optional(),
  description: z.string(),
  value: z.number(),
  currencyKey: z.string(),
  purchaseValue: z.number(),
  costModifier: z.enum(['full', 'discounted', 'double-discounted', 'free', 'custom']),
  purchaseSection: z.enum(['perk', 'subsystem', 'item', 'location', 'other']).optional(),
  subtypeKey: z.string().nullable().optional(),
  purchaseType: z.number().nullable().optional(),
  tags: z.array(z.string()),
  free: z.boolean(),
  discountSource: z.string().optional(),
  choiceContext: z.string().optional(),
  alternativeCosts: z.array(AlternativeCostSchema).optional(),
  prerequisites: z.array(SelectionPrerequisiteSchema).optional(),
  scenarioRewards: z.array(ScenarioRewardSchema).optional(),
  comboBoosts: z.array(ComboBoostSchema).optional(),
  hidden: z.boolean().optional(),
  restrictionLevel: z.number().int().nonnegative().optional(),
  accessibilityStatus: z.enum(['unlocked', 'not-yet-unlocked', 'suppressed']).optional(),
  mergedFrom: z.array(MergedSelectionSourceSchema).optional(),
  mergedIntoId: IdentifierSchema.nullable().optional(),
  sourcePurchaseId: z.union([z.string(), z.number()]).nullable().optional(),
  sourceJumpDocId: IdentifierSchema.nullable().optional(),
  sourceTemplateId: z.union([z.string(), z.number()]).nullable().optional(),
  importSourceMetadata: JsonMapSchema,
});

export const CurrencyExchangeRecordSchema = z.object({
  fromCurrencyKey: z.string(),
  toCurrencyKey: z.string(),
  fromAmount: z.number(),
  toAmount: z.number(),
  notes: z.string(),
  importSourceMetadata: JsonMapSchema,
});

const PurchaseSelectionSchema = z.preprocess(
  (value) => normalizeParticipationSelection(value, 'purchase'),
  ParticipationSelectionSchema,
) as z.ZodType<ParticipationSelection>;

const DrawbackSelectionSchema = z.preprocess(
  (value) => normalizeParticipationSelection(value, 'drawback'),
  ParticipationSelectionSchema,
) as z.ZodType<ParticipationSelection>;

const RetainedDrawbackSelectionSchema = z.preprocess(
  (value) => normalizeParticipationSelection(value, 'retained-drawback'),
  ParticipationSelectionSchema,
) as z.ZodType<ParticipationSelection>;

const NormalizedCurrencyExchangeRecordSchema = z.preprocess(
  (value) => normalizeCurrencyExchange(value),
  CurrencyExchangeRecordSchema,
) as z.ZodType<CurrencyExchangeRecord>;

export const JumperParticipationSchema = ChainScopedRecordSchema.extend({
  jumpId: IdentifierSchema,
  jumperId: IdentifierSchema,
  status: ParticipationStatusSchema,
  notes: z.string(),
  purchases: z.array(PurchaseSelectionSchema),
  drawbacks: z.array(DrawbackSelectionSchema),
  retainedDrawbacks: z.array(RetainedDrawbackSelectionSchema),
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
  currencyExchanges: z.array(NormalizedCurrencyExchangeRecordSchema),
  supplementPurchases: z.record(z.string(), z.unknown()),
  supplementInvestments: z.record(z.string(), z.unknown()),
  drawbackOverrides: z.record(z.string(), z.unknown()),
  importSourceMetadata: JsonMapSchema,
}) satisfies z.ZodType<JumperParticipation>;

export const CompanionParticipationSchema = ChainScopedRecordSchema.extend({
  jumpId: IdentifierSchema,
  companionId: IdentifierSchema,
  status: ParticipationStatusSchema,
  notes: z.string(),
  purchases: z.array(PurchaseSelectionSchema),
  drawbacks: z.array(DrawbackSelectionSchema),
  retainedDrawbacks: z.array(RetainedDrawbackSelectionSchema),
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
  currencyExchanges: z.array(NormalizedCurrencyExchangeRecordSchema),
  supplementPurchases: z.record(z.string(), z.unknown()),
  supplementInvestments: z.record(z.string(), z.unknown()),
  drawbackOverrides: z.record(z.string(), z.unknown()),
  importSourceMetadata: JsonMapSchema,
}) satisfies z.ZodType<CompanionParticipation>;

const JumpDocPageRectSchema = z.object({
  page: z.number().int().nonnegative(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const JumpDocPdfAnnotationSchema = JumpDocPageRectSchema.extend({
  id: IdentifierSchema,
  label: z.string(),
  notes: z.string(),
  extractedText: z.string().default(''),
  exportKind: z.enum(['purchase', 'drawback', 'origin', 'scenario', 'companion', 'note']).default('purchase'),
  purchaseSection: z.enum(['perk', 'subsystem', 'item', 'location', 'other']).optional(),
  costAmount: z.number().nullable().default(null),
  currencyKey: z.string().default('0'),
  exportedTemplateId: IdentifierSchema.nullish(),
});

const JumpDocCurrencySchema = z.object({
  name: z.string(),
  abbrev: z.string(),
  budget: z.number().nullable(),
  essential: z.boolean(),
});

const JumpDocOriginCategorySchema = z.object({
  name: z.string(),
  singleLine: z.boolean(),
  defaultValue: z.string(),
  randomizer: z.object({
    cost: SelectionCostSchema,
    template: z.string(),
    bounds: z.array(JumpDocPageRectSchema),
  }).optional(),
});

const JumpDocPurchaseSubtypeSchema = z.object({
  name: z.string(),
  type: z.number().nullable(),
  currencyKey: z.string(),
  stipend: z.number().nullable(),
  essential: z.boolean(),
});

const JumpDocTemplateBaseSchema = z.object({
  id: IdentifierSchema,
  title: z.string(),
  description: z.string(),
  choiceContext: z.string().optional(),
  costs: z.array(SelectionCostSchema),
  bounds: z.array(JumpDocPageRectSchema),
  alternativeCosts: z.array(AlternativeCostSchema),
  prerequisites: z.array(SelectionPrerequisiteSchema),
  tags: z.array(z.string()),
  importSourceMetadata: JsonMapSchema,
});

export const JumpDocSchema = ChainScopedRecordSchema.extend({
  title: z.string().min(1),
  author: z.string(),
  source: z.string(),
  pdfAttachmentId: IdentifierSchema.nullish(),
  pdfUrl: z.string().nullish(),
  notes: z.string(),
  pdfAnnotationBounds: z.array(JumpDocPdfAnnotationSchema).default([]),
  currencies: z.record(z.string(), JumpDocCurrencySchema),
  originCategories: z.record(z.string(), JumpDocOriginCategorySchema),
  purchaseSubtypes: z.record(z.string(), JumpDocPurchaseSubtypeSchema),
  origins: z.array(z.object({
    id: IdentifierSchema,
    categoryKey: z.string(),
    title: z.string(),
    description: z.string(),
    choiceContext: z.string().optional(),
    cost: SelectionCostSchema,
    bounds: z.array(JumpDocPageRectSchema),
    importSourceMetadata: JsonMapSchema,
  })),
  purchases: z.array(JumpDocTemplateBaseSchema.extend({
    templateKind: z.literal('purchase'),
    purchaseSection: z.enum(['perk', 'subsystem', 'item', 'location', 'other']),
    subtypeKey: z.string().nullable(),
    temporary: z.boolean(),
    comboBoosts: z.array(ComboBoostSchema),
  })),
  drawbacks: z.array(JumpDocTemplateBaseSchema.extend({
    templateKind: z.literal('drawback'),
    durationYears: z.number().nullable(),
  })),
  scenarios: z.array(JumpDocTemplateBaseSchema.extend({
    templateKind: z.literal('scenario'),
    rewards: z.array(ScenarioRewardSchema),
  })),
  companions: z.array(JumpDocTemplateBaseSchema.extend({
    templateKind: z.literal('companion'),
    count: z.number().int().nonnegative(),
    allowances: z.record(z.string(), z.number()),
    stipends: z.record(z.string(), z.record(z.string(), z.number())),
  })),
  importSourceMetadata: JsonMapSchema,
}) as z.ZodType<JumpDoc>;

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

export const IconicSelectionSchema = z.object({
  kind: z.enum(iconicSelectionKinds),
  title: z.string(),
  source: z.string(),
  summary: z.string(),
  restrictionLevel: z.number().int().nonnegative().optional(),
  accessibilityStatus: z.enum(['unlocked', 'not-yet-unlocked', 'suppressed']).optional(),
});

export const BodymodProfileSchema = ChainScopedRecordSchema.extend({
  jumperId: IdentifierSchema,
  mode: BodymodModeSchema,
  summary: z.string(),
  benchmarkNotes: z.string().default(''),
  interpretationNotes: z.string().default(''),
  iconicSelections: z.array(IconicSelectionSchema).default([]),
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
      sourceType: SourceTypeSchema,
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
  payloadJson: z.string().min(1),
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
  dataUrl: z.string().optional(),
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
