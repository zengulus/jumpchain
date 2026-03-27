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
import {
  createDefaultRulesModuleSettings,
  getRulesModuleHouseRuleProfile,
  parseRulesModuleSettings,
  type RulesModuleSettings,
} from '../rules/customization';
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
  branchRulesProfile: HouseRuleProfile | null;
  branchRulesSettings: RulesModuleSettings;
  currentRulesSource: 'jump-context' | 'branch-defaults' | 'chain-defaults';
  currentJump: Jump | null;
  contributingEffects: Effect[];
}

export interface ChainDrawbackBudgetContribution {
  effect: Effect;
  budgetGrants: Record<string, number>;
}

export interface ParticipationDrawbackBudgetContribution {
  title: string;
  kind: 'drawback' | 'retained-drawback';
  budgetGrants: Record<string, number>;
}

export interface EffectiveParticipationBudgetState {
  baseBudgets: Record<string, number>;
  chainDrawbackBudgetGrants: Record<string, number>;
  participationDrawbackBudgetGrants: Record<string, number>;
  effectiveBudgets: Record<string, number>;
  contributingChainDrawbacks: ChainDrawbackBudgetContribution[];
  contributingParticipationDrawbacks: ParticipationDrawbackBudgetContribution[];
}

interface RuleEffectOverrides {
  gauntlet?: boolean;
  warehouseAccess?: AccessMode;
  powerAccess?: AccessMode;
  itemAccess?: AccessMode;
  altFormAccess?: AccessMode;
  supplementAccess?: AccessMode;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseOptionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseOptionalIdentifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function parseExplicitBudgetGrants(metadata: Record<string, unknown>) {
  const rawBudgetGrants = metadata.budgetGrants;

  if (typeof rawBudgetGrants !== 'object' || rawBudgetGrants === null || Array.isArray(rawBudgetGrants)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(rawBudgetGrants).filter(([, amount]) => typeof amount === 'number' && Number.isFinite(amount)),
  ) as Record<string, number>;
}

function sumBudgetRecords(records: Array<Record<string, number>>) {
  const combined: Record<string, number> = {};

  for (const record of records) {
    for (const [currencyKey, amount] of Object.entries(record)) {
      combined[currencyKey] = (combined[currencyKey] ?? 0) + amount;
    }
  }

  return combined;
}

function roundBudgetAmount(value: number) {
  return Number(value.toFixed(2));
}

function isChoicePointCurrencyKey(currencyKey: string, importedCurrencyDefinitions: Record<string, unknown>) {
  const definition = asRecord(importedCurrencyDefinitions[currencyKey]);
  const name = typeof definition.name === 'string' ? definition.name : '';
  const abbreviation = typeof definition.abbrev === 'string' ? definition.abbrev : '';
  const combined = `${currencyKey} ${name} ${abbreviation}`.trim().toLowerCase();

  if (
    combined.includes('choice point') ||
    combined.includes('choice points') ||
    abbreviation.trim().toLowerCase() === 'cp' ||
    combined === 'cp'
  ) {
    return true;
  }

  return Object.keys(importedCurrencyDefinitions).length === 0 && currencyKey === '0';
}

function applyCompanionBudgetShare(budgetRecord: Record<string, number>, importedCurrencyDefinitions: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(budgetRecord).map(([currencyKey, amount]) => [
      currencyKey,
      isChoicePointCurrencyKey(currencyKey, importedCurrencyDefinitions) ? roundBudgetAmount(amount * 0.8) : amount,
    ]),
  );
}

function getSelectionBudgetGrants(selection: unknown) {
  const record = asRecord(selection);
  const importedValue = parseOptionalFiniteNumber(record.value);

  if (importedValue === null || record.free === true) {
    return {};
  }

  return {
    [parseOptionalIdentifier(record.currency) ?? '0']: importedValue,
  };
}

function getSelectionTitle(selection: unknown, fallbackLabel: string) {
  const record = asRecord(selection);
  const title = record.name ?? record.summary;

  if (typeof title === 'string' && title.trim().length > 0) {
    return title;
  }

  const sourcePurchaseId = parseOptionalFiniteNumber(record.sourcePurchaseId);

  return sourcePurchaseId !== null ? `${fallbackLabel} #${sourcePurchaseId}` : fallbackLabel;
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

export function getChainDrawbackBudgetGrants(effect: Effect): Record<string, number> {
  if (effect.category !== 'drawback') {
    return {};
  }

  const metadata = effect.importSourceMetadata as Record<string, unknown>;
  const explicitBudgetGrants = parseExplicitBudgetGrants(metadata);

  if (explicitBudgetGrants !== null) {
    return explicitBudgetGrants;
  }

  const explicitChoicePointGrant = parseOptionalFiniteNumber(metadata.cpGrant);

  if (explicitChoicePointGrant !== null) {
    return {
      '0': explicitChoicePointGrant,
    };
  }

  const importedValue = parseOptionalFiniteNumber(metadata.value);

  if (importedValue !== null) {
    const importedCurrency = parseOptionalFiniteNumber(metadata.currency);

    return {
      [String(importedCurrency ?? 0)]: importedValue,
    };
  }

  return {};
}

export function getActiveChainDrawbackBudgetContributions(workspace: BranchWorkspace): ChainDrawbackBudgetContribution[] {
  return workspace.effects
    .filter(
      (effect) =>
        effect.state === 'active' &&
        effect.category === 'drawback' &&
        effect.scopeType === 'chain' &&
        effect.ownerEntityType === 'chain' &&
        effect.ownerEntityId === workspace.chain.id,
    )
    .map((effect) => ({
      effect,
      budgetGrants: getChainDrawbackBudgetGrants(effect),
    }))
    .filter(({ budgetGrants }) => Object.keys(budgetGrants).length > 0);
}

export function getEffectiveParticipationBudgetState(
  workspace: BranchWorkspace,
  participation: Pick<JumperParticipation, 'budgets' | 'importSourceMetadata' | 'drawbacks' | 'retainedDrawbacks' | 'jumperId'> | null,
): EffectiveParticipationBudgetState {
  const importedCurrencyDefinitions = asRecord(asRecord(participation?.importSourceMetadata).currencies);
  const importedBaseBudgets = Object.fromEntries(
    Object.entries(importedCurrencyDefinitions)
      .map(([currencyKey, value]) => [currencyKey, parseOptionalFiniteNumber(asRecord(value).budget)])
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );
  const fallbackBaseBudgets: Record<string, number> =
    participation && Object.keys(importedBaseBudgets).length === 0 && Object.keys(participation.budgets).length === 0
      ? { '0': 1000 }
      : {};
  const isCompanionParticipation =
    participation !== null &&
    workspace.companions.some((companion) => companion.id === participation.jumperId) &&
    !workspace.jumpers.some((jumper) => jumper.id === participation.jumperId);
  const inheritedBaseBudgets = isCompanionParticipation
    ? applyCompanionBudgetShare(
        {
          ...fallbackBaseBudgets,
          ...importedBaseBudgets,
        },
        importedCurrencyDefinitions,
      )
    : {
        ...fallbackBaseBudgets,
        ...importedBaseBudgets,
      };
  const baseBudgets = participation
    ? {
        ...inheritedBaseBudgets,
        ...participation.budgets,
      }
    : {};
  const contributingChainDrawbacks = getActiveChainDrawbackBudgetContributions(workspace);
  const contributingParticipationDrawbacks = participation
    ? [
        ...participation.drawbacks.map((selection, index) => ({
          title: getSelectionTitle(selection, `Drawback ${index + 1}`),
          kind: 'drawback' as const,
          budgetGrants: getSelectionBudgetGrants(selection),
        })),
        ...participation.retainedDrawbacks.map((selection, index) => ({
          title: getSelectionTitle(selection, `Retained drawback ${index + 1}`),
          kind: 'retained-drawback' as const,
          budgetGrants: getSelectionBudgetGrants(selection),
        })),
      ].filter(({ budgetGrants }) => Object.keys(budgetGrants).length > 0)
    : [];
  const chainDrawbackBudgetGrants = isCompanionParticipation
    ? applyCompanionBudgetShare(
        sumBudgetRecords(contributingChainDrawbacks.map((contribution) => contribution.budgetGrants)),
        importedCurrencyDefinitions,
      )
    : sumBudgetRecords(contributingChainDrawbacks.map((contribution) => contribution.budgetGrants));
  const participationDrawbackBudgetGrants = sumBudgetRecords(
    contributingParticipationDrawbacks.map((contribution) => contribution.budgetGrants),
  );
  const currencyKeys = new Set([
    ...Object.keys(baseBudgets),
    ...Object.keys(chainDrawbackBudgetGrants),
    ...Object.keys(participationDrawbackBudgetGrants),
  ]);
  const effectiveBudgets = Object.fromEntries(
    Array.from(currencyKeys).map((currencyKey) => [
      currencyKey,
      (baseBudgets[currencyKey] ?? 0) +
        (chainDrawbackBudgetGrants[currencyKey] ?? 0) +
        (participationDrawbackBudgetGrants[currencyKey] ?? 0),
    ]),
  );

  return {
    baseBudgets,
    chainDrawbackBudgetGrants,
    participationDrawbackBudgetGrants,
    effectiveBudgets,
    contributingChainDrawbacks,
    contributingParticipationDrawbacks,
  };
}

export function getEffectiveCurrentJumpState(workspace: BranchWorkspace): EffectiveCurrentJumpState {
  const currentJump = workspace.currentJump;
  const currentRulesContext =
    workspace.jumpRulesContexts.find((context) => context.jumpId === currentJump?.id) ?? null;
  const branchRulesProfile = getRulesModuleHouseRuleProfile(workspace.houseRuleProfiles);
  const branchRulesSettings = branchRulesProfile
    ? parseRulesModuleSettings(branchRulesProfile.settings, workspace.chain.chainSettings.altForms)
    : createDefaultRulesModuleSettings(workspace.chain.chainSettings.altForms);
  const currentRulesSource = currentRulesContext
    ? 'jump-context'
    : branchRulesProfile
      ? 'branch-defaults'
      : 'chain-defaults';

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
    warehouseAccess: currentRulesContext?.warehouseAccess ?? branchRulesSettings.defaults.warehouseAccess,
    powerAccess: currentRulesContext?.powerAccess ?? branchRulesSettings.defaults.powerAccess,
    itemAccess: currentRulesContext?.itemAccess ?? branchRulesSettings.defaults.itemAccess,
    altFormAccess: currentRulesContext?.altFormAccess ?? branchRulesSettings.defaults.altFormAccess,
    supplementAccess: currentRulesContext?.supplementAccess ?? branchRulesSettings.defaults.supplementAccess,
  };

  let gauntlet = currentRulesContext?.gauntlet ?? (
    branchRulesProfile ? branchRulesSettings.defaults.gauntlet : currentJump?.jumpType === 'gauntlet'
  );

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
    branchRulesProfile,
    branchRulesSettings,
    currentRulesSource,
    currentJump,
    contributingEffects,
  };
}
