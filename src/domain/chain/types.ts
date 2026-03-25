import type { BaseRecord, JsonMap, SourceMetadata } from '../common';

export interface ChainSettings {
  chainDrawbacksForCompanions: boolean;
  chainDrawbacksSupplements: boolean;
  narratives: 'enabled' | 'disabled';
  altForms: boolean;
}

export interface BankSettings {
  enabled: boolean;
  maxDeposit: number;
  depositRatio: number;
  interestRate: number;
}

export interface Chain extends BaseRecord {
  title: string;
  schemaVersion: number;
  formatVersion: string;
  activeBranchId: string;
  activeJumpId?: string | null;
  sourceMetadata?: SourceMetadata;
  chainSettings: ChainSettings;
  bankSettings: BankSettings;
  importSourceMetadata: JsonMap;
}
