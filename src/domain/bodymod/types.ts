import type { BodymodMode, ChainScopedRecord, JsonMap } from '../common';
import type { SelectionAccessibilityStatus } from '../jump/selection';

export const iconicSelectionKinds = ['perk', 'power', 'item', 'race', 'species', 'alt-form', 'other'] as const;
export type IconicSelectionKind = (typeof iconicSelectionKinds)[number];

export interface IconicSelection {
  kind: IconicSelectionKind;
  title: string;
  source: string;
  summary: string;
  restrictionLevel?: number;
  accessibilityStatus?: SelectionAccessibilityStatus;
}

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
  benchmarkNotes: string;
  interpretationNotes: string;
  iconicSelections: IconicSelection[];
  forms: BodymodForm[];
  features: JsonMap[];
  importSourceMetadata: JsonMap;
}
