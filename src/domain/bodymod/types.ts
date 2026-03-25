import type { BodymodMode, ChainScopedRecord, JsonMap } from '../common';

export interface BodymodForm {
  sourceAltformId?: number | null;
  name: string;
  sex: string;
  species: string;
  physicalDescription: string;
  capabilities: string;
  imageUploaded: boolean;
  heightValue?: number | null;
  heightUnit?: number | null;
  weightValue?: number | null;
  weightUnit?: number | null;
  importSourceMetadata: JsonMap;
}

export interface BodymodProfile extends ChainScopedRecord {
  jumperId: string;
  mode: BodymodMode;
  summary: string;
  forms: BodymodForm[];
  features: JsonMap[];
  importSourceMetadata: JsonMap;
}
