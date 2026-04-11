import type { ChainScopedRecord, ScopedOwnership } from '../common';

export interface AttachmentRef extends ChainScopedRecord, ScopedOwnership {
  label: string;
  kind: 'file' | 'link' | 'image';
  mimeType?: string;
  fileName?: string;
  url?: string;
  dataUrl?: string;
  storage: 'embedded' | 'external' | 'local';
}
