import {
  applyRulesModulePreset,
  builtInRulesModulePresets,
  createDefaultRulesModuleSettings,
  diffRulesModuleSettings,
  markRulesModuleSettingOverride,
  parseRulesModuleSettings,
} from '../domain/rules/customization';

describe('rules customization helpers', () => {
  it('parses partial branch settings with safe defaults', () => {
    const parsed = parseRulesModuleSettings(
      {
        defaults: {
          warehouseAccess: 'limited',
          supplementAccess: 'invalid-mode',
        },
        moduleCustomization: {
          showAdvancedMetadata: false,
        },
        appliedPresetId: 'minimalist',
        manualOverridePaths: ['defaults.warehouseAccess', 42],
      },
      true,
    );

    expect(parsed.defaults.warehouseAccess).toBe('limited');
    expect(parsed.defaults.supplementAccess).toBe('manual');
    expect(parsed.defaults.altFormAccess).toBe('full');
    expect(parsed.moduleCustomization.showAdvancedMetadata).toBe(false);
    expect(parsed.appliedPresetId).toBe('minimalist');
    expect(parsed.manualOverridePaths).toEqual(['defaults.warehouseAccess']);
  });

  it('applies presets and clears manual override tracking', () => {
    const baseSettings = markRulesModuleSettingOverride(createDefaultRulesModuleSettings(true), 'defaults.warehouseAccess');
    const preset = builtInRulesModulePresets.find((entry) => entry.id === 'gauntlet-harsh');

    if (!preset) {
      throw new Error('Expected the gauntlet-harsh preset to exist.');
    }

    const nextSettings = applyRulesModulePreset(baseSettings, preset);
    const diff = diffRulesModuleSettings(baseSettings, nextSettings);

    expect(nextSettings.appliedPresetId).toBe('gauntlet-harsh');
    expect(nextSettings.manualOverridePaths).toEqual([]);
    expect(diff.some((entry) => entry.path === 'defaults.gauntlet')).toBe(true);
    expect(diff.some((entry) => entry.path === 'defaults.warehouseAccess')).toBe(true);
  });
});
