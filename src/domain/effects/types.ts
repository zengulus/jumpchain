import type {
  ChainScopedRecord,
  EffectCategory,
  EffectState,
  JsonMap,
  ScopedOwnership,
} from '../common';

export interface Effect extends ChainScopedRecord, ScopedOwnership {
  title: string;
  description: string;
  category: EffectCategory;
  state: EffectState;
  sourceEffectId?: string | number | null;
  importSourceMetadata: JsonMap;
}
