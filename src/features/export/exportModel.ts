import type { BranchWorkspace } from '../../domain/chain/selectors';
import type { WorkspaceParticipation } from '../../domain/jump/types';
import type { ParticipationSelection } from '../../domain/jump/selection';

export type ExportScope =
  | { kind: 'branch' }
  | { kind: 'participant'; participantId: string }
  | { kind: 'jump'; jumpId: string };

export interface ExportSelection {
  title: string;
  description: string;
  cost: string;
  tags: string[];
  rewards: string[];
}

export interface ExportParticipation {
  participantName: string;
  participantKind: WorkspaceParticipation['participantKind'];
  origins: string[];
  purchases: ExportSelection[];
  drawbacks: ExportSelection[];
  retainedDrawbacks: ExportSelection[];
  notes: string;
  narratives: string[];
}

export interface ExportJump {
  title: string;
  duration: string;
  participations: ExportParticipation[];
}

export interface ExportIR {
  chainTitle: string;
  branchTitle: string;
  generatedAt: string;
  scopeLabel: string;
  jumps: ExportJump[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getCurrencyDefinitions(participation: WorkspaceParticipation) {
  return asRecord(participation.importSourceMetadata).currencies as Record<string, { name?: string; abbrev?: string }> | undefined;
}

function formatCurrency(currencyKey: string, definitions: ReturnType<typeof getCurrencyDefinitions>) {
  const definition = definitions?.[currencyKey];
  return definition?.abbrev?.trim() || definition?.name?.trim() || (currencyKey === '0' ? 'CP' : currencyKey);
}

function formatCost(selection: ParticipationSelection, participation: WorkspaceParticipation) {
  if (selection.free || selection.costModifier === 'free') {
    return 'Free';
  }

  return `${formatNumber(selection.purchaseValue)} ${formatCurrency(selection.currencyKey, getCurrencyDefinitions(participation))}`;
}

function formatDuration(duration: { years: number; months: number; days: number }) {
  const parts = [
    duration.years ? `${duration.years} year${duration.years === 1 ? '' : 's'}` : null,
    duration.months ? `${duration.months} month${duration.months === 1 ? '' : 's'}` : null,
    duration.days ? `${duration.days} day${duration.days === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : '0 days';
}

function getParticipantName(workspace: BranchWorkspace, participation: WorkspaceParticipation) {
  const records = participation.participantKind === 'companion' ? workspace.companions : workspace.jumpers;
  return records.find((record) => record.id === participation.participantId)?.name ?? 'Participant';
}

function getOriginLines(participation: WorkspaceParticipation) {
  return Object.entries(participation.origins).flatMap(([key, value]) => {
    const record = asRecord(value);
    const label = typeof record.label === 'string' ? record.label : key;
    const summary = typeof record.summary === 'string' ? record.summary : '';
    const description = typeof record.description === 'string' ? record.description : '';

    if (!summary && !description) {
      return [];
    }

    return [`${label}: ${[summary, description].filter(Boolean).join(' - ')}`];
  });
}

function getNarrativeLines(participation: WorkspaceParticipation) {
  return [
    ['Accomplishments', participation.narratives.accomplishments],
    ['Challenges', participation.narratives.challenges],
    ['Goals', participation.narratives.goals],
  ].flatMap(([label, text]) => (text.trim() ? [`${label}: ${text}`] : []));
}

function toExportSelection(selection: ParticipationSelection, participation: WorkspaceParticipation): ExportSelection {
  return {
    title: selection.title || selection.summary || 'Untitled selection',
    description: selection.description,
    cost: formatCost(selection, participation),
    tags: selection.tags,
    rewards: (selection.scenarioRewards ?? []).map((reward) => {
      const amountLabel = [reward.amount !== undefined ? formatNumber(reward.amount) : null, reward.currencyKey]
        .filter(Boolean)
        .join(' ');

      return reward.note ?? reward.title ?? (amountLabel || reward.type);
    }),
  };
}

function includeParticipation(scope: ExportScope, participation: WorkspaceParticipation) {
  return scope.kind !== 'participant' || participation.participantId === scope.participantId;
}

function includeJump(scope: ExportScope, jumpId: string) {
  return scope.kind !== 'jump' || scope.jumpId === jumpId;
}

export function buildExportIR(workspace: BranchWorkspace, scope: ExportScope): ExportIR {
  const jumps = workspace.jumps
    .filter((jump) => includeJump(scope, jump.id))
    .map<ExportJump>((jump) => {
      const participations = workspace.participations
        .filter((participation) => participation.jumpId === jump.id && includeParticipation(scope, participation))
        .map<ExportParticipation>((participation) => ({
          participantName: getParticipantName(workspace, participation),
          participantKind: participation.participantKind,
          origins: getOriginLines(participation),
          purchases: participation.purchases.map((selection) => toExportSelection(selection, participation)),
          drawbacks: participation.drawbacks.map((selection) => toExportSelection(selection, participation)),
          retainedDrawbacks: participation.retainedDrawbacks.map((selection) => toExportSelection(selection, participation)),
          notes: participation.notes,
          narratives: getNarrativeLines(participation),
        }));

      return {
        title: jump.title,
        duration: formatDuration(jump.duration),
        participations,
      };
    })
    .filter((jump) => jump.participations.length > 0 || scope.kind !== 'participant');

  return {
    chainTitle: workspace.chain.title,
    branchTitle: workspace.activeBranch?.title ?? 'Branch',
    generatedAt: new Date().toISOString(),
    scopeLabel:
      scope.kind === 'branch'
        ? 'Active branch'
        : scope.kind === 'jump'
          ? workspace.jumps.find((jump) => jump.id === scope.jumpId)?.title ?? 'Jump'
          : [...workspace.jumpers, ...workspace.companions].find((record) => record.id === scope.participantId)?.name ?? 'Participant',
    jumps,
  };
}
