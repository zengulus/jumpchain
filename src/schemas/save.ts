import { z } from 'zod';
import { AttachmentRefSchema, BodymodProfileSchema, BranchSchema, ChainSchema, CompanionSchema, EffectSchema, HouseRuleProfileSchema, JumpRulesContextSchema, JumperParticipationSchema, JumperSchema, JumpSchema, NoteSchema, PresetProfileSchema, SnapshotSchema } from './entities';
import { ImportReportSchema } from './import';

export const NativeChainBundleSchema = z.object({
  chain: ChainSchema,
  branches: z.array(BranchSchema),
  jumpers: z.array(JumperSchema),
  companions: z.array(CompanionSchema),
  jumps: z.array(JumpSchema),
  participations: z.array(JumperParticipationSchema),
  effects: z.array(EffectSchema),
  bodymodProfiles: z.array(BodymodProfileSchema),
  jumpRulesContexts: z.array(JumpRulesContextSchema),
  houseRuleProfiles: z.array(HouseRuleProfileSchema),
  presetProfiles: z.array(PresetProfileSchema),
  snapshots: z.array(SnapshotSchema),
  notes: z.array(NoteSchema),
  attachments: z.array(AttachmentRefSchema),
  importReports: z.array(ImportReportSchema),
});

export const NativeSaveEnvelopeSchema = z.object({
  formatVersion: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  chains: z.array(NativeChainBundleSchema),
  metadata: z.record(z.string(), z.unknown()),
});
