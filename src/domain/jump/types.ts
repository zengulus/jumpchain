import type { ChainScopedRecord, JsonMap, JumpStatus, JumpType, ParticipationStatus } from '../common';

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
  sourceJumpId?: number | null;
  importSourceMetadata: JsonMap;
}

export interface JumperParticipation extends ChainScopedRecord {
  jumpId: string;
  jumperId: string;
  status: ParticipationStatus;
  notes: string;
  purchases: unknown[];
  drawbacks: unknown[];
  retainedDrawbacks: unknown[];
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
  currencyExchanges: unknown[];
  supplementPurchases: Record<string, unknown>;
  supplementInvestments: Record<string, unknown>;
  drawbackOverrides: Record<string, unknown>;
  importSourceMetadata: JsonMap;
}
