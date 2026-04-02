import {
  buildAltChainBuilderGeneratedEffectSpecs,
  buildAltChainBuilderSummary,
  createDefaultAltChainBuilderState,
  hasAltChainBuilderBeenUsed,
  parseAltChainBuilderState,
  setAltChainBuilderSelectionCount,
  updateAltChainBuilderMetadata,
} from '../features/chainwide-rules/altChainBuilder';

describe('alt-chain builder helpers', () => {
  it('parses invalid data with safe defaults', () => {
    const parsed = parseAltChainBuilderState({
      enabled: 'yes',
      startingPoint: 'wildcard',
      exchangeRate: 'broken',
      selectionCounts: 'nope',
      notes: 42,
      lastSyncedAt: 9,
    });

    expect(parsed).toEqual(createDefaultAltChainBuilderState());
  });

  it('writes builder state into import metadata without discarding unrelated keys', () => {
    const nextMetadata = updateAltChainBuilderMetadata(
      {
        cosmicBackpack: {
          enabled: true,
        },
      },
      {
        version: 2,
        enabled: true,
        startingPoint: 'stranded',
        exchangeRate: 'survivor',
        selectionCounts: {
          grant: 2,
        },
        notes: 'Grounded branch start.',
        lastSyncedAt: '2026-04-02T10:00:00.000Z',
      },
    );

    expect(nextMetadata.cosmicBackpack).toEqual({ enabled: true });
    expect(nextMetadata.altChainBuilder).toEqual({
      version: 2,
      enabled: true,
      startingPoint: 'stranded',
      exchangeRate: 'survivor',
      selectionCounts: {
        grant: 2,
      },
      notes: 'Grounded branch start.',
      lastSyncedAt: '2026-04-02T10:00:00.000Z',
    });
  });

  it('treats enabled, recorded, or synced builders as already used', () => {
    expect(hasAltChainBuilderBeenUsed(createDefaultAltChainBuilderState())).toBe(false);
    expect(
      hasAltChainBuilderBeenUsed({
        ...createDefaultAltChainBuilderState(),
        enabled: true,
      }),
    ).toBe(true);
    expect(
      hasAltChainBuilderBeenUsed({
        ...createDefaultAltChainBuilderState(),
        notes: 'Imported decisions.',
      }),
    ).toBe(true);
    expect(
      hasAltChainBuilderBeenUsed({
        ...createDefaultAltChainBuilderState(),
        selectionCounts: {
          grant: 1,
        },
      }),
    ).toBe(true);
    expect(
      hasAltChainBuilderBeenUsed({
        ...createDefaultAltChainBuilderState(),
        lastSyncedAt: '2026-04-02T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('builds worksheet totals with chosen baseline and recorded selections', () => {
    const withSelections = setAltChainBuilderSelectionCount(
      setAltChainBuilderSelectionCount(
        {
          ...createDefaultAltChainBuilderState(),
          enabled: true,
        },
        'grant',
        2,
      ),
      'budget-cuts',
      4,
    );

    const summary = buildAltChainBuilderSummary(withSelections);

    expect(summary.selectedAccommodationCount).toBe(2);
    expect(summary.selectedComplicationCount).toBe(4);
    expect(summary.recordedAccommodationCount).toBe(24);
    expect(summary.recordedComplicationCount).toBe(6);
    expect(summary.availableExtraAccommodationCredit).toBe(6);
    expect(summary.extraAccommodationDelta).toBe(4);
  });

  it('builds generated chainwide effect specs from recorded options', () => {
    const withSelections = setAltChainBuilderSelectionCount(
      setAltChainBuilderSelectionCount(
        {
          ...createDefaultAltChainBuilderState(),
          enabled: true,
        },
        'grant',
        2,
      ),
      'budget-cuts',
      3,
    );

    const specs = buildAltChainBuilderGeneratedEffectSpecs(withSelections);

    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({
      optionId: 'grant',
      count: 2,
      title: 'Grant x2',
      category: 'rule',
    });
    expect(specs[1]).toMatchObject({
      optionId: 'budget-cuts',
      count: 3,
      title: 'Budget Cuts x3',
      category: 'drawback',
    });
  });
});
