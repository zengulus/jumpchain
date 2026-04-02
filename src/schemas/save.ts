import { z } from 'zod';
import type { NativeChainBundle, NativeSaveEnvelope } from '../domain/save';
import { AttachmentRefSchema, BodymodProfileSchema, BranchSchema, ChainSchema, CompanionParticipationSchema, CompanionSchema, EffectSchema, HouseRuleProfileSchema, JumpRulesContextSchema, JumperParticipationSchema, JumperSchema, JumpSchema, NoteSchema, PresetProfileSchema, SnapshotSchema } from './entities';
import { ImportReportSchema } from './import';

export const NativeChainBundleSchema = z.object({
  chain: ChainSchema,
  branches: z.array(BranchSchema),
  jumpers: z.array(JumperSchema),
  companions: z.array(CompanionSchema),
  jumps: z.array(JumpSchema),
  participations: z.array(JumperParticipationSchema),
  companionParticipations: z.array(CompanionParticipationSchema).default([]),
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

export const NativeSaveEnvelopeHeaderSchema = z.object({
  formatVersion: z.string().min(1),
  schemaVersion: z.number().int().positive(),
});

export const NativeSaveEnvelopeSchema = z.object({
  formatVersion: NativeSaveEnvelopeHeaderSchema.shape.formatVersion,
  schemaVersion: NativeSaveEnvelopeHeaderSchema.shape.schemaVersion,
  exportedAt: z.string().datetime(),
  appVersion: z.string().min(1),
  chains: z.array(NativeChainBundleSchema),
  metadata: z.record(z.string(), z.unknown()),
});

export function validateNativeChainBundle(bundle: unknown): NativeChainBundle {
  return NativeChainBundleSchema.parse(bundle);
}

export function validateNativeSaveEnvelope(envelope: unknown): NativeSaveEnvelope {
  return NativeSaveEnvelopeSchema.parse(envelope);
}
