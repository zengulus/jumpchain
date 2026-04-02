import { describe, expect, it } from 'vitest';
import {
  applyThreeBoonsRoll,
  buildThreeBoonsSummary,
  buildThreeBoonsGeneratedEffectSpecs,
  createDefaultThreeBoonsState,
  getThreeBoonsGeneratedEffectBoonId,
  isThreeBoonsGeneratedEffect,
  hasThreeBoonsStarted,
  readThreeBoonsState,
  rollThreeBoonsBoonSet,
  setThreeBoonsManualSelectionCount,
  writeThreeBoonsState,
} from '../features/three-boons/model';

function createRandomSequence(...boonNumbers: number[]) {
  let index = 0;

  return () => {
    const nextNumber = boonNumbers[index] ?? boonNumbers[boonNumbers.length - 1] ?? 1;
    index += 1;
    return (nextNumber - 0.5) / 30;
  };
}

describe('three boons helper model', () => {
  it('parses invalid data with safe defaults', () => {
    const parsed = readThreeBoonsState({
      importSourceMetadata: {
        threeBoons: {
          mode: 'mystery',
          manualSelectionCounts: 'nope',
          rollResult: 42,
          notes: ['bad'],
        },
      },
    });

    expect(parsed).toEqual(createDefaultThreeBoonsState());
  });

  it('writes Three Boons state into import metadata without discarding unrelated keys', () => {
    const nextChain = writeThreeBoonsState(
      {
        id: 'chain-1',
        chainSettings: {
          chainDrawbacksForCompanions: false,
          chainDrawbacksSupplements: false,
          narratives: 'enabled',
          altForms: true,
        },
        bankSettings: {
          enabled: false,
          maxDeposit: 0,
          depositRatio: 0,
          interestRate: 0,
        },
        title: 'Test',
        schemaVersion: 1,
        formatVersion: '1',
        activeBranchId: 'branch-1',
        importSourceMetadata: {
          cosmicBackpack: {
            enabled: true,
          },
        },
        createdAt: '2026-04-03T00:00:00.000Z',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
      {
        ...createDefaultThreeBoonsState(),
        manualSelectionCounts: {
          'multiplayer-chain': 2,
        },
        notes: 'Branch uses the manual route.',
      },
    );

    expect(nextChain.importSourceMetadata.cosmicBackpack).toEqual({ enabled: true });
    expect(nextChain.importSourceMetadata.threeBoons).toEqual({
      version: 1,
      mode: 'choose',
      manualSelectionCounts: {
        'multiplayer-chain': 2,
      },
      rollResult: null,
      notes: 'Branch uses the manual route.',
    });
  });

  it('enforces the choose-three limit and blocks manual selection of roll-only boons', () => {
    let state = createDefaultThreeBoonsState();

    state = setThreeBoonsManualSelectionCount(state, 'multiplayer-chain', 2);
    state = setThreeBoonsManualSelectionCount(state, 'another-boon', 1);
    state = setThreeBoonsManualSelectionCount(state, 'maximum-rewards', 2);

    expect(state.manualSelectionCounts).toEqual({
      'multiplayer-chain': 2,
      'maximum-rewards': 1,
    });

    const summary = buildThreeBoonsSummary(state);
    expect(summary.manualSelectionTotal).toBe(3);
    expect(summary.warnings).toHaveLength(0);
  });

  it('resolves extra rolls and rerolls capped boons automatically', () => {
    const result = rollThreeBoonsBoonSet(
      createRandomSequence(29, 29, 29, 30, 30, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
      '2026-04-03T00:00:00.000Z',
    );

    expect(result.selectionCounts['another-boon']).toBe(2);
    expect(result.selectionCounts['double-the-extra-boons']).toBe(2);
    expect(result.rerollCount).toBe(2);
    expect(result.acceptedRolls).toHaveLength(14);
    expect(result.acceptedRolls.slice(0, 4).map((entry) => entry.number)).toEqual([29, 29, 30, 30]);

    const state = applyThreeBoonsRoll(createDefaultThreeBoonsState(), result);
    const summary = buildThreeBoonsSummary(state);

    expect(summary.rollSelectionTotal).toBe(14);
    expect(summary.extraRollCount).toBe(10);
    expect(summary.activeSelections.some(({ option }) => option.id === 'another-boon')).toBe(true);
  });

  it('treats notes or recorded picks as a started page', () => {
    expect(hasThreeBoonsStarted(createDefaultThreeBoonsState())).toBe(false);
    expect(
      hasThreeBoonsStarted({
        ...createDefaultThreeBoonsState(),
        notes: 'Keep Frontload off the main branch.',
      }),
    ).toBe(true);
    expect(
      hasThreeBoonsStarted({
        ...createDefaultThreeBoonsState(),
        manualSelectionCounts: {
          harmonious: 1,
        },
      }),
    ).toBe(true);
  });

  it('builds generated chainwide effect specs from the active boon set', () => {
    const state = applyThreeBoonsRoll(
      createDefaultThreeBoonsState(),
      rollThreeBoonsBoonSet(createRandomSequence(29, 30, 28, 1, 2, 3, 4, 5, 6), '2026-04-03T00:00:00.000Z'),
    );

    const specs = buildThreeBoonsGeneratedEffectSpecs(state);
    const anotherBoonSpec = specs.find((spec) => spec.boonId === 'another-boon');

    expect(anotherBoonSpec?.category).toBe('rule');
    expect((anotherBoonSpec?.importSourceMetadata as { trackedSupplementId?: string } | undefined)?.trackedSupplementId).toBe('three-boons');
    expect(
      isThreeBoonsGeneratedEffect({
        importSourceMetadata: anotherBoonSpec?.importSourceMetadata ?? {},
      }),
    ).toBe(true);
    expect(
      getThreeBoonsGeneratedEffectBoonId({
        importSourceMetadata: anotherBoonSpec?.importSourceMetadata ?? {},
      }),
    ).toBe('another-boon');
  });
});
