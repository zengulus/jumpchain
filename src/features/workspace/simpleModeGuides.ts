import type { BodymodProfile } from '../../domain/bodymod/types';
import type { Companion, Jumper } from '../../domain/jumper/types';
import type { Jump, WorkspaceParticipation } from '../../domain/jump/types';
import type { CosmicBackpackState } from '../cosmic-backpack/model';

export const SIMPLE_MODE_GUIDE_QUERY_PARAM = 'guide';
export const SIMPLE_MODE_GUIDE_DEFAULT_KEY = 'default';

export type SimpleModeSupplementDecision = 'undecided' | 'yes' | 'not-now' | 'skip-future';
export type SimpleModeGuidePromptState = 'pending' | 'accepted' | 'dismissed';
export type BranchGuideSurface = 'overview' | 'jumpers' | 'companions' | 'jumps' | 'participation' | 'bodymod';
export type ChainGuideSurface = 'cosmic-backpack' | 'chainwide-rules';
export type SimpleModeGuideSurface = BranchGuideSurface | ChainGuideSurface;
export type OverviewGuideStepId = 'jumper' | 'jump' | 'participation';
export type JumperGuideStepId = 'identity' | 'details';
export type CompanionGuideStepId = 'relationship' | 'continuity';
export type JumpGuideStepId = 'basics' | 'party' | 'purchases';
export type ParticipationGuideStepId = 'beginnings' | 'purchases' | 'wrap-up';
export type BodymodGuideStepId = 'create-profile' | 'tier-and-concept' | 'signature-package';
export type CosmicBackpackGuideStepId = 'free-options' | 'notes-and-appearance' | 'upgrades';
export type ChainwideRulesGuideStepId = 'enable-builder' | 'starting-point' | 'exchange-rate-and-notes' | 'drawbacks';

export interface SimpleModePageGuideState {
  currentStepId: string | null;
  acknowledgedStepIds: string[];
  dismissed: boolean;
  updatedAt: string | null;
}

export interface SimpleModeOverviewGuideState extends SimpleModePageGuideState {
  promptState: SimpleModeGuidePromptState;
  iconicDecision: SimpleModeSupplementDecision;
  cosmicBackpackDecision: SimpleModeSupplementDecision;
  lastSupplementPromptJumpCount: number;
}

export interface SimpleModeGuideScopeState {
  overview: Record<string, SimpleModeOverviewGuideState>;
  jumpers: Record<string, SimpleModePageGuideState>;
  companions: Record<string, SimpleModePageGuideState>;
  jumps: Record<string, SimpleModePageGuideState>;
  participation: Record<string, SimpleModePageGuideState>;
  bodymod: Record<string, SimpleModePageGuideState>;
}

export interface SimpleModeGuideRegistryState {
  branch: Record<string, SimpleModeGuideScopeState>;
  chain: Record<
    string,
    {
      'cosmic-backpack': Record<string, SimpleModePageGuideState>;
      'chainwide-rules': Record<string, SimpleModePageGuideState>;
    }
  >;
}

export function createBranchGuideScopeKey(chainId: string, branchId: string) {
  return `${chainId}:${branchId}`;
}

export function createParticipationGuideKey(jumpId: string, participantId: string) {
  return `${jumpId}:${participantId}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

function cleanStepIds(stepIds: unknown): string[] {
  return Array.isArray(stepIds)
    ? Array.from(
        new Set(
          stepIds
            .filter((stepId): stepId is string => typeof stepId === 'string')
            .map((stepId) => stepId.trim())
            .filter((stepId) => stepId.length > 0),
        ),
      )
    : [];
}

function readPromptState(value: unknown): SimpleModeGuidePromptState {
  return value === 'accepted' || value === 'dismissed' ? value : 'pending';
}

function readSupplementDecision(value: unknown): SimpleModeSupplementDecision {
  return value === 'yes' || value === 'not-now' || value === 'skip-future' ? value : 'undecided';
}

export function createSimpleModePageGuideState(
  initialStepId: string | null = null,
): SimpleModePageGuideState {
  return {
    currentStepId: initialStepId,
    acknowledgedStepIds: [],
    dismissed: false,
    updatedAt: null,
  };
}

export function createSimpleModeOverviewGuideState(): SimpleModeOverviewGuideState {
  return {
    ...createSimpleModePageGuideState('jumper'),
    promptState: 'pending',
    iconicDecision: 'undecided',
    cosmicBackpackDecision: 'undecided',
    lastSupplementPromptJumpCount: 0,
  };
}

export function createEmptySimpleModeGuideRegistryState(): SimpleModeGuideRegistryState {
  return {
    branch: {},
    chain: {},
  };
}

export function readSimpleModePageGuideState(
  value: unknown,
  fallbackStepId: string | null = null,
): SimpleModePageGuideState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return createSimpleModePageGuideState(fallbackStepId);
  }

  const record = value as Record<string, unknown>;

  return {
    currentStepId: typeof record.currentStepId === 'string' && record.currentStepId.trim().length > 0 ? record.currentStepId : fallbackStepId,
    acknowledgedStepIds: cleanStepIds(record.acknowledgedStepIds),
    dismissed: record.dismissed === true,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt.trim().length > 0 ? record.updatedAt : null,
  };
}

export function readSimpleModeOverviewGuideState(
  value: unknown,
): SimpleModeOverviewGuideState {
  const base = readSimpleModePageGuideState(value, 'jumper');

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ...createSimpleModeOverviewGuideState(),
      ...base,
    };
  }

  const record = value as Record<string, unknown>;

  return {
    ...base,
    promptState: readPromptState(record.promptState),
    iconicDecision: readSupplementDecision(record.iconicDecision),
    cosmicBackpackDecision: readSupplementDecision(record.cosmicBackpackDecision),
    lastSupplementPromptJumpCount:
      typeof record.lastSupplementPromptJumpCount === 'number' && Number.isFinite(record.lastSupplementPromptJumpCount)
        ? Math.max(0, Math.trunc(record.lastSupplementPromptJumpCount))
        : 0,
  };
}

export function readGuideRequested(searchParams: URLSearchParams) {
  return searchParams.get(SIMPLE_MODE_GUIDE_QUERY_PARAM) === '1';
}

export function updateGuideSearchParams(
  currentParams: URLSearchParams,
  requested: boolean,
) {
  const nextParams = new URLSearchParams(currentParams);

  if (requested) {
    nextParams.set(SIMPLE_MODE_GUIDE_QUERY_PARAM, '1');
  } else {
    nextParams.delete(SIMPLE_MODE_GUIDE_QUERY_PARAM);
  }

  return nextParams;
}

export function getFirstIncompleteGuideStep(
  stepIds: readonly string[],
  state: SimpleModePageGuideState,
  isComplete: (stepId: string) => boolean,
) {
  const requestedCurrentStepId =
    state.currentStepId && stepIds.includes(state.currentStepId) && !isComplete(state.currentStepId)
      ? state.currentStepId
      : null;

  if (requestedCurrentStepId) {
    return requestedCurrentStepId;
  }

  return stepIds.find((stepId) => !isComplete(stepId)) ?? stepIds[stepIds.length - 1] ?? null;
}

export function markGuideStepAcknowledged<TState extends SimpleModePageGuideState>(
  state: TState,
  stepId: string,
): TState {
  return {
    ...state,
    acknowledgedStepIds: Array.from(new Set([...state.acknowledgedStepIds, stepId])),
    updatedAt: createTimestamp(),
  } as TState;
}

export function setGuideDismissed<TState extends SimpleModePageGuideState>(
  state: TState,
  dismissed: boolean,
): TState {
  return {
    ...state,
    dismissed,
    updatedAt: createTimestamp(),
  } as TState;
}

export function setGuideCurrentStep<TState extends SimpleModePageGuideState>(
  state: TState,
  stepId: string | null,
): TState {
  return {
    ...state,
    currentStepId: stepId,
    dismissed: false,
    updatedAt: createTimestamp(),
  } as TState;
}

export function isJumperGuideStepComplete(
  jumper: Jumper | null | undefined,
  guideState: SimpleModePageGuideState,
  stepId: JumperGuideStepId,
) {
  if (!jumper) {
    return false;
  }

  if (guideState.acknowledgedStepIds.includes(stepId)) {
    return true;
  }

  if (stepId === 'identity') {
    return jumper.name.trim().length > 0 && jumper.name !== 'New Jumper' && jumper.notes.trim().length > 0;
  }

  return false;
}

export function isCompanionGuideStepComplete(
  companion: Companion | null | undefined,
  guideState: SimpleModePageGuideState,
  stepId: CompanionGuideStepId,
) {
  if (!companion) {
    return false;
  }

  if (guideState.acknowledgedStepIds.includes(stepId)) {
    return true;
  }

  if (stepId === 'relationship') {
    return companion.name.trim().length > 0 && companion.name !== 'New Companion';
  }

  return false;
}

export function isJumpGuideStepComplete(
  _jump: Jump | null | undefined,
  guideState: SimpleModePageGuideState,
  stepId: JumpGuideStepId,
) {
  return guideState.acknowledgedStepIds.includes(stepId);
}

export function isParticipationGuideStepComplete(
  participation: WorkspaceParticipation | null | undefined,
  guideState: SimpleModePageGuideState,
  stepId: ParticipationGuideStepId,
) {
  if (!participation) {
    return false;
  }

  if (guideState.acknowledgedStepIds.includes(stepId)) {
    return true;
  }

  if (stepId === 'beginnings') {
    return Object.keys(participation.origins).length > 0;
  }

  return false;
}

export function isBodymodGuideStepComplete(
  profile: BodymodProfile | null | undefined,
  guideState: SimpleModePageGuideState,
  stepId: BodymodGuideStepId,
) {
  if (stepId === 'create-profile') {
    return Boolean(profile);
  }

  if (!profile) {
    return false;
  }

  if (guideState.acknowledgedStepIds.includes(stepId)) {
    return true;
  }

  if (stepId === 'tier-and-concept') {
    return profile.summary.trim().length > 0 || profile.benchmarkNotes.trim().length > 0;
  }

  return false;
}

export function isCosmicBackpackGuideStepComplete(
  state: CosmicBackpackState,
  guideState: SimpleModePageGuideState,
  stepId: CosmicBackpackGuideStepId,
) {
  if (guideState.acknowledgedStepIds.includes(stepId)) {
    return true;
  }

  if (stepId === 'free-options') {
    return state.selectedOptionIds.length > 0;
  }

  if (stepId === 'notes-and-appearance') {
    return state.notes.trim().length > 0 || state.appearanceNotes.trim().length > 0 || state.containerForm.trim().length > 0;
  }

  return false;
}
