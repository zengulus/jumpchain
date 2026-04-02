import type { AttachmentRef } from './attachments/types';
import type { BodymodProfile } from './bodymod/types';
import type { Branch } from './branch/types';
import type { Chain } from './chain/types';
import type { Effect } from './effects/types';
import type { ImportReport } from './import/types';
import type { Companion, Jumper } from './jumper/types';
import type { CompanionParticipation, Jump, JumperParticipation } from './jump/types';
import type { Note } from './notes/types';
import type { PresetProfile } from './presets/types';
import type { HouseRuleProfile, JumpRulesContext } from './rules/types';
import type { Snapshot } from './snapshot/types';

export interface NativeChainBundle {
  chain: Chain;
  branches: Branch[];
  jumpers: Jumper[];
  companions: Companion[];
  jumps: Jump[];
  participations: JumperParticipation[];
  companionParticipations: CompanionParticipation[];
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

export interface NativeSaveEnvelope {
  formatVersion: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  chains: NativeChainBundle[];
  metadata: Record<string, unknown>;
}
