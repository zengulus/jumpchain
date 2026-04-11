import { APP_VERSION, CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION } from '../app/config';
import type { ImportMode } from '../domain/common';
import type { NativeChainBundle, NativeSaveEnvelope } from '../domain/save';
import type { AttachmentRef } from '../domain/attachments/types';
import type { BodymodProfile } from '../domain/bodymod/types';
import type { Branch } from '../domain/branch/types';
import type { Effect } from '../domain/effects/types';
import type { ImportReport } from '../domain/import/types';
import type { Companion, Jumper } from '../domain/jumper/types';
import type { CompanionParticipation, Jump, JumperParticipation } from '../domain/jump/types';
import type { JumpDoc } from '../domain/jumpdoc/types';
import type { Note } from '../domain/notes/types';
import type { PresetProfile } from '../domain/presets/types';
import type { HouseRuleProfile, JumpRulesContext } from '../domain/rules/types';
import type { Snapshot } from '../domain/snapshot/types';
import { buildBranchWorkspace, getCurrentJump, type BranchWorkspace } from '../domain/chain/selectors';
import { validateNativeChainBundle, validateNativeSaveEnvelope } from '../schemas';
import { createId } from '../utils/id';
import { migrateNativeSaveEnvelope } from '../migrations';
import { db, ensureDatabaseOpen } from './database';

export interface ChainOverview {
  chainId: string;
  title: string;
  updatedAt: string;
  activeBranchId: string;
  jumperCount: number;
  jumpCount: number;
  importReportCount: number;
}

interface EntityIdMaps {
  chain: Map<string, string>;
  branch: Map<string, string>;
  jumper: Map<string, string>;
  companion: Map<string, string>;
  jump: Map<string, string>;
  jumpDoc: Map<string, string>;
  participation: Map<string, string>;
  effect: Map<string, string>;
  bodymodProfile: Map<string, string>;
  jumpRulesContext: Map<string, string>;
  houseRuleProfile: Map<string, string>;
  presetProfile: Map<string, string>;
  snapshot: Map<string, string>;
  note: Map<string, string>;
  attachment: Map<string, string>;
  importReport: Map<string, string>;
}

interface ClonedBranchBundle {
  branch: Branch;
  jumpers: Jumper[];
  companions: Companion[];
  jumps: Jump[];
  jumpDocs: JumpDoc[];
  participations: JumperParticipation[];
  companionParticipations: CompanionParticipation[];
  effects: Effect[];
  bodymodProfiles: BodymodProfile[];
  jumpRulesContexts: JumpRulesContext[];
  houseRuleProfiles: HouseRuleProfile[];
  presetProfiles: PresetProfile[];
  notes: Note[];
  attachments: AttachmentRef[];
  importReports: ImportReport[];
  activeJumpId: string | null;
}

export interface SaveImportedChainBundleOptions {
  importMode?: ImportMode;
  targetChainId?: string;
  branchTitle?: string;
  targetJumperId?: string;
}

function remapId(id: string, map: Map<string, string>): string {
  return map.get(id) ?? id;
}

function remapOptionalId(id: string | null | undefined, map: Map<string, string>) {
  if (id === null || id === undefined) {
    return id;
  }

  return remapId(id, map);
}

function remapOwnerEntityId(ownerEntityType: Effect['ownerEntityType'] | Note['ownerEntityType'] | AttachmentRef['ownerEntityType'], ownerEntityId: string, maps: EntityIdMaps) {
  switch (ownerEntityType) {
    case 'chain':
      return remapId(ownerEntityId, maps.chain);
    case 'jumper':
      return remapId(ownerEntityId, maps.jumper);
    case 'companion':
      return remapId(ownerEntityId, maps.companion);
    case 'jump':
      return remapId(ownerEntityId, maps.jump);
    case 'participation':
      return remapId(ownerEntityId, maps.participation);
    case 'branch':
      return remapId(ownerEntityId, maps.branch);
    case 'snapshot':
      return remapId(ownerEntityId, maps.snapshot);
    case 'preset':
      return remapId(ownerEntityId, maps.presetProfile);
    case 'note':
      return remapId(ownerEntityId, maps.note);
    case 'attachment':
      return remapId(ownerEntityId, maps.attachment);
    case 'system':
    default:
      return ownerEntityId;
  }
}

function createEntityIdMap<T extends { id: string }>(records: T[], prefix: string) {
  return new Map(records.map((record) => [record.id, createId(prefix)]));
}

function createBundleIdMaps(bundle: NativeChainBundle): EntityIdMaps {
  return {
    chain: new Map([[bundle.chain.id, createId('chain')]]),
    branch: createEntityIdMap(bundle.branches, 'branch'),
    jumper: createEntityIdMap(bundle.jumpers, 'jumper'),
    companion: createEntityIdMap(bundle.companions, 'companion'),
    jump: createEntityIdMap(bundle.jumps, 'jump'),
    jumpDoc: createEntityIdMap(bundle.jumpDocs, 'jumpdoc'),
    participation: createEntityIdMap(
      [...bundle.participations, ...bundle.companionParticipations],
      'part',
    ),
    effect: createEntityIdMap(bundle.effects, 'effect'),
    bodymodProfile: createEntityIdMap(bundle.bodymodProfiles, 'bodymod'),
    jumpRulesContext: createEntityIdMap(bundle.jumpRulesContexts, 'rules'),
    houseRuleProfile: createEntityIdMap(bundle.houseRuleProfiles, 'house'),
    presetProfile: createEntityIdMap(bundle.presetProfiles, 'preset'),
    snapshot: createEntityIdMap(bundle.snapshots, 'snapshot'),
    note: createEntityIdMap(bundle.notes, 'note'),
    attachment: createEntityIdMap(bundle.attachments, 'attachment'),
    importReport: createEntityIdMap(bundle.importReports, 'report'),
  };
}

function filterBranchBundleToJump(branchBundle: NativeChainBundle, selectedJumpId: string): NativeChainBundle {
  const selectedJump = branchBundle.jumps.find((jump) => jump.id === selectedJumpId);

  if (!selectedJump) {
    return branchBundle;
  }

  const keptJumps = branchBundle.jumps.filter((jump) => jump.orderIndex <= selectedJump.orderIndex);
  const keptJumpIds = new Set(keptJumps.map((jump) => jump.id));
  const keptParticipations = branchBundle.participations.filter((participation) => keptJumpIds.has(participation.jumpId));
  const keptCompanionParticipations = branchBundle.companionParticipations.filter((participation) =>
    keptJumpIds.has(participation.jumpId),
  );
  const keptParticipationIds = new Set(
    [...keptParticipations, ...keptCompanionParticipations].map((participation) => participation.id),
  );

  const shouldKeepOwnedRecord = (ownerEntityType: Note['ownerEntityType'] | Effect['ownerEntityType'] | AttachmentRef['ownerEntityType'], ownerEntityId: string) => {
    if (ownerEntityType === 'jump') {
      return keptJumpIds.has(ownerEntityId);
    }

    if (ownerEntityType === 'participation') {
      return keptParticipationIds.has(ownerEntityId);
    }

    return true;
  };

  return validateNativeChainBundle({
    ...branchBundle,
    chain: {
      ...branchBundle.chain,
      activeJumpId: selectedJump.id,
    },
    jumps: keptJumps,
    participations: keptParticipations,
    companionParticipations: keptCompanionParticipations,
    jumpRulesContexts: branchBundle.jumpRulesContexts.filter((context) => context.jumpId === null || context.jumpId === undefined || keptJumpIds.has(context.jumpId)),
    effects: branchBundle.effects.filter((effect) => shouldKeepOwnedRecord(effect.ownerEntityType, effect.ownerEntityId)),
    notes: branchBundle.notes.filter((note) => shouldKeepOwnedRecord(note.ownerEntityType, note.ownerEntityId)),
    attachments: branchBundle.attachments.filter((attachment) => shouldKeepOwnedRecord(attachment.ownerEntityType, attachment.ownerEntityId)),
    snapshots: [],
  });
}

function cloneBundleWithRemappedIds(bundle: NativeChainBundle): NativeChainBundle {
  const validatedBundle = validateNativeChainBundle(bundle);
  const maps = createBundleIdMaps(validatedBundle);

  const chainId = remapId(validatedBundle.chain.id, maps.chain);

  const clonedBranches: Branch[] = validatedBundle.branches.map((branch) => ({
    ...branch,
    id: remapId(branch.id, maps.branch),
    chainId,
    forkedFromJumpId: remapOptionalId(branch.forkedFromJumpId, maps.jump),
  }));

  const clonedJumpers: Jumper[] = validatedBundle.jumpers.map((jumper) => ({
    ...jumper,
    id: remapId(jumper.id, maps.jumper),
    chainId,
    branchId: remapId(jumper.branchId, maps.branch),
  }));

  const clonedCompanions: Companion[] = validatedBundle.companions.map((companion) => ({
    ...companion,
    id: remapId(companion.id, maps.companion),
    chainId,
    branchId: remapId(companion.branchId, maps.branch),
    parentJumperId: remapOptionalId(companion.parentJumperId, maps.jumper) ?? null,
  }));

  const clonedJumps: Jump[] = validatedBundle.jumps.map((jump) => ({
    ...jump,
    id: remapId(jump.id, maps.jump),
    chainId,
    branchId: remapId(jump.branchId, maps.branch),
    participantJumperIds: jump.participantJumperIds.map((participantId) => remapId(participantId, maps.jumper)),
    jumpDocIds: jump.jumpDocIds.map((jumpDocId) => remapId(jumpDocId, maps.jumpDoc)),
  }));

  const clonedJumpDocs: JumpDoc[] = validatedBundle.jumpDocs.map((jumpDoc) => ({
    ...jumpDoc,
    id: remapId(jumpDoc.id, maps.jumpDoc),
    chainId,
    branchId: remapId(jumpDoc.branchId, maps.branch),
    pdfAttachmentId: remapOptionalId(jumpDoc.pdfAttachmentId, maps.attachment) ?? null,
  }));

  const clonedParticipations: JumperParticipation[] = validatedBundle.participations.map((participation) => ({
    ...participation,
    id: remapId(participation.id, maps.participation),
    chainId,
    branchId: remapId(participation.branchId, maps.branch),
    jumpId: remapId(participation.jumpId, maps.jump),
    jumperId: remapId(participation.jumperId, maps.jumper),
  }));

  const clonedCompanionParticipations: CompanionParticipation[] = validatedBundle.companionParticipations.map((participation) => ({
    ...participation,
    id: remapId(participation.id, maps.participation),
    chainId,
    branchId: remapId(participation.branchId, maps.branch),
    jumpId: remapId(participation.jumpId, maps.jump),
    companionId: remapId(participation.companionId, maps.companion),
  }));

  const clonedEffects: Effect[] = validatedBundle.effects.map((effect) => ({
    ...effect,
    id: remapId(effect.id, maps.effect),
    chainId,
    branchId: remapId(effect.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(effect.ownerEntityType, effect.ownerEntityId, maps),
  }));

  const clonedBodymodProfiles: BodymodProfile[] = validatedBundle.bodymodProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.bodymodProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
    jumperId: remapId(profile.jumperId, maps.jumper),
  }));

  const clonedJumpRulesContexts: JumpRulesContext[] = validatedBundle.jumpRulesContexts.map((context) => ({
    ...context,
    id: remapId(context.id, maps.jumpRulesContext),
    chainId,
    branchId: remapId(context.branchId, maps.branch),
    jumpId: remapOptionalId(context.jumpId, maps.jump),
  }));

  const clonedHouseRuleProfiles: HouseRuleProfile[] = validatedBundle.houseRuleProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.houseRuleProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
  }));

  const clonedPresetProfiles: PresetProfile[] = validatedBundle.presetProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.presetProfile),
    chainId,
    branchId: remapId(profile.branchId, maps.branch),
  }));

  const clonedSnapshots: Snapshot[] = validatedBundle.snapshots.map((snapshot) => ({
      ...snapshot,
      id: remapId(snapshot.id, maps.snapshot),
      chainId,
      branchId: remapId(snapshot.branchId, maps.branch),
      createdFromJumpId: remapOptionalId(snapshot.createdFromJumpId, maps.jump),
  }));

  const clonedNotes: Note[] = validatedBundle.notes.map((note) => ({
    ...note,
    id: remapId(note.id, maps.note),
    chainId,
    branchId: remapId(note.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(note.ownerEntityType, note.ownerEntityId, maps),
  }));

  const clonedAttachments: AttachmentRef[] = validatedBundle.attachments.map((attachment) => ({
    ...attachment,
    id: remapId(attachment.id, maps.attachment),
    chainId,
    branchId: remapId(attachment.branchId, maps.branch),
    ownerEntityId: remapOwnerEntityId(attachment.ownerEntityType, attachment.ownerEntityId, maps),
  }));

  const clonedImportReports: ImportReport[] = validatedBundle.importReports.map((report) => ({
    ...report,
    id: remapId(report.id, maps.importReport),
    chainId: remapOptionalId(report.chainId, maps.chain),
  }));

  return validateNativeChainBundle({
    chain: {
      ...validatedBundle.chain,
      id: chainId,
      activeBranchId: remapId(validatedBundle.chain.activeBranchId, maps.branch),
      activeJumpId: remapOptionalId(validatedBundle.chain.activeJumpId, maps.jump),
    },
    branches: clonedBranches,
    jumpers: clonedJumpers,
    companions: clonedCompanions,
    jumps: clonedJumps,
    jumpDocs: clonedJumpDocs,
    participations: clonedParticipations,
    companionParticipations: clonedCompanionParticipations,
    effects: clonedEffects,
    bodymodProfiles: clonedBodymodProfiles,
    jumpRulesContexts: clonedJumpRulesContexts,
    houseRuleProfiles: clonedHouseRuleProfiles,
    presetProfiles: clonedPresetProfiles,
    snapshots: clonedSnapshots,
    notes: clonedNotes,
    attachments: clonedAttachments,
    importReports: clonedImportReports,
  });
}

function cloneBranchBundleToExistingChain(
  branchBundle: NativeChainBundle,
  targetChain: NativeChainBundle['chain'],
  options: {
    branchTitle: string;
    branchNotes?: string;
    importMode?: ImportMode;
    includeImportReports?: boolean;
    sourceBranchId?: string | null;
    forkedFromJumpId?: string | null;
    preferredActiveJumpId?: string | null;
  },
): ClonedBranchBundle {
  const sourceBranch = branchBundle.branches[0];

  if (!sourceBranch) {
    throw new Error('Branch bundle must contain exactly one branch.');
  }

  const maps = createBundleIdMaps(branchBundle);
  const now = new Date().toISOString();
  const newBranchId = createId('branch');
  const chainId = targetChain.id;

  maps.branch = new Map([[sourceBranch.id, newBranchId]]);

  const jumpers: Jumper[] = branchBundle.jumpers.map((jumper) => ({
    ...jumper,
    id: remapId(jumper.id, maps.jumper),
    chainId,
    branchId: newBranchId,
    createdAt: now,
    updatedAt: now,
  }));

  const companions: Companion[] = branchBundle.companions.map((companion) => ({
    ...companion,
    id: remapId(companion.id, maps.companion),
    chainId,
    branchId: newBranchId,
    parentJumperId: remapOptionalId(companion.parentJumperId, maps.jumper) ?? null,
    createdAt: now,
    updatedAt: now,
  }));

  const jumps: Jump[] = branchBundle.jumps.map((jump) => ({
    ...jump,
    id: remapId(jump.id, maps.jump),
    chainId,
    branchId: newBranchId,
    participantJumperIds: jump.participantJumperIds.map((participantId) => remapId(participantId, maps.jumper)),
    jumpDocIds: jump.jumpDocIds.map((jumpDocId) => remapId(jumpDocId, maps.jumpDoc)),
    createdAt: now,
    updatedAt: now,
  }));

  const jumpDocs: JumpDoc[] = branchBundle.jumpDocs.map((jumpDoc) => ({
    ...jumpDoc,
    id: remapId(jumpDoc.id, maps.jumpDoc),
    chainId,
    branchId: newBranchId,
    pdfAttachmentId: remapOptionalId(jumpDoc.pdfAttachmentId, maps.attachment) ?? null,
    createdAt: now,
    updatedAt: now,
  }));

  const participations: JumperParticipation[] = branchBundle.participations.map((participation) => ({
    ...participation,
    id: remapId(participation.id, maps.participation),
    chainId,
    branchId: newBranchId,
    jumpId: remapId(participation.jumpId, maps.jump),
    jumperId: remapId(participation.jumperId, maps.jumper),
    createdAt: now,
    updatedAt: now,
  }));

  const companionParticipations: CompanionParticipation[] = branchBundle.companionParticipations.map((participation) => ({
    ...participation,
    id: remapId(participation.id, maps.participation),
    chainId,
    branchId: newBranchId,
    jumpId: remapId(participation.jumpId, maps.jump),
    companionId: remapId(participation.companionId, maps.companion),
    createdAt: now,
    updatedAt: now,
  }));

  const effects: Effect[] = branchBundle.effects.map((effect) => ({
    ...effect,
    id: remapId(effect.id, maps.effect),
    chainId,
    branchId: newBranchId,
    ownerEntityId: remapOwnerEntityId(effect.ownerEntityType, effect.ownerEntityId, maps),
    createdAt: now,
    updatedAt: now,
  }));

  const bodymodProfiles: BodymodProfile[] = branchBundle.bodymodProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.bodymodProfile),
    chainId,
    branchId: newBranchId,
    jumperId: remapId(profile.jumperId, maps.jumper),
    createdAt: now,
    updatedAt: now,
  }));

  const jumpRulesContexts: JumpRulesContext[] = branchBundle.jumpRulesContexts.map((context) => ({
    ...context,
    id: remapId(context.id, maps.jumpRulesContext),
    chainId,
    branchId: newBranchId,
    jumpId: remapOptionalId(context.jumpId, maps.jump),
    createdAt: now,
    updatedAt: now,
  }));

  const houseRuleProfiles: HouseRuleProfile[] = branchBundle.houseRuleProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.houseRuleProfile),
    chainId,
    branchId: newBranchId,
    createdAt: now,
    updatedAt: now,
  }));

  const presetProfiles: PresetProfile[] = branchBundle.presetProfiles.map((profile) => ({
    ...profile,
    id: remapId(profile.id, maps.presetProfile),
    chainId,
    branchId: newBranchId,
    createdAt: now,
    updatedAt: now,
  }));

  const notes: Note[] = branchBundle.notes.map((note) => ({
    ...note,
    id: remapId(note.id, maps.note),
    chainId,
    branchId: newBranchId,
    ownerEntityId: remapOwnerEntityId(note.ownerEntityType, note.ownerEntityId, maps),
    createdAt: now,
    updatedAt: now,
  }));

  const attachments: AttachmentRef[] = branchBundle.attachments.map((attachment) => ({
    ...attachment,
    id: remapId(attachment.id, maps.attachment),
    chainId,
    branchId: newBranchId,
    ownerEntityId: remapOwnerEntityId(attachment.ownerEntityType, attachment.ownerEntityId, maps),
    createdAt: now,
    updatedAt: now,
  }));

  const importReports: ImportReport[] = options.includeImportReports
    ? branchBundle.importReports.map((report) => ({
        ...report,
        id: remapId(report.id, maps.importReport),
        chainId,
        importMode: options.importMode ?? 'new-branch',
        status: 'imported',
        createdAt: now,
        updatedAt: now,
      }))
    : [];

  const remappedPreferredActiveJumpId = remapOptionalId(
    options.preferredActiveJumpId ?? branchBundle.chain.activeJumpId,
    maps.jump,
  );
  const activeJumpId =
    remappedPreferredActiveJumpId ??
    getCurrentJump(
      {
        ...targetChain,
        activeJumpId: null,
      },
      jumps,
    )?.id ??
    null;

  const branch: Branch = {
    ...sourceBranch,
    id: newBranchId,
    chainId,
    title: options.branchTitle,
    sourceBranchId: options.sourceBranchId ?? sourceBranch.id,
    forkedFromJumpId: remapOptionalId(options.forkedFromJumpId ?? sourceBranch.forkedFromJumpId, maps.jump),
    isActive: true,
    notes: options.branchNotes ?? sourceBranch.notes,
    createdAt: now,
    updatedAt: now,
  };

  return {
    branch,
    jumpers,
    companions,
    jumps,
    jumpDocs,
    participations,
    companionParticipations,
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles,
    presetProfiles,
    notes,
    attachments,
    importReports,
    activeJumpId,
  };
}

function mergeSingleJumpBundleToExistingChain(
  importBundle: NativeChainBundle,
  targetBundle: NativeChainBundle,
  options: {
    targetJumperId: string;
  },
) {
  if (
    importBundle.jumps.length !== 1 ||
    importBundle.participations.length !== 1 ||
    importBundle.companionParticipations.length > 0 ||
    importBundle.companions.length > 0 ||
    importBundle.effects.length > 0 ||
    importBundle.bodymodProfiles.length > 0 ||
    importBundle.houseRuleProfiles.length > 0 ||
    importBundle.presetProfiles.length > 0 ||
    importBundle.notes.length > 0 ||
    importBundle.attachments.length > 0 ||
    importBundle.snapshots.length > 0
  ) {
    throw new Error('Single-jump import mode only supports one imported jump with one jumper participation.');
  }

  const now = new Date().toISOString();
  const targetBranchId = targetBundle.chain.activeBranchId;
  const targetJumper = targetBundle.jumpers.find(
    (jumper) => jumper.id === options.targetJumperId && jumper.branchId === targetBranchId,
  );

  if (!targetJumper) {
    throw new Error('Choose a valid target jumper from the active branch.');
  }

  const sourceJump = importBundle.jumps[0]!;
  const sourceParticipation = importBundle.participations[0]!;
  const sourceRulesContext =
    importBundle.jumpRulesContexts.find((context) => context.jumpId === sourceJump.id) ??
    importBundle.jumpRulesContexts[0] ??
    null;
  const sourceJumper = importBundle.jumpers[0] ?? null;
  const branchJumps = targetBundle.jumps.filter((jump) => jump.branchId === targetBranchId);
  const nextOrderIndex =
    branchJumps.length > 0 ? Math.max(...branchJumps.map((jump) => jump.orderIndex)) + 1 : 0;
  const hasExistingJumps = branchJumps.length > 0;
  const importedJumpStatus = hasExistingJumps ? ('completed' as const) : sourceJump.status;
  const importedParticipationStatus =
    importedJumpStatus === 'current' ? ('active' as const) : ('completed' as const);
  const newJumpId = createId('jump');
  const newParticipationId = createId('part');
  const nextActiveJumpId =
    targetBundle.chain.activeJumpId ?? (importedJumpStatus === 'current' ? newJumpId : null);

  const jump: Jump = {
    ...sourceJump,
    id: newJumpId,
    chainId: targetBundle.chain.id,
    branchId: targetBranchId,
    participantJumperIds: [targetJumper.id],
    orderIndex: nextOrderIndex,
    status: importedJumpStatus,
    createdAt: now,
    updatedAt: now,
    importSourceMetadata: {
      ...sourceJump.importSourceMetadata,
      importMode: 'single-jump',
      importedToExistingJumperId: targetJumper.id,
      importedToExistingJumperName: targetJumper.name,
      sourceImportedJumperName: sourceJumper?.name ?? null,
    },
  };

  const participation: JumperParticipation = {
    ...sourceParticipation,
    id: newParticipationId,
    chainId: targetBundle.chain.id,
    branchId: targetBranchId,
    jumpId: newJumpId,
    jumperId: targetJumper.id,
    status: importedParticipationStatus,
    createdAt: now,
    updatedAt: now,
    importSourceMetadata: {
      ...sourceParticipation.importSourceMetadata,
      importMode: 'single-jump',
      importedToExistingJumperId: targetJumper.id,
      importedToExistingJumperName: targetJumper.name,
      sourceImportedJumperName: sourceJumper?.name ?? null,
    },
  };

  const jumpRulesContext: JumpRulesContext | null = sourceRulesContext
    ? {
        ...sourceRulesContext,
        id: createId('rules'),
        chainId: targetBundle.chain.id,
        branchId: targetBranchId,
        jumpId: newJumpId,
        createdAt: now,
        updatedAt: now,
      }
    : null;

  const importReports: ImportReport[] = importBundle.importReports.map((report) => ({
    ...report,
    id: createId('report'),
    chainId: targetBundle.chain.id,
    importMode: 'single-jump',
    status: 'imported',
    createdAt: now,
    updatedAt: now,
  }));

  return {
    jump,
    participation,
    jumpRulesContext,
    importReports,
    nextActiveJumpId,
    updatedAt: now,
  };
}

async function writeBundle(bundle: NativeChainBundle) {
  await ensureDatabaseOpen();
  await writeBundles([validateNativeChainBundle(bundle)]);
}

async function writeBundles(bundles: NativeChainBundle[]) {
  await ensureDatabaseOpen();

  if (bundles.length === 0) {
    return;
  }

  const tables = [
    db.chains,
    db.branches,
    db.jumpers,
    db.companions,
    db.jumps,
    db.jumpDocs,
    db.participations,
    db.companionParticipations,
    db.effects,
    db.bodymodProfiles,
    db.jumpRulesContexts,
    db.houseRuleProfiles,
    db.presetProfiles,
    db.snapshots,
    db.notes,
    db.attachments,
    db.importReports,
  ] as const;
  const validatedBundles = bundles.map((bundle) => validateNativeChainBundle(bundle));

  await db.transaction(
    'rw',
    tables,
    async () => {
      await db.chains.bulkPut(validatedBundles.map((bundle) => bundle.chain));
      await db.branches.bulkPut(validatedBundles.flatMap((bundle) => bundle.branches));
      await db.jumpers.bulkPut(validatedBundles.flatMap((bundle) => bundle.jumpers));
      await db.companions.bulkPut(validatedBundles.flatMap((bundle) => bundle.companions));
      await db.jumps.bulkPut(validatedBundles.flatMap((bundle) => bundle.jumps));
      await db.jumpDocs.bulkPut(validatedBundles.flatMap((bundle) => bundle.jumpDocs));
      await db.participations.bulkPut(validatedBundles.flatMap((bundle) => bundle.participations));
      await db.companionParticipations.bulkPut(validatedBundles.flatMap((bundle) => bundle.companionParticipations));
      await db.effects.bulkPut(validatedBundles.flatMap((bundle) => bundle.effects));
      await db.bodymodProfiles.bulkPut(validatedBundles.flatMap((bundle) => bundle.bodymodProfiles));
      await db.jumpRulesContexts.bulkPut(validatedBundles.flatMap((bundle) => bundle.jumpRulesContexts));
      await db.houseRuleProfiles.bulkPut(validatedBundles.flatMap((bundle) => bundle.houseRuleProfiles));
      await db.presetProfiles.bulkPut(validatedBundles.flatMap((bundle) => bundle.presetProfiles));
      await db.snapshots.bulkPut(validatedBundles.flatMap((bundle) => bundle.snapshots));
      await db.notes.bulkPut(validatedBundles.flatMap((bundle) => bundle.notes));
      await db.attachments.bulkPut(validatedBundles.flatMap((bundle) => bundle.attachments));
      await db.importReports.bulkPut(validatedBundles.flatMap((bundle) => bundle.importReports));
    },
  );
}

export async function createBlankChain(title: string): Promise<NativeChainBundle> {
  await ensureDatabaseOpen();
  const now = new Date().toISOString();
  const chainId = createId('chain');
  const branchId = createId('branch');

  const bundle: NativeChainBundle = {
    chain: {
      id: chainId,
      createdAt: now,
      updatedAt: now,
      title: title.trim() || 'Untitled Chain',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      formatVersion: NATIVE_FORMAT_VERSION,
      activeBranchId: branchId,
      activeJumpId: null,
      chainSettings: {
        chainDrawbacksForCompanions: false,
        chainDrawbacksSupplements: true,
        narratives: 'enabled',
        altForms: true,
      },
      bankSettings: {
        enabled: false,
        maxDeposit: 200,
        depositRatio: 50,
        interestRate: 0,
      },
      importSourceMetadata: {},
    },
    branches: [
      {
        id: branchId,
        chainId,
        createdAt: now,
        updatedAt: now,
        title: 'Mainline',
        sourceBranchId: null,
        forkedFromJumpId: null,
        isActive: true,
        notes: 'Created locally.',
      },
    ],
    jumpers: [],
    companions: [],
    jumps: [],
    jumpDocs: [],
    participations: [],
    companionParticipations: [],
    effects: [],
    bodymodProfiles: [],
    jumpRulesContexts: [],
    houseRuleProfiles: [],
    presetProfiles: [],
    snapshots: [],
    notes: [],
    attachments: [],
    importReports: [],
  };

  const validatedBundle = validateNativeChainBundle(bundle);
  await writeBundle(validatedBundle);
  return validatedBundle;
}

export async function saveImportedChainBundle(
  bundle: NativeChainBundle,
  options: SaveImportedChainBundleOptions = {},
): Promise<NativeChainBundle> {
  await ensureDatabaseOpen();
  const importMode = options.importMode ?? 'new-chain';
  const now = new Date().toISOString();

  if (importMode === 'single-jump') {
    if (!options.targetChainId) {
      throw new Error('A target chain is required for single-jump imports.');
    }

    if (!options.targetJumperId) {
      throw new Error('A target jumper is required for single-jump imports.');
    }

    const targetBundle = await getChainBundle(options.targetChainId);

    if (!targetBundle) {
      throw new Error('Target chain not found.');
    }

    const mergedJumpImport = mergeSingleJumpBundleToExistingChain(bundle, targetBundle, {
      targetJumperId: options.targetJumperId,
    });

    await db.transaction(
      'rw',
      [db.chains, db.branches, db.jumps, db.participations, db.jumpRulesContexts, db.importReports],
      async () => {
        await db.jumps.put(mergedJumpImport.jump);
        await db.participations.put(mergedJumpImport.participation);

        if (mergedJumpImport.jumpRulesContext) {
          await db.jumpRulesContexts.put(mergedJumpImport.jumpRulesContext);
        }

        if (mergedJumpImport.importReports.length > 0) {
          await db.importReports.bulkPut(mergedJumpImport.importReports);
        }

        await db.branches.update(targetBundle.chain.activeBranchId, {
          updatedAt: mergedJumpImport.updatedAt,
        });
        await db.chains.update(targetBundle.chain.id, {
          activeJumpId: mergedJumpImport.nextActiveJumpId,
          updatedAt: mergedJumpImport.updatedAt,
        });
      },
    );

    const persistedTargetBundle = await getChainBundle(targetBundle.chain.id);

    if (!persistedTargetBundle) {
      throw new Error('Unable to reload the single-jump import target chain.');
    }

    return persistedTargetBundle;
  }

  if (importMode !== 'new-chain') {
    if (!options.targetChainId) {
      throw new Error('A target chain is required for staged imports.');
    }

    const targetBundle = await getChainBundle(options.targetChainId);

    if (!targetBundle) {
      throw new Error('Target chain not found.');
    }

    const clonedBranch = cloneBranchBundleToExistingChain(bundle, targetBundle.chain, {
      branchTitle:
        options.branchTitle?.trim() ||
        (importMode === 'new-jumpers' ? `Imported Jumpers: ${bundle.chain.title}` : `Imported Branch: ${bundle.chain.title}`),
      branchNotes:
        importMode === 'new-jumpers'
          ? 'Imported into the existing chain as a non-destructive jumper staging branch.'
          : 'Imported into the existing chain as a non-destructive branch.',
      includeImportReports: true,
      importMode,
      sourceBranchId: bundle.branches[0]?.id ?? null,
      preferredActiveJumpId: bundle.chain.activeJumpId ?? null,
    });

    await db.transaction(
      'rw',
      [
        db.chains,
        db.branches,
        db.jumpers,
        db.companions,
        db.jumps,
        db.jumpDocs,
        db.participations,
        db.companionParticipations,
        db.effects,
        db.bodymodProfiles,
        db.jumpRulesContexts,
        db.houseRuleProfiles,
        db.presetProfiles,
        db.notes,
        db.attachments,
        db.importReports,
      ],
      async () => {
        await Promise.all(
          targetBundle.branches.map((branch) =>
            db.branches.update(branch.id, {
              isActive: false,
              updatedAt: now,
            }),
          ),
        );

        await db.branches.put(clonedBranch.branch);
        await db.jumpers.bulkPut(clonedBranch.jumpers);
        await db.companions.bulkPut(clonedBranch.companions);
        await db.jumps.bulkPut(clonedBranch.jumps);
        await db.jumpDocs.bulkPut(clonedBranch.jumpDocs);
        await db.participations.bulkPut(clonedBranch.participations);
        await db.companionParticipations.bulkPut(clonedBranch.companionParticipations);
        await db.effects.bulkPut(clonedBranch.effects);
        await db.bodymodProfiles.bulkPut(clonedBranch.bodymodProfiles);
        await db.jumpRulesContexts.bulkPut(clonedBranch.jumpRulesContexts);
        await db.houseRuleProfiles.bulkPut(clonedBranch.houseRuleProfiles);
        await db.presetProfiles.bulkPut(clonedBranch.presetProfiles);
        await db.notes.bulkPut(clonedBranch.notes);
        await db.attachments.bulkPut(clonedBranch.attachments);
        await db.importReports.bulkPut(clonedBranch.importReports);
        await db.chains.update(targetBundle.chain.id, {
          activeBranchId: clonedBranch.branch.id,
          activeJumpId: clonedBranch.activeJumpId,
          updatedAt: now,
        });
      },
    );

    const persistedTargetBundle = await getChainBundle(targetBundle.chain.id);

    if (!persistedTargetBundle) {
      throw new Error('Unable to reload the staged import target chain.');
    }

    return persistedTargetBundle;
  }

  const persistedBundle = validateNativeChainBundle({
    ...bundle,
    chain: {
      ...bundle.chain,
      updatedAt: now,
    },
    branches: bundle.branches.map((branch, index) => ({
      ...branch,
      isActive: index === 0 ? true : branch.isActive,
      updatedAt: now,
    })),
    jumpers: bundle.jumpers.map((jumper) => ({
      ...jumper,
      updatedAt: now,
    })),
    companions: bundle.companions.map((companion) => ({
      ...companion,
      updatedAt: now,
    })),
    jumps: bundle.jumps.map((jump) => ({
      ...jump,
      updatedAt: now,
    })),
    jumpDocs: bundle.jumpDocs.map((jumpDoc) => ({
      ...jumpDoc,
      updatedAt: now,
    })),
    participations: bundle.participations.map((participation) => ({
      ...participation,
      updatedAt: now,
    })),
    companionParticipations: bundle.companionParticipations.map((participation) => ({
      ...participation,
      updatedAt: now,
    })),
    effects: bundle.effects.map((effect) => ({
      ...effect,
      updatedAt: now,
    })),
    bodymodProfiles: bundle.bodymodProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    jumpRulesContexts: bundle.jumpRulesContexts.map((context) => ({
      ...context,
      updatedAt: now,
    })),
    houseRuleProfiles: bundle.houseRuleProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    presetProfiles: bundle.presetProfiles.map((profile) => ({
      ...profile,
      updatedAt: now,
    })),
    snapshots: bundle.snapshots,
    notes: bundle.notes.map((note) => ({
      ...note,
      updatedAt: now,
    })),
    attachments: bundle.attachments.map((attachment) => ({
      ...attachment,
      updatedAt: now,
    })),
    importReports: bundle.importReports.map((report) => ({
      ...report,
      importMode,
      status: 'imported',
      updatedAt: now,
    })),
  });

  await writeBundle(persistedBundle);
  return persistedBundle;
}

export async function getChainBundle(chainId: string): Promise<NativeChainBundle | undefined> {
  await ensureDatabaseOpen();
  const chain = await db.chains.get(chainId);

  if (!chain) {
    return undefined;
  }

  const [
    branches,
    jumpers,
    companions,
    jumps,
    jumpDocs,
    participations,
    companionParticipations,
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles,
    presetProfiles,
    snapshots,
    notes,
    attachments,
    importReports,
  ] = await Promise.all([
    db.branches.where('chainId').equals(chainId).toArray(),
    db.jumpers.where('chainId').equals(chainId).toArray(),
    db.companions.where('chainId').equals(chainId).toArray(),
    db.jumps.where('chainId').equals(chainId).toArray(),
    db.jumpDocs.where('chainId').equals(chainId).toArray(),
    db.participations.where('chainId').equals(chainId).toArray(),
    db.companionParticipations.where('chainId').equals(chainId).toArray(),
    db.effects.where('chainId').equals(chainId).toArray(),
    db.bodymodProfiles.where('chainId').equals(chainId).toArray(),
    db.jumpRulesContexts.where('chainId').equals(chainId).toArray(),
    db.houseRuleProfiles.where('chainId').equals(chainId).toArray(),
    db.presetProfiles.where('chainId').equals(chainId).toArray(),
    db.snapshots.where('chainId').equals(chainId).toArray(),
    db.notes.where('chainId').equals(chainId).toArray(),
    db.attachments.where('chainId').equals(chainId).toArray(),
    db.importReports.where('chainId').equals(chainId).toArray(),
  ]);

  return validateNativeChainBundle({
    chain,
    branches,
    jumpers,
    companions,
    jumps,
    jumpDocs,
    participations,
    companionParticipations,
    effects,
    bodymodProfiles,
    jumpRulesContexts,
    houseRuleProfiles,
    presetProfiles,
    snapshots,
    notes,
    attachments,
    importReports,
  });
}

export async function getBranchWorkspace(chainId: string, activeBranchId: string): Promise<BranchWorkspace | undefined> {
  await ensureDatabaseOpen();
  const bundle = await getChainBundle(chainId);

  if (!bundle) {
    return undefined;
  }

  return buildBranchWorkspace(bundle, activeBranchId);
}

export async function getBranchBundle(chainId: string, branchId: string): Promise<NativeChainBundle | undefined> {
  await ensureDatabaseOpen();
  const bundle = await getChainBundle(chainId);

  if (!bundle) {
    return undefined;
  }

  const workspace = buildBranchWorkspace(bundle, branchId);

  if (!workspace.activeBranch) {
    return undefined;
  }

  return validateNativeChainBundle({
    chain: {
      ...bundle.chain,
      activeBranchId: workspace.activeBranch.id,
      activeJumpId: workspace.currentJump?.id ?? null,
    },
    branches: [workspace.activeBranch],
    jumpers: bundle.jumpers.filter((record) => record.branchId === branchId),
    companions: bundle.companions.filter((record) => record.branchId === branchId),
    jumps: bundle.jumps.filter((record) => record.branchId === branchId),
    jumpDocs: bundle.jumpDocs.filter((record) => record.branchId === branchId),
    participations: bundle.participations.filter((record) => record.branchId === branchId),
    companionParticipations: bundle.companionParticipations.filter((record) => record.branchId === branchId),
    effects: bundle.effects.filter((record) => record.branchId === branchId),
    bodymodProfiles: bundle.bodymodProfiles.filter((record) => record.branchId === branchId),
    jumpRulesContexts: bundle.jumpRulesContexts.filter((record) => record.branchId === branchId),
    houseRuleProfiles: bundle.houseRuleProfiles.filter((record) => record.branchId === branchId),
    presetProfiles: bundle.presetProfiles.filter((record) => record.branchId === branchId),
    snapshots: bundle.snapshots.filter((record) => record.branchId === branchId),
    notes: bundle.notes.filter((record) => record.branchId === branchId),
    attachments: bundle.attachments.filter((record) => record.branchId === branchId),
    importReports: workspace.importReports,
  });
}

export async function listChainOverviews(): Promise<ChainOverview[]> {
  await ensureDatabaseOpen();
  const chains = await db.chains.orderBy('updatedAt').reverse().toArray();

  return Promise.all(
    chains.map(async (chain) => {
      const [jumperCount, jumpCount, importReportCount] = await Promise.all([
        db.jumpers.where('chainId').equals(chain.id).count(),
        db.jumps.where('chainId').equals(chain.id).count(),
        db.importReports.where('chainId').equals(chain.id).count(),
      ]);

      return {
        chainId: chain.id,
        title: chain.title,
        updatedAt: chain.updatedAt,
        activeBranchId: chain.activeBranchId,
        jumperCount,
        jumpCount,
        importReportCount,
      };
    }),
  );
}

export function createNativeSaveEnvelope(chains: NativeChainBundle[]): NativeSaveEnvelope {
  const validatedChains = chains.map((chain) => validateNativeChainBundle(chain));

  return validateNativeSaveEnvelope({
    formatVersion: NATIVE_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    chains: validatedChains,
    metadata: {
      exportMode: 'metadata-and-data',
    },
  });
}

export async function exportNativeSave(chainId?: string): Promise<NativeSaveEnvelope> {
  await ensureDatabaseOpen();
  if (chainId) {
    const bundle = await getChainBundle(chainId);

    if (!bundle) {
      throw new Error('Chain not found.');
    }

    return createNativeSaveEnvelope([bundle]);
  }

  const chains = await db.chains.toArray();
  const bundles = await Promise.all(chains.map((chain) => getChainBundle(chain.id)));
  return createNativeSaveEnvelope(bundles.filter((bundle): bundle is NativeChainBundle => Boolean(bundle)));
}

export async function exportBranchSave(chainId: string, branchId: string): Promise<NativeSaveEnvelope> {
  await ensureDatabaseOpen();
  const branchBundle = await getBranchBundle(chainId, branchId);

  if (!branchBundle) {
    throw new Error('Branch not found.');
  }

  return createNativeSaveEnvelope([branchBundle]);
}

export async function deleteChain(chainId: string): Promise<void> {
  await ensureDatabaseOpen();
  const chain = await db.chains.get(chainId);

  if (!chain) {
    throw new Error('Chain not found.');
  }

  await db.transaction(
    'rw',
    [
      db.chains,
      db.branches,
      db.jumpers,
      db.companions,
      db.jumps,
      db.jumpDocs,
      db.participations,
      db.companionParticipations,
      db.effects,
      db.bodymodProfiles,
      db.jumpRulesContexts,
      db.houseRuleProfiles,
      db.presetProfiles,
      db.snapshots,
      db.notes,
      db.attachments,
      db.importReports,
    ],
    async () => {
      await Promise.all([
        db.branches.where('chainId').equals(chainId).delete(),
        db.jumpers.where('chainId').equals(chainId).delete(),
        db.companions.where('chainId').equals(chainId).delete(),
        db.jumps.where('chainId').equals(chainId).delete(),
        db.jumpDocs.where('chainId').equals(chainId).delete(),
        db.participations.where('chainId').equals(chainId).delete(),
        db.companionParticipations.where('chainId').equals(chainId).delete(),
        db.effects.where('chainId').equals(chainId).delete(),
        db.bodymodProfiles.where('chainId').equals(chainId).delete(),
        db.jumpRulesContexts.where('chainId').equals(chainId).delete(),
        db.houseRuleProfiles.where('chainId').equals(chainId).delete(),
        db.presetProfiles.where('chainId').equals(chainId).delete(),
        db.snapshots.where('chainId').equals(chainId).delete(),
        db.notes.where('chainId').equals(chainId).delete(),
        db.attachments.where('chainId').equals(chainId).delete(),
        db.importReports.where('chainId').equals(chainId).delete(),
      ]);

      await db.chains.delete(chainId);
    },
  );
}

export async function importNativeSave(raw: unknown): Promise<NativeSaveEnvelope> {
  await ensureDatabaseOpen();
  const migratedEnvelope = migrateNativeSaveEnvelope(raw);
  const importedEnvelope = validateNativeSaveEnvelope({
    ...migratedEnvelope,
    chains: migratedEnvelope.chains.map((bundle) => cloneBundleWithRemappedIds(bundle)),
  });

  await writeBundles(importedEnvelope.chains);

  return importedEnvelope;
}

export async function switchActiveBranch(chainId: string, branchId: string): Promise<void> {
  await ensureDatabaseOpen();
  const bundle = await getChainBundle(chainId);

  if (!bundle) {
    throw new Error('Chain not found.');
  }

  const workspace = buildBranchWorkspace(bundle, branchId);

  if (!workspace.activeBranch) {
    throw new Error('Branch not found.');
  }

  await db.transaction('rw', [db.chains, db.branches], async () => {
    await db.chains.update(chainId, {
      activeBranchId: branchId,
      activeJumpId: workspace.currentJump?.id ?? null,
      updatedAt: new Date().toISOString(),
    });

    await Promise.all(
      bundle.branches.map((branch) =>
        db.branches.update(branch.id, {
          isActive: branch.id === branchId,
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
  });
}

export async function switchActiveJump(chainId: string, jumpId: string | null): Promise<void> {
  await ensureDatabaseOpen();
  await db.chains.update(chainId, {
    activeJumpId: jumpId,
    updatedAt: new Date().toISOString(),
  });
}

export async function createBranchFromJump(
  chainId: string,
  sourceBranchId: string,
  jumpId: string,
  title: string,
): Promise<Branch> {
  await ensureDatabaseOpen();
  const bundle = await getBranchBundle(chainId, sourceBranchId);
  const fullBundle = await getChainBundle(chainId);

  if (!bundle || !fullBundle) {
    throw new Error('Source branch not found.');
  }

  const trimmedBundle = filterBranchBundleToJump(bundle, jumpId);
  const clonedBranch = cloneBranchBundleToExistingChain(trimmedBundle, fullBundle.chain, {
    branchTitle: title.trim() || 'Forked Branch',
    sourceBranchId,
    forkedFromJumpId: jumpId,
    preferredActiveJumpId: jumpId,
  });
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [
      db.chains,
      db.branches,
      db.jumpers,
      db.companions,
      db.jumps,
      db.jumpDocs,
      db.participations,
      db.companionParticipations,
      db.effects,
      db.bodymodProfiles,
      db.jumpRulesContexts,
      db.houseRuleProfiles,
      db.presetProfiles,
      db.notes,
      db.attachments,
    ],
    async () => {
      await Promise.all(
        fullBundle.branches.map((branch) =>
          db.branches.update(branch.id, {
            isActive: false,
            updatedAt: now,
          }),
        ),
      );

      await db.branches.put(clonedBranch.branch);
      await db.jumpers.bulkPut(clonedBranch.jumpers);
      await db.companions.bulkPut(clonedBranch.companions);
      await db.jumps.bulkPut(clonedBranch.jumps);
      await db.jumpDocs.bulkPut(clonedBranch.jumpDocs);
      await db.participations.bulkPut(clonedBranch.participations);
      await db.companionParticipations.bulkPut(clonedBranch.companionParticipations);
      await db.effects.bulkPut(clonedBranch.effects);
      await db.bodymodProfiles.bulkPut(clonedBranch.bodymodProfiles);
      await db.jumpRulesContexts.bulkPut(clonedBranch.jumpRulesContexts);
      await db.houseRuleProfiles.bulkPut(clonedBranch.houseRuleProfiles);
      await db.presetProfiles.bulkPut(clonedBranch.presetProfiles);
      await db.notes.bulkPut(clonedBranch.notes);
      await db.attachments.bulkPut(clonedBranch.attachments);
      await db.chains.update(chainId, {
        activeBranchId: clonedBranch.branch.id,
        activeJumpId: clonedBranch.activeJumpId,
        updatedAt: now,
      });
    },
  );

  return clonedBranch.branch;
}

export async function createSnapshotForBranch(
  chainId: string,
  branchId: string,
  title: string,
  description: string,
): Promise<Snapshot> {
  await ensureDatabaseOpen();
  const branchBundle = await getBranchBundle(chainId, branchId);

  if (!branchBundle) {
    throw new Error('Branch not found.');
  }

  const payloadEnvelope = createNativeSaveEnvelope([
    validateNativeChainBundle({
      ...branchBundle,
      snapshots: [],
    }),
  ]);

  const now = new Date().toISOString();
  const snapshot: Snapshot = {
    id: createId('snapshot'),
    chainId,
    branchId,
    title: title.trim() || 'Snapshot',
    description,
    createdAt: now,
    updatedAt: now,
    createdFromJumpId: branchBundle.chain.activeJumpId ?? branchBundle.jumps[branchBundle.jumps.length - 1]?.id ?? null,
    payloadJson: JSON.stringify(payloadEnvelope),
    summary: {
      jumpCount: branchBundle.jumps.length,
      jumperCount: branchBundle.jumpers.length,
      effectCount: branchBundle.effects.length,
      noteCount: branchBundle.notes.length,
    },
  };

  await db.transaction('rw', [db.chains, db.snapshots], async () => {
    await db.snapshots.put(snapshot);
    await db.chains.update(chainId, {
      updatedAt: now,
    });
  });

  return snapshot;
}

export async function restoreSnapshotAsBranch(
  chainId: string,
  snapshotId: string,
  title?: string,
): Promise<Branch> {
  await ensureDatabaseOpen();
  const [chain, snapshot, bundle] = await Promise.all([
    db.chains.get(chainId),
    db.snapshots.get(snapshotId),
    getChainBundle(chainId),
  ]);

  if (!chain || !snapshot || !bundle) {
    throw new Error('Snapshot or chain not found.');
  }

  if (snapshot.chainId !== chainId) {
    throw new Error('Snapshot does not belong to the selected chain.');
  }

  const payload = migrateNativeSaveEnvelope(JSON.parse(snapshot.payloadJson));
  const sourceBundle = payload.chains[0];

  if (!sourceBundle) {
    throw new Error('Snapshot payload is empty.');
  }

  const clonedBranch = cloneBranchBundleToExistingChain(sourceBundle, chain, {
    branchTitle: title?.trim() || `Restored: ${snapshot.title}`,
    sourceBranchId: snapshot.branchId,
    forkedFromJumpId: snapshot.createdFromJumpId ?? null,
    preferredActiveJumpId: sourceBundle.chain.activeJumpId ?? null,
  });
  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    [
      db.chains,
      db.branches,
      db.jumpers,
      db.companions,
      db.jumps,
      db.jumpDocs,
      db.participations,
      db.companionParticipations,
      db.effects,
      db.bodymodProfiles,
      db.jumpRulesContexts,
      db.houseRuleProfiles,
      db.presetProfiles,
      db.notes,
      db.attachments,
    ],
    async () => {
      await Promise.all(
        bundle.branches.map((branch) =>
          db.branches.update(branch.id, {
            isActive: false,
            updatedAt: now,
          }),
        ),
      );

      await db.branches.put(clonedBranch.branch);
      await db.jumpers.bulkPut(clonedBranch.jumpers);
      await db.companions.bulkPut(clonedBranch.companions);
      await db.jumps.bulkPut(clonedBranch.jumps);
      await db.jumpDocs.bulkPut(clonedBranch.jumpDocs);
      await db.participations.bulkPut(clonedBranch.participations);
      await db.companionParticipations.bulkPut(clonedBranch.companionParticipations);
      await db.effects.bulkPut(clonedBranch.effects);
      await db.bodymodProfiles.bulkPut(clonedBranch.bodymodProfiles);
      await db.jumpRulesContexts.bulkPut(clonedBranch.jumpRulesContexts);
      await db.houseRuleProfiles.bulkPut(clonedBranch.houseRuleProfiles);
      await db.presetProfiles.bulkPut(clonedBranch.presetProfiles);
      await db.notes.bulkPut(clonedBranch.notes);
      await db.attachments.bulkPut(clonedBranch.attachments);
      await db.chains.update(chainId, {
        activeBranchId: clonedBranch.branch.id,
        activeJumpId: clonedBranch.activeJumpId,
        updatedAt: now,
      });
    },
  );

  return clonedBranch.branch;
}
