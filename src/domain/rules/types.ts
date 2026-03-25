import type { AccessMode, ChainScopedRecord, JsonMap } from '../common';

export interface JumpRulesContext extends ChainScopedRecord {
  jumpId?: string | null;
  gauntlet: boolean;
  warehouseAccess: AccessMode;
  powerAccess: AccessMode;
  itemAccess: AccessMode;
  altFormAccess: AccessMode;
  supplementAccess: AccessMode;
  notes: string;
  importSourceMetadata: JsonMap;
}

export interface HouseRuleProfile extends ChainScopedRecord {
  title: string;
  description: string;
  settings: JsonMap;
}
