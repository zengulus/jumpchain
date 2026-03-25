import type { ChainScopedRecord, ScopedOwnership } from '../common';

export interface AttachmentRef extends ChainScopedRecord, ScopedOwnership {
  label: string;
  kind: 'file' | 'link' | 'image';
  mimeType?: string;
  fileName?: string;
  url?: string;
  storage: 'embedded' | 'external' | 'local';
}
