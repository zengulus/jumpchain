import type { ChainScopedRecord, JsonMap, JumpStatus, JumpType, ParticipationStatus } from '../common';
import type { CurrencyExchangeRecord, ParticipationSelection } from './selection';

export interface JumpDuration {
  days: number;
  months: number;
  years: number;
}

export interface Jump extends ChainScopedRecord {
  title: string;
  orderIndex: number;
  status: JumpStatus;
  jumpType: JumpType;
  duration: JumpDuration;
  participantJumperIds: string[];
  jumpDocIds: string[];
  sourceJumpId?: number | null;
  importSourceMetadata: JsonMap;
}

export interface ParticipationRecord extends ChainScopedRecord {
  jumpId: string;
  status: ParticipationStatus;
  notes: string;
  purchases: ParticipationSelection[];
  drawbacks: ParticipationSelection[];
  retainedDrawbacks: ParticipationSelection[];
  origins: Record<string, unknown>;
  budgets: Record<string, number>;
  stipends: Record<string, Record<string, number>>;
  narratives: {
    accomplishments: string;
    challenges: string;
    goals: string;
  };
  altForms: unknown[];
  bankDeposit: number;
  currencyExchanges: CurrencyExchangeRecord[];
  supplementPurchases: Record<string, unknown>;
  supplementInvestments: Record<string, unknown>;
  drawbackOverrides: Record<string, unknown>;
  importSourceMetadata: JsonMap;
}

export interface JumperParticipation extends ParticipationRecord {
  jumperId: string;
}

export interface CompanionParticipation extends ParticipationRecord {
  companionId: string;
}

export interface WorkspaceParticipation extends ParticipationRecord {
  participantId: string;
  participantKind: 'jumper' | 'companion';
}
