import { z } from 'zod';
import { ImportModeSchema, JsonMapSchema, SourceTypeSchema, WarningSeveritySchema } from './common';

const NumericKeyRecord = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.record(z.string().regex(/^\d+$/), valueSchema);

export const SourceMetadataSchema = z.object({
  sourceType: SourceTypeSchema,
  sourceVersion: z.string().min(1),
  importedAt: z.string().datetime(),
  rawFragment: z.unknown().optional(),
  preservedFields: JsonMapSchema.optional(),
});

export const ImportWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
  severity: WarningSeveritySchema,
});

export const UnresolvedMappingSchema = z.object({
  path: z.string().min(1),
  reason: z.string().min(1),
  severity: WarningSeveritySchema,
  rawFragment: z.unknown().optional(),
  preservedAt: z.string().optional(),
});

export const ImportSummarySchema = z.object({
  chainName: z.string().min(1),
  jumperCount: z.number().int().nonnegative(),
  jumpCount: z.number().int().nonnegative(),
  chainDrawbackCount: z.number().int().nonnegative(),
  altformCount: z.number().int().nonnegative(),
  participationCount: z.number().int().nonnegative(),
});

export const ImportReportSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  chainId: z.string().min(1).nullable().optional(),
  sourceType: SourceTypeSchema,
  sourceVersion: z.string().min(1),
  importMode: ImportModeSchema,
  status: z.enum(['draft', 'imported', 'failed']),
  summary: ImportSummarySchema,
  warnings: z.array(ImportWarningSchema),
  unresolvedMappings: z.array(UnresolvedMappingSchema),
  preservedSourceSummary: JsonMapSchema,
});

const ChainMakerV2CharacterSchema = z
  .object({
    _id: z.number(),
    name: z.string().min(1),
    gender: z.string(),
    originalAge: z.union([z.number(), z.string()]).optional(),
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
    notes: z.string(),
    _primary: z.boolean(),
    originalForm: z.number().optional(),
    perkCount: z.number().optional(),
    itemCount: z.number().optional(),
  })
  .passthrough();

const ChainMakerV2OriginSelectionSchema = z
  .object({
    cost: z.number(),
    summary: z.string(),
    description: z.string(),
  })
  .passthrough();

const ChainMakerV2NarrativeSchema = z
  .object({
    accomplishments: z.string(),
    challenges: z.string(),
    goals: z.string(),
  })
  .passthrough();

const ChainMakerV2JumpSchema = z
  .object({
    _id: z.number(),
    name: z.string().min(1),
    characters: z.array(z.number()),
    duration: z.object({
      days: z.number(),
      months: z.number(),
      years: z.number(),
    }),
    notes: NumericKeyRecord(z.string()),
    bankDeposits: NumericKeyRecord(z.number()),
    currencyExchanges: NumericKeyRecord(z.array(z.unknown())),
    supplementPurchases: NumericKeyRecord(z.record(z.string(), z.unknown())),
    supplementInvestments: NumericKeyRecord(z.record(z.string(), z.unknown())),
    useSupplements: z.boolean(),
    originCategories: NumericKeyRecord(
      z.object({
        name: z.string(),
        singleLine: z.boolean(),
        default: z.string(),
      }),
    ),
    originCategoryList: z.array(z.number()),
    currencies: NumericKeyRecord(
      z.object({
        name: z.string(),
        abbrev: z.string(),
        budget: z.number(),
        essential: z.boolean(),
      }),
    ),
    purchaseSubtypes: NumericKeyRecord(
      z.object({
        name: z.string(),
        stipend: z.number(),
        currency: z.number(),
        type: z.number(),
        essential: z.boolean(),
      }),
    ),
    subsystemSummaries: NumericKeyRecord(z.record(z.string(), z.unknown())),
    purchases: NumericKeyRecord(z.array(z.unknown())),
    retainedDrawbacks: NumericKeyRecord(z.array(z.unknown())),
    drawbacks: NumericKeyRecord(z.array(z.unknown())),
    drawbackOverrides: NumericKeyRecord(z.record(z.string(), z.unknown())),
    origins: NumericKeyRecord(NumericKeyRecord(ChainMakerV2OriginSelectionSchema)),
    altForms: NumericKeyRecord(z.array(z.unknown())),
    useAltForms: z.boolean(),
    narratives: NumericKeyRecord(ChainMakerV2NarrativeSchema),
    useNarratives: z.boolean(),
    budgets: NumericKeyRecord(NumericKeyRecord(z.number())),
    stipends: NumericKeyRecord(NumericKeyRecord(NumericKeyRecord(z.number()))),
  })
  .passthrough();

const ChainMakerV2AltformSchema = z
  .object({
    characterId: z.number(),
    _id: z.number(),
    imageUploaded: z.boolean(),
    height: z.object({
      value: z.number(),
      unit: z.number(),
    }),
    weight: z.object({
      value: z.number(),
      unit: z.number(),
    }),
    sex: z.string(),
    name: z.string(),
    species: z.string(),
    physicalDescription: z.string(),
    capabilities: z.string(),
  })
  .passthrough();

export const ChainMakerV2SourceSchema = z
  .object({
    name: z.string().min(1),
    versionNumber: z.string().min(1),
    current: z.boolean().optional(),
    characters: NumericKeyRecord(ChainMakerV2CharacterSchema),
    jumps: NumericKeyRecord(ChainMakerV2JumpSchema),
    altforms: NumericKeyRecord(ChainMakerV2AltformSchema),
    chainDrawbacks: z.array(z.unknown()),
    chainSettings: z
      .object({
        chainDrawbacksForCompanions: z.boolean(),
        chainDrawbacksSupplements: z.boolean(),
        narratives: z.enum(['enabled', 'disabled']),
        altForms: z.boolean(),
      })
      .passthrough(),
    bankSettings: z
      .object({
        enabled: z.boolean(),
        maxDeposit: z.number(),
        depositRatio: z.number(),
        interestRate: z.number(),
      })
      .passthrough(),
    characterList: z.array(z.number()),
    jumpList: z.array(z.number()),
    purchaseCategories: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    purchaseGroups: z.record(z.string(), z.unknown()).optional(),
    purchases: z.record(z.string(), z.unknown()).optional(),
    supplements: z.record(z.string(), z.unknown()).optional(),
    notesList: z.array(z.unknown()).optional(),
    notes: z.record(z.string(), z.unknown()).optional(),
    manager: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
