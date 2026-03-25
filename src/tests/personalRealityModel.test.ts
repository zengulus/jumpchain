import { describe, expect, it } from 'vitest';
import { buildPersonalRealityPlanSummary, createDefaultPersonalRealityState } from '../features/personal-reality/model';

describe('personal reality supplement model', () => {
  it('applies upfront discounts to root groups and their upgrades', () => {
    const state = createDefaultPersonalRealityState();
    state.coreModeId = 'upfront';
    state.discountedGroupIds = ['medical-suite'];
    state.selections['medical-bay'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };
    state.selections['the-better-bay'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };

    const summary = buildPersonalRealityPlanSummary(state, 0);

    expect(summary.availableWp).toBe(1500);
    expect(summary.selectionSummaries['medical-bay'].wpSpent).toBe(50);
    expect(summary.selectionSummaries['the-better-bay'].wpSpent).toBe(100);
    expect(summary.wpSpent).toBeGreaterThanOrEqual(150);
  });

  it('handles the mini-reality financing fee when upgrading into Personal Realty', () => {
    const state = createDefaultPersonalRealityState();
    state.coreModeId = 'therehouse';
    state.selections['personal-mini-realty'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };
    state.selections['personal-realty'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };

    const summary = buildPersonalRealityPlanSummary(state, 0);

    expect(summary.selectionSummaries['personal-mini-realty'].wpSpent).toBe(500);
    expect(summary.selectionSummaries['personal-realty'].wpSpent).toBe(2700);
    expect(summary.wpSpent).toBeGreaterThanOrEqual(3200);
  });

  it('makes Jump Recording free when Big Benefactor is selected and supports limitation buyoff math', () => {
    const state = createDefaultPersonalRealityState();
    state.coreModeId = 'incremental';
    state.selections['jump-recording'] = {
      units: 1,
      cpUnits: 0,
      variantId: '',
      limitationStatus: 'active',
    };
    state.selections['big-benefactor'] = {
      units: 0,
      cpUnits: 0,
      variantId: 'flat-bonus',
      limitationStatus: 'paid-off-wp',
    };
    state.selections['warehouse-clock'] = {
      units: 0,
      cpUnits: 0,
      variantId: 'one-hour',
      limitationStatus: 'paid-off-wp',
    };

    const summary = buildPersonalRealityPlanSummary(state, 3);

    expect(summary.selectionSummaries['jump-recording'].wpSpent).toBe(0);
    expect(summary.selectionSummaries['big-benefactor'].wpGain).toBe(500);
    expect(summary.selectionSummaries['big-benefactor'].wpSpent).toBe(750);
    expect(summary.selectionSummaries['warehouse-clock'].wpGain).toBe(100);
    expect(summary.selectionSummaries['warehouse-clock'].wpSpent).toBe(150);
  });
});
