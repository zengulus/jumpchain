import type { BaseRecord, SourceMetadata } from '../common';

export interface Branch extends BaseRecord {
  chainId: string;
  title: string;
  sourceBranchId?: string | null;
  forkedFromJumpId?: string | null;
  isActive: boolean;
  notes: string;
  sourceMetadata?: SourceMetadata;
}
