import type { ChainScopedRecord, JsonMap, ScopeType } from '../common';

export interface PresetProfile extends ChainScopedRecord {
  name: string;
  category: string;
  version: string;
  description: string;
  applicableScopes: ScopeType[];
  settingsPayload: JsonMap;
  overrides: JsonMap;
}
