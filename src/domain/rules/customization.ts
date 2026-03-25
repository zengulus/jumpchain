import { accessModes, type AccessMode } from '../common';
import type { HouseRuleProfile } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAccessMode(value: unknown): value is AccessMode {
  return typeof value === 'string' && accessModes.includes(value as AccessMode);
}

function readAccessMode(value: unknown, fallback: AccessMode): AccessMode {
  return isAccessMode(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export const rulesDefaultKeys = [
  'gauntlet',
  'warehouseAccess',
  'powerAccess',
  'itemAccess',
  'altFormAccess',
  'supplementAccess',
] as const;

export type RulesDefaultKey = (typeof rulesDefaultKeys)[number];

export const rulesAccessKeys = [
  'warehouseAccess',
  'powerAccess',
  'itemAccess',
  'altFormAccess',
  'supplementAccess',
] as const;

export type RulesAccessKey = (typeof rulesAccessKeys)[number];

export const rulesModuleCustomizationKeys = [
  'showEffectSources',
  'showAdvancedMetadata',
  'showPresetDiff',
  'showFallbackSourceBadges',
  'highlightRuleOverrides',
] as const;

export type RulesModuleCustomizationKey = (typeof rulesModuleCustomizationKeys)[number];

export interface RulesDefaults {
  gauntlet: boolean;
  warehouseAccess: AccessMode;
  powerAccess: AccessMode;
  itemAccess: AccessMode;
  altFormAccess: AccessMode;
  supplementAccess: AccessMode;
}

export interface RulesModuleCustomizationSettings {
  showEffectSources: boolean;
  showAdvancedMetadata: boolean;
  showPresetDiff: boolean;
  showFallbackSourceBadges: boolean;
  highlightRuleOverrides: boolean;
}

export interface RulesModuleSettings {
  moduleKey: 'current-jump-rules';
  defaults: RulesDefaults;
  moduleCustomization: RulesModuleCustomizationSettings;
  appliedPresetId: string | null;
  manualOverridePaths: string[];
}

export interface RulesModulePresetDefinition {
  id: string;
  name: string;
  description: string;
  defaults?: Partial<RulesDefaults>;
  moduleCustomization?: Partial<RulesModuleCustomizationSettings>;
}

export const rulesDefaultLabels: Record<RulesDefaultKey, string> = {
  gauntlet: 'Gauntlet default',
  warehouseAccess: 'Warehouse access',
  powerAccess: 'Power access',
  itemAccess: 'Item access',
  altFormAccess: 'Alt-form access',
  supplementAccess: 'Supplement access',
};

export const rulesCustomizationLabels: Record<RulesModuleCustomizationKey, string> = {
  showEffectSources: 'Show contributing effect details',
  showAdvancedMetadata: 'Show advanced metadata editors',
  showPresetDiff: 'Show preset diff preview',
  showFallbackSourceBadges: 'Show fallback source badges',
  highlightRuleOverrides: 'Highlight context overrides',
};

export function createDefaultRulesDefaults(allowAltForms: boolean): RulesDefaults {
  return {
    gauntlet: false,
    warehouseAccess: 'manual',
    powerAccess: 'manual',
    itemAccess: 'manual',
    altFormAccess: allowAltForms ? 'full' : 'locked',
    supplementAccess: 'manual',
  };
}

export function createDefaultRulesModuleCustomization(): RulesModuleCustomizationSettings {
  return {
    showEffectSources: true,
    showAdvancedMetadata: true,
    showPresetDiff: true,
    showFallbackSourceBadges: true,
    highlightRuleOverrides: true,
  };
}

export function createDefaultRulesModuleSettings(allowAltForms: boolean): RulesModuleSettings {
  return {
    moduleKey: 'current-jump-rules',
    defaults: createDefaultRulesDefaults(allowAltForms),
    moduleCustomization: createDefaultRulesModuleCustomization(),
    appliedPresetId: null,
    manualOverridePaths: [],
  };
}

export function parseRulesModuleSettings(raw: unknown, allowAltForms: boolean): RulesModuleSettings {
  const fallback = createDefaultRulesModuleSettings(allowAltForms);
  const record = isRecord(raw) ? raw : {};
  const defaults = isRecord(record.defaults) ? record.defaults : {};
  const moduleCustomization = isRecord(record.moduleCustomization) ? record.moduleCustomization : {};

  return {
    moduleKey: 'current-jump-rules',
    defaults: {
      gauntlet: readBoolean(defaults.gauntlet, fallback.defaults.gauntlet),
      warehouseAccess: readAccessMode(defaults.warehouseAccess, fallback.defaults.warehouseAccess),
      powerAccess: readAccessMode(defaults.powerAccess, fallback.defaults.powerAccess),
      itemAccess: readAccessMode(defaults.itemAccess, fallback.defaults.itemAccess),
      altFormAccess: readAccessMode(defaults.altFormAccess, fallback.defaults.altFormAccess),
      supplementAccess: readAccessMode(defaults.supplementAccess, fallback.defaults.supplementAccess),
    },
    moduleCustomization: {
      showEffectSources: readBoolean(
        moduleCustomization.showEffectSources,
        fallback.moduleCustomization.showEffectSources,
      ),
      showAdvancedMetadata: readBoolean(
        moduleCustomization.showAdvancedMetadata,
        fallback.moduleCustomization.showAdvancedMetadata,
      ),
      showPresetDiff: readBoolean(moduleCustomization.showPresetDiff, fallback.moduleCustomization.showPresetDiff),
      showFallbackSourceBadges: readBoolean(
        moduleCustomization.showFallbackSourceBadges,
        fallback.moduleCustomization.showFallbackSourceBadges,
      ),
      highlightRuleOverrides: readBoolean(
        moduleCustomization.highlightRuleOverrides,
        fallback.moduleCustomization.highlightRuleOverrides,
      ),
    },
    appliedPresetId: typeof record.appliedPresetId === 'string' ? record.appliedPresetId : null,
    manualOverridePaths: readStringList(record.manualOverridePaths),
  };
}

export function isRulesModuleHouseRuleProfile(profile: HouseRuleProfile) {
  return isRecord(profile.settings) && profile.settings.moduleKey === 'current-jump-rules';
}

export function getRulesModuleHouseRuleProfile(profiles: HouseRuleProfile[]) {
  return profiles.find((profile) => isRulesModuleHouseRuleProfile(profile)) ?? profiles[0] ?? null;
}

export function markRulesModuleSettingOverride(settings: RulesModuleSettings, path: string): RulesModuleSettings {
  return settings.manualOverridePaths.includes(path)
    ? settings
    : {
        ...settings,
        manualOverridePaths: [...settings.manualOverridePaths, path],
      };
}

export function applyRulesModulePreset(
  settings: RulesModuleSettings,
  preset: RulesModulePresetDefinition,
): RulesModuleSettings {
  return {
    ...settings,
    defaults: {
      ...settings.defaults,
      ...preset.defaults,
    },
    moduleCustomization: {
      ...settings.moduleCustomization,
      ...preset.moduleCustomization,
    },
    appliedPresetId: preset.id,
    manualOverridePaths: [],
  };
}

export interface RulesModuleDiffEntry {
  path: string;
  label: string;
  before: string;
  after: string;
}

function formatDiffValue(value: AccessMode | boolean) {
  return typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : value;
}

export function diffRulesModuleSettings(before: RulesModuleSettings, after: RulesModuleSettings): RulesModuleDiffEntry[] {
  const entries: RulesModuleDiffEntry[] = [];

  for (const key of rulesDefaultKeys) {
    if (before.defaults[key] !== after.defaults[key]) {
      entries.push({
        path: `defaults.${key}`,
        label: rulesDefaultLabels[key],
        before: formatDiffValue(before.defaults[key]),
        after: formatDiffValue(after.defaults[key]),
      });
    }
  }

  for (const key of rulesModuleCustomizationKeys) {
    if (before.moduleCustomization[key] !== after.moduleCustomization[key]) {
      entries.push({
        path: `moduleCustomization.${key}`,
        label: rulesCustomizationLabels[key],
        before: formatDiffValue(before.moduleCustomization[key]),
        after: formatDiffValue(after.moduleCustomization[key]),
      });
    }
  }

  return entries;
}

export function getRulesModulePresetById(presetId: string) {
  return builtInRulesModulePresets.find((preset) => preset.id === presetId) ?? null;
}

export const builtInRulesModulePresets: RulesModulePresetDefinition[] = [
  {
    id: 'manual-blank',
    name: 'Manual / Blank',
    description: 'Keep the rules module open and explicit, with neutral defaults and full editor visibility.',
    defaults: {
      gauntlet: false,
      warehouseAccess: 'manual',
      powerAccess: 'manual',
      itemAccess: 'manual',
      supplementAccess: 'manual',
    },
    moduleCustomization: {
      showEffectSources: true,
      showAdvancedMetadata: true,
      showPresetDiff: true,
      showFallbackSourceBadges: true,
      highlightRuleOverrides: true,
    },
  },
  {
    id: 'warehouse-lite',
    name: 'Warehouse-lite',
    description: 'Lean toward tighter logistics while keeping most jump controls editable in the branch profile.',
    defaults: {
      warehouseAccess: 'limited',
      itemAccess: 'limited',
      supplementAccess: 'limited',
    },
  },
  {
    id: 'gauntlet-harsh',
    name: 'Gauntlet-harsh',
    description: 'Default the active branch toward strict gauntlet interpretation and heavily constrained carryover.',
    defaults: {
      gauntlet: true,
      warehouseAccess: 'locked',
      powerAccess: 'limited',
      itemAccess: 'limited',
      altFormAccess: 'locked',
      supplementAccess: 'locked',
    },
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Trim the rules module down to the essentials and hide the noisier diagnostic surfaces.',
    moduleCustomization: {
      showEffectSources: false,
      showAdvancedMetadata: false,
      showPresetDiff: false,
      showFallbackSourceBadges: false,
      highlightRuleOverrides: false,
    },
  },
];
