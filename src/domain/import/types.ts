import type {
  ImportMode,
  ImportStatus,
  ImportSummary,
  ImportWarning,
  JsonMap,
  SourceType,
  UnresolvedMapping,
} from '../common';
import type { BodymodProfile } from '../bodymod/types';
import type { Chain } from '../chain/types';
import type { Jumper, Companion } from '../jumper/types';
import type { Jump, JumperParticipation } from '../jump/types';
import type { NativeChainBundle } from '../save';

export interface SourceDetectionResult {
  sourceType: SourceType;
  sourceVersion?: string;
  isSupported: boolean;
  reasons: string[];
}

export interface ChainMakerV2CleanerChange {
  path: string;
  reason: string;
  before?: unknown;
  after?: unknown;
}

export interface ChainMakerV2CleanerResult {
  cleanedRaw: unknown;
  changes: ChainMakerV2CleanerChange[];
}

export interface ImportReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  chainId?: string | null;
  sourceType: SourceType;
  sourceVersion: string;
  importMode: ImportMode;
  status: ImportStatus;
  summary: ImportSummary;
  warnings: ImportWarning[];
  unresolvedMappings: UnresolvedMapping[];
  preservedSourceSummary: JsonMap;
}

export interface ChainMakerV2CharacterPersonality {
  personality: string;
  motivation: string;
  likes: string;
  dislikes: string;
  quirks: string;
}

export interface ChainMakerV2CharacterBackground {
  summary: string;
  description: string;
}

export interface ChainMakerV2Character {
  _id: number;
  name: string;
  gender: string;
  originalAge?: number | string;
  personality: ChainMakerV2CharacterPersonality;
  background: ChainMakerV2CharacterBackground;
  notes: string;
  _primary: boolean;
  originalForm?: number;
  perkCount?: number;
  itemCount?: number;
  [key: string]: unknown;
}

export interface ChainMakerV2Duration {
  days: number;
  months: number;
  years: number;
}

export interface ChainMakerV2OriginSelection {
  cost: number;
  summary: string;
  description: string;
  [key: string]: unknown;
}

export interface ChainMakerV2Narrative {
  accomplishments: string;
  challenges: string;
  goals: string;
  [key: string]: unknown;
}

export interface ChainMakerV2Jump {
  _id: number;
  name: string;
  characters: number[];
  duration: ChainMakerV2Duration;
  notes: Record<string, string>;
  bankDeposits: Record<string, number>;
  currencyExchanges: Record<string, unknown[]>;
  supplementPurchases: Record<string, Record<string, unknown>>;
  supplementInvestments: Record<string, Record<string, unknown>>;
  useSupplements: boolean;
  originCategories: Record<string, { name: string; singleLine: boolean; default: string }>;
  originCategoryList: number[];
  currencies: Record<string, { name: string; abbrev: string; budget: number; essential: boolean }>;
  purchaseSubtypes: Record<string, { name: string; stipend: number; currency: number; type: number; essential: boolean }>;
  subsystemSummaries: Record<string, Record<string, unknown>>;
  purchases: Record<string, unknown[]>;
  retainedDrawbacks: Record<string, unknown[]>;
  drawbacks: Record<string, unknown[]>;
  drawbackOverrides: Record<string, Record<string, unknown>>;
  origins: Record<string, Record<string, ChainMakerV2OriginSelection>>;
  altForms: Record<string, unknown[]>;
  useAltForms: boolean;
  narratives: Record<string, ChainMakerV2Narrative>;
  useNarratives: boolean;
  budgets: Record<string, Record<string, number>>;
  stipends: Record<string, Record<string, Record<string, number>>>;
  [key: string]: unknown;
}

export interface ChainMakerV2AltformDimension {
  value: number;
  unit: number;
}

export interface ChainMakerV2Altform {
  characterId: number;
  _id: number;
  imageUploaded: boolean;
  height: ChainMakerV2AltformDimension;
  weight: ChainMakerV2AltformDimension;
  sex: string;
  name: string;
  species: string;
  physicalDescription: string;
  capabilities: string;
  [key: string]: unknown;
}

export interface ChainMakerV2ChainSettings {
  chainDrawbacksForCompanions: boolean;
  chainDrawbacksSupplements: boolean;
  narratives: 'enabled' | 'disabled';
  altForms: boolean;
  [key: string]: unknown;
}

export interface ChainMakerV2BankSettings {
  enabled: boolean;
  maxDeposit: number;
  depositRatio: number;
  interestRate: number;
  [key: string]: unknown;
}

export interface ChainMakerV2Source {
  name: string;
  versionNumber: string;
  current?: boolean;
  characters: Record<string, ChainMakerV2Character>;
  jumps: Record<string, ChainMakerV2Jump>;
  altforms: Record<string, ChainMakerV2Altform>;
  chainDrawbacks: unknown[];
  chainSettings: ChainMakerV2ChainSettings;
  bankSettings: ChainMakerV2BankSettings;
  characterList: number[];
  jumpList: number[];
  purchaseCategories?: Record<string, Record<string, string>>;
  purchaseGroups?: Record<string, unknown>;
  purchases?: Record<string, unknown>;
  supplements?: Record<string, unknown>;
  notesList?: unknown[];
  notes?: Record<string, unknown>;
  manager?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NormalizedChainImport {
  title: string;
  sourceVersion: string;
  chainSettings: Chain['chainSettings'];
  bankSettings: Chain['bankSettings'];
  importSourceMetadata: JsonMap;
}

export interface NormalizedJumperImport {
  sourceKey: string;
  sourceId: number;
  name: string;
  isPrimary: boolean;
  gender: string;
  originalAge?: number | null;
  notes: string;
  originalFormSourceId?: number | null;
  personality: Jumper['personality'];
  background: Jumper['background'];
  importSourceMetadata: JsonMap;
}

export interface NormalizedJumpImport {
  sourceKey: string;
  sourceId: number;
  title: string;
  orderIndex: number;
  status: Jump['status'];
  duration: Jump['duration'];
  characterSourceIds: number[];
  importSourceMetadata: JsonMap;
}

export interface NormalizedParticipationImport {
  sourceJumpId: number;
  sourceCharacterId: number;
  status: JumperParticipation['status'];
  notes: string;
  purchases: unknown[];
  drawbacks: unknown[];
  retainedDrawbacks: unknown[];
  origins: Record<string, unknown>;
  budgets: Record<string, number>;
  stipends: Record<string, Record<string, number>>;
  narratives: JumperParticipation['narratives'];
  altForms: unknown[];
  bankDeposit: number;
  currencyExchanges: unknown[];
  supplementPurchases: Record<string, unknown>;
  supplementInvestments: Record<string, unknown>;
  drawbackOverrides: Record<string, unknown>;
  importSourceMetadata: JsonMap;
}

export interface NormalizedEffectImport {
  sourceIndex: number;
  title: string;
  description: string;
  importSourceMetadata: JsonMap;
}

export interface NormalizedImportModel {
  sourceType: 'chainmaker-v2';
  sourceVersion: string;
  chain: NormalizedChainImport;
  jumpers: NormalizedJumperImport[];
  companions: Companion[];
  jumps: NormalizedJumpImport[];
  participations: NormalizedParticipationImport[];
  effects: NormalizedEffectImport[];
  bodymodProfiles: Omit<BodymodProfile, 'id' | 'chainId' | 'branchId' | 'createdAt' | 'updatedAt' | 'jumperId'>[];
  warnings: ImportWarning[];
  unresolvedMappings: UnresolvedMapping[];
  summary: ImportSummary;
  preservedSourceSummary: JsonMap;
}

export interface PreparedImportSession {
  sourceDetection: SourceDetectionResult;
  cleaning: ChainMakerV2CleanerResult;
  source: ChainMakerV2Source;
  normalized: NormalizedImportModel;
  bundle: NativeChainBundle;
  importReport: ImportReport;
}
