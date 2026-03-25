import type { ChainScopedRecord, JsonMap } from '../common';

export interface Jumper extends ChainScopedRecord {
  name: string;
  isPrimary: boolean;
  gender: string;
  originalAge?: number | null;
  notes: string;
  originalFormSourceId?: number | null;
  personality: {
    personality: string;
    motivation: string;
    likes: string;
    dislikes: string;
    quirks: string;
  };
  background: {
    summary: string;
    description: string;
  };
  importSourceMetadata: JsonMap;
}

export interface Companion extends ChainScopedRecord {
  name: string;
  parentJumperId?: string | null;
  importSourceMetadata: JsonMap;
}
