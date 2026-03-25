import type { ChainScopedRecord, NoteType, ScopedOwnership } from '../common';

export interface Note extends ChainScopedRecord, ScopedOwnership {
  noteType: NoteType;
  title: string;
  content: string;
  tags: string[];
}
