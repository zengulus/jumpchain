import type { BaseRecord, JsonMap } from '../common';

export interface Snapshot extends BaseRecord {
  chainId: string;
  branchId: string;
  title: string;
  description: string;
  createdFromJumpId?: string | null;
  summary: JsonMap;
}
