import type { AttachmentRef } from '../attachments/types';
import type { BodymodProfile } from '../bodymod/types';
import type { Branch } from '../branch/types';
import type { Chain } from './types';
import type { Effect } from '../effects/types';
import type { ImportReport } from '../import/types';
import type { Companion, Jumper } from '../jumper/types';
import type { Jump, JumperParticipation } from '../jump/types';
import type { Note } from '../notes/types';
import type { PresetProfile } from '../presets/types';
import type { HouseRuleProfile, JumpRulesContext } from '../rules/types';
import type { NativeChainBundle } from '../save';
import type { Snapshot } from '../snapshot/types';
import type { AccessMode } from '../common';

export interface BranchWorkspace {
  chain: Chain;
  branches: Branch[];
  activeBranch: Branch | null;
  currentJump: Jump | null;
  jumpers: Jumper[];
  companions: Companion[];
  jumps: Jump[];
  participations: JumperParticipation[];
  effects: Effect[];
  bodymodProfiles: BodymodProfile[];
  jumpRulesContexts: JumpRulesContext[];
  houseRuleProfiles: HouseRuleProfile[];
  presetProfiles: PresetProfile[];
  snapshots: Snapshot[];
  notes: Note[];
  attachments: AttachmentRef[];
  importReports: ImportReport[];
}

export interface EffectiveCurrentJumpState {
  selectedJumpId: string | null;
  selectedBranchId: string | null;
  gauntlet: boolean;
  effectiveAccessModes: {
    warehouseAccess: AccessMode;
    powerAccess: AccessMode;
    itemAccess: AccessMode;
    altFormAccess: AccessMode;
    supplementAccess: AccessMode;
  };
  currentRulesContext: JumpRulesContext | null;
  currentJump: Jump | null;
  contributingEffects: Effect[];
}

interface RuleEffectOverrides {
  gauntlet?: boolean;
  warehouseAccess?: AccessMode;
  powerAccess?: AccessMode;
  itemAccess?: AccessMode;
  altFormAccess?: AccessMode;
  supplementAccess?: AccessMode;
}

function sortJumps(jumps: Jump[]) {
  return jumps.slice().sort((left, right) => left.orderIndex - right.orderIndex);
}

export function getActiveBranch(chain: Chain, branches: Branch[]): Branch | null {
  return branches.find((branch) => branch.id === chain.activeBranchId) ?? branches.find((branch) => branch.isActive) ?? branches[0] ?? null;
}

export function getCurrentJump(chain: Chain, branchJumps: Jump[]): Jump | null {
  const orderedJumps = sortJumps(branchJumps);

  if (orderedJumps.length === 0) {
    return null;
  }

  if (chain.activeJumpId) {
    return orderedJumps.find((jump) => jump.id === chain.activeJumpId) ?? null;
  }

  return orderedJumps.find((jump) => jump.status === 'current') ?? orderedJumps[orderedJumps.length - 1] ?? null;
}

export function buildBranchWorkspace(bundle: NativeChainBundle, activeBranchId: string): BranchWorkspace {
  const activeBranch = bundle.branches.find((branch) => branch.id === activeBranchId) ?? getActiveBranch(bundle.chain, bundle.branches);
  const branchId = activeBranch?.id ?? activeBranchId;

  const jumps = sortJumps(bundle.jumps.filter((jump) => jump.branchId === branchId));
  const currentJump = getCurrentJump(
    {
      ...bundle.chain,
      activeJumpId: jumps.some((jump) => jump.id === bundle.chain.activeJumpId) ? bundle.chain.activeJumpId : null,
    },
    jumps,
  );

  return {
    chain: bundle.chain,
    branches: bundle.branches,
    activeBranch: activeBranch ?? null,
    currentJump,
    jumpers: bundle.jumpers.filter((jumper) => jumper.branchId === branchId),
    companions: bundle.companions.filter((companion) => companion.branchId === branchId),
    jumps,
    participations: bundle.participations.filter((participation) => participation.branchId === branchId),
    effects: bundle.effects.filter((effect) => effect.branchId === branchId),
    bodymodProfiles: bundle.bodymodProfiles.filter((profile) => profile.branchId === branchId),
    jumpRulesContexts: bundle.jumpRulesContexts.filter((context) => context.branchId === branchId),
    houseRuleProfiles: bundle.houseRuleProfiles.filter((profile) => profile.branchId === branchId),
    presetProfiles: bundle.presetProfiles.filter((profile) => profile.branchId === branchId),
    snapshots: bundle.snapshots.filter((snapshot) => snapshot.branchId === branchId),
    notes: bundle.notes.filter((note) => note.branchId === branchId),
    attachments: bundle.attachments.filter((attachment) => attachment.branchId === branchId),
    importReports: bundle.importReports,
  };
}

function extractRuleEffectOverrides(effect: Effect): RuleEffectOverrides {
  if (effect.category !== 'rule') {
    return {};
  }

  const metadata = effect.importSourceMetadata as Record<string, unknown>;
  const accessOverrides =
    typeof metadata.accessOverrides === 'object' && metadata.accessOverrides !== null
      ? (metadata.accessOverrides as Record<string, unknown>)
      : metadata;

  const nextOverrides: RuleEffectOverrides = {};

  if (typeof accessOverrides.gauntlet === 'boolean') {
    nextOverrides.gauntlet = accessOverrides.gauntlet;
  }

  for (const key of ['warehouseAccess', 'powerAccess', 'itemAccess', 'altFormAccess', 'supplementAccess'] as const) {
    const value = accessOverrides[key];

    if (value === 'manual' || value === 'limited' || value === 'full' || value === 'locked') {
      nextOverrides[key] = value;
    }
  }

  return nextOverrides;
}

export function getEffectiveCurrentJumpState(workspace: BranchWorkspace): EffectiveCurrentJumpState {
  const currentJump = workspace.currentJump;
  const currentRulesContext =
    workspace.jumpRulesContexts.find((context) => context.jumpId === currentJump?.id) ?? null;

  const contributingEffects = workspace.effects.filter((effect) => {
    if (effect.state !== 'active') {
      return false;
    }

    if (effect.scopeType === 'chain') {
      return true;
    }

    return currentJump !== null && effect.ownerEntityType === 'jump' && effect.ownerEntityId === currentJump.id;
  });

  const effectiveAccessModes: EffectiveCurrentJumpState['effectiveAccessModes'] = {
    warehouseAccess: currentRulesContext?.warehouseAccess ?? 'manual',
    powerAccess: currentRulesContext?.powerAccess ?? 'manual',
    itemAccess: currentRulesContext?.itemAccess ?? 'manual',
    altFormAccess: currentRulesContext?.altFormAccess ?? (workspace.chain.chainSettings.altForms ? 'full' : 'locked'),
    supplementAccess: currentRulesContext?.supplementAccess ?? 'manual',
  };

  let gauntlet = currentRulesContext?.gauntlet ?? currentJump?.jumpType === 'gauntlet' ?? false;

  for (const effect of contributingEffects) {
    const overrides = extractRuleEffectOverrides(effect);

    gauntlet = overrides.gauntlet ?? gauntlet;
    effectiveAccessModes.warehouseAccess = overrides.warehouseAccess ?? effectiveAccessModes.warehouseAccess;
    effectiveAccessModes.powerAccess = overrides.powerAccess ?? effectiveAccessModes.powerAccess;
    effectiveAccessModes.itemAccess = overrides.itemAccess ?? effectiveAccessModes.itemAccess;
    effectiveAccessModes.altFormAccess = overrides.altFormAccess ?? effectiveAccessModes.altFormAccess;
    effectiveAccessModes.supplementAccess = overrides.supplementAccess ?? effectiveAccessModes.supplementAccess;
  }

  return {
    selectedJumpId: currentJump?.id ?? null,
    selectedBranchId: workspace.activeBranch?.id ?? null,
    gauntlet,
    effectiveAccessModes,
    currentRulesContext,
    currentJump,
    contributingEffects,
  };
}
