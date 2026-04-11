import type { ChainScopedRecord, JsonMap } from '../common';
import type {
  AlternativeCost,
  ComboBoost,
  ScenarioReward,
  SelectionCost,
  SelectionPrerequisite,
} from '../jump/selection';

export interface JumpDocPageRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JumpDocPdfAnnotation extends JumpDocPageRect {
  id: string;
  label: string;
  notes: string;
  extractedText: string;
}

export interface JumpDocCurrency {
  name: string;
  abbrev: string;
  budget: number | null;
  essential: boolean;
}

export interface JumpDocOriginCategory {
  name: string;
  singleLine: boolean;
  defaultValue: string;
  randomizer?: {
    cost: SelectionCost;
    template: string;
    bounds: JumpDocPageRect[];
  };
}

export interface JumpDocPurchaseSubtype {
  name: string;
  type: number | null;
  currencyKey: string;
  stipend: number | null;
  essential: boolean;
}

export interface JumpDocTemplateBase {
  id: string;
  title: string;
  description: string;
  choiceContext?: string;
  costs: SelectionCost[];
  bounds: JumpDocPageRect[];
  alternativeCosts: AlternativeCost[];
  prerequisites: SelectionPrerequisite[];
  tags: string[];
  importSourceMetadata: JsonMap;
}

export interface JumpDocPurchaseTemplate extends JumpDocTemplateBase {
  templateKind: 'purchase';
  purchaseSection: 'perk' | 'subsystem' | 'item' | 'other';
  subtypeKey: string | null;
  temporary: boolean;
  comboBoosts: ComboBoost[];
}

export interface JumpDocDrawbackTemplate extends JumpDocTemplateBase {
  templateKind: 'drawback';
  durationYears: number | null;
}

export interface JumpDocScenarioTemplate extends JumpDocTemplateBase {
  templateKind: 'scenario';
  rewards: ScenarioReward[];
}

export interface JumpDocCompanionTemplate extends JumpDocTemplateBase {
  templateKind: 'companion';
  count: number;
  allowances: Record<string, number>;
  stipends: Record<string, Record<string, number>>;
}

export interface JumpDocOriginTemplate {
  id: string;
  categoryKey: string;
  title: string;
  description: string;
  choiceContext?: string;
  cost: SelectionCost;
  bounds: JumpDocPageRect[];
  importSourceMetadata: JsonMap;
}

export interface JumpDoc extends ChainScopedRecord {
  title: string;
  author: string;
  source: string;
  pdfAttachmentId?: string | null;
  pdfUrl?: string | null;
  notes: string;
  pdfAnnotationBounds: JumpDocPdfAnnotation[];
  currencies: Record<string, JumpDocCurrency>;
  originCategories: Record<string, JumpDocOriginCategory>;
  purchaseSubtypes: Record<string, JumpDocPurchaseSubtype>;
  origins: JumpDocOriginTemplate[];
  purchases: JumpDocPurchaseTemplate[];
  drawbacks: JumpDocDrawbackTemplate[];
  scenarios: JumpDocScenarioTemplate[];
  companions: JumpDocCompanionTemplate[];
  importSourceMetadata: JsonMap;
}
