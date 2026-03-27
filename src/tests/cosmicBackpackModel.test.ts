import { describe, expect, it } from 'vitest';
import {
  buildCosmicBackpackSummary,
  createDefaultCosmicBackpackState,
  setCosmicBackpackOptionSelected,
} from '../features/cosmic-backpack/model';
import { cosmicBackpackMandatoryOptionIds } from '../features/cosmic-backpack/catalog';

describe('cosmic backpack supplement model', () => {
  it('includes the warehouse-compression modifiers by default', () => {
    const state = createDefaultCosmicBackpackState();

    expect(state.selectedOptionIds).toEqual(expect.arrayContaining([...cosmicBackpackMandatoryOptionIds]));
  });

  it('keeps the warehouse-compression modifiers selected even if they are toggled off', () => {
    const state = createDefaultCosmicBackpackState();

    const nextState = setCosmicBackpackOptionSelected(state, 'everythings-an-item', false);

    expect(nextState.selectedOptionIds).toEqual(expect.arrayContaining([...cosmicBackpackMandatoryOptionIds]));
  });

  it('doubles the bag volume when More Space is selected', () => {
    const state = createDefaultCosmicBackpackState();
    state.selectedOptionIds = ['more-space'];

    const summary = buildCosmicBackpackSummary(state);

    expect(summary.storageVolumeFt3).toBe(1024);
    expect(summary.storageVolumeM3).toBe(29);
  });

  it('warns when an upgrade is selected without its prerequisite', () => {
    const state = createDefaultCosmicBackpackState();
    state.selectedOptionIds = ['gourmet-food'];

    const summary = buildCosmicBackpackSummary(state);

    expect(summary.warnings).toContain('Gourmet Food is missing Food Supply.');
  });

  it('removes dependent upgrades when their parent option is turned off', () => {
    const state = createDefaultCosmicBackpackState();
    state.selectedOptionIds = ['food-supply', 'gourmet-food'];

    const nextState = setCosmicBackpackOptionSelected(state, 'food-supply', false);

    expect(nextState.selectedOptionIds).not.toContain('food-supply');
    expect(nextState.selectedOptionIds).not.toContain('gourmet-food');
  });

  it('warns when the current selection set is over budget', () => {
    const state = createDefaultCosmicBackpackState();
    state.selectedOptionIds = [
      'more-space',
      'adaptive-storage',
      'hammerspace',
      'gourmet-food',
      'magic-cottage',
      'integrative-technology',
      'healing-potions',
    ];

    const summary = buildCosmicBackpackSummary(state);

    expect(summary.remainingBp).toBeLessThan(0);
    expect(summary.warnings.some((warning) => warning.includes('over budget'))).toBe(true);
  });

  it('adds transferred BP to the total backpack budget', () => {
    const state = createDefaultCosmicBackpackState();

    const summary = buildCosmicBackpackSummary(state, { transferredBp: 300 });

    expect(summary.baseBp).toBe(1000);
    expect(summary.totalBp).toBe(1300);
    expect(summary.transferredBp).toBe(300);
    expect(summary.remainingBp).toBe(1300);
    expect(summary.selectedOptionCount).toBe(0);
  });

  it('lets custom upgrades add BP cost, flat volume, and scaling', () => {
    const state = createDefaultCosmicBackpackState();
    state.selectedOptionIds = ['more-space'];
    state.customUpgrades = [
      {
        id: 'annex',
        title: 'Fold-Out Annex',
        costBp: 75,
        addedVolumeFt3: 256,
        volumeMultiplier: 3,
        notes: 'Imported warehouse wing.',
      },
    ];

    const summary = buildCosmicBackpackSummary(state);

    expect(summary.spentBp).toBe(275);
    expect(summary.customUpgradeCount).toBe(1);
    expect(summary.customSpentBp).toBe(75);
    expect(summary.customAddedVolumeFt3).toBe(256);
    expect(summary.customVolumeMultiplier).toBe(3);
    expect(summary.storageVolumeFt3).toBe(3328);
  });
});
