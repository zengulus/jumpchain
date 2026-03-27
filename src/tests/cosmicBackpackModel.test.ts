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
});
