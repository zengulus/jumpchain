import {
  ALT_CHAIN_CHOSEN_STARTER_SELECTION_COUNTS,
  ALT_CHAIN_CHOSEN_STARTER_EXTRA_SUPPLEMENT_COUNT,
  applyAltChainBuilderChosenStarterPackage,
  buildAltChainBuilderGeneratedEffectSpecs,
  buildAltChainBuilderSummary,
  createDefaultAltChainBuilderState,
  getAltChainBuilderSelectionCount,
  getAltChainSupplementSelectionSummary,
  hasAltChainBuilderBeenUsed,
  parseAltChainBuilderState,
  setAltChainSupplementExtraSelectionCount,
  setAltChainBuilderSelectionCount,
  setAltChainTrackedSupplementSelected,
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
        version: 5,
        enabled: true,
        startingPoint: 'stranded',
        exchangeRate: 'survivor',
        selectionCounts: {
          grant: 2,
        },
        supplementSelections: {
          iconic: true,
          cosmicBackpack: false,
          threeBoons: false,
          extraSelections: 1,
        },
        notes: 'Grounded branch start.',
        lastSyncedAt: '2026-04-02T10:00:00.000Z',
      },
    );

    expect(nextMetadata.cosmicBackpack).toEqual({ enabled: true });
    expect(nextMetadata.altChainBuilder).toEqual({
      version: 5,
      enabled: true,
      startingPoint: 'stranded',
      exchangeRate: 'survivor',
      selectionCounts: {
        grant: 2,
      },
      supplementSelections: {
        iconic: true,
        cosmicBackpack: false,
        threeBoons: false,
        extraSelections: 1,
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
        supplementSelections: {
          iconic: true,
          cosmicBackpack: false,
          threeBoons: false,
          extraSelections: 0,
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

  it('migrates version-3 chosen package counts into actual selections', () => {
    const parsed = parseAltChainBuilderState({
      version: 3,
      enabled: true,
      startingPoint: 'chosen',
      exchangeRate: 'favored',
      selectionCounts: {
        'not-alone': 1,
      },
    });

    expect(parsed.selectionCounts).toEqual({
      ...ALT_CHAIN_CHOSEN_STARTER_SELECTION_COUNTS,
      'not-alone': 5,
    });
    expect(parsed.supplementSelections.extraSelections).toBe(ALT_CHAIN_CHOSEN_STARTER_EXTRA_SUPPLEMENT_COUNT);
    expect(getAltChainBuilderSelectionCount(parsed, 'braving-the-gauntlets')).toBe(1);
    expect(getAltChainBuilderSelectionCount(parsed, 'entertain-me')).toBe(1);
    expect(getAltChainBuilderSelectionCount(parsed, 'diminishing-returns')).toBe(1);
    expect(getAltChainBuilderSelectionCount(parsed, 'supplements')).toBe(2);
    expect(getAltChainBuilderSelectionCount(parsed, 'under-warranty')).toBe(3);
    expect(getAltChainBuilderSelectionCount(parsed, 'not-alone')).toBe(5);
  });

  it('applies the chosen starter package without wiping the rest of the builder state', () => {
    const seeded = applyAltChainBuilderChosenStarterPackage({
      ...createDefaultAltChainBuilderState(),
      enabled: true,
      startingPoint: 'stranded',
      exchangeRate: 'masochist',
      notes: 'Keep these notes.',
    });

    expect(seeded.startingPoint).toBe('chosen');
    expect(seeded.exchangeRate).toBe('masochist');
    expect(seeded.notes).toBe('Keep these notes.');
    expect(seeded.selectionCounts).toEqual(ALT_CHAIN_CHOSEN_STARTER_SELECTION_COUNTS);
    expect(seeded.supplementSelections.extraSelections).toBe(ALT_CHAIN_CHOSEN_STARTER_EXTRA_SUPPLEMENT_COUNT);
  });

  it('seeds the chosen starter package with the full base selection list', () => {
    const summary = buildAltChainBuilderSummary({
      ...createDefaultAltChainBuilderState(),
      enabled: true,
      selectionCounts: ALT_CHAIN_CHOSEN_STARTER_SELECTION_COUNTS,
      supplementSelections: {
        iconic: false,
        cosmicBackpack: false,
        threeBoons: false,
        extraSelections: ALT_CHAIN_CHOSEN_STARTER_EXTRA_SUPPLEMENT_COUNT,
      },
    });

    expect(summary.selectedAccommodationCount).toBe(21);
    expect(summary.selectedComplicationCount).toBe(2);
    expect(summary.warnings.includes('Chosen has 21 Accommodation slots. 1 still unfilled.')).toBe(false);
    expect(summary.warnings.includes('Chosen has 2 Complication slots. 2 still unfilled.')).toBe(false);
  });

  it('builds worksheet totals from explicit recorded selections', () => {
    const withSelections = setAltChainBuilderSelectionCount(
      setAltChainBuilderSelectionCount(
        {
          ...createDefaultAltChainBuilderState(),
          enabled: true,
          startingPoint: 'stranded',
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
    expect(summary.recordedAccommodationCount).toBe(2);
    expect(summary.recordedComplicationCount).toBe(4);
    expect(summary.availableExtraAccommodationCredit).toBe(6);
    expect(summary.extraAccommodationDelta).toBe(4);
  });

  it('treats chosen as a swappable 21A / 2C budget', () => {
    const chosenState = setAltChainBuilderSelectionCount(
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

    const summary = buildAltChainBuilderSummary(chosenState);

    expect(summary.selectedAccommodationCount).toBe(2);
    expect(summary.selectedComplicationCount).toBe(4);
    expect(summary.recordedAccommodationCount).toBe(2);
    expect(summary.recordedComplicationCount).toBe(4);
    expect(summary.availableExtraAccommodationCredit).toBe(3);
    expect(summary.extraAccommodationDelta).toBe(22);
  });

  it('warns when chosen slots are still unfilled', () => {
    const chosenState = {
      ...createDefaultAltChainBuilderState(),
      enabled: true,
    };

    const summary = buildAltChainBuilderSummary(chosenState);

    expect(summary.warnings).toContain('Chosen has 21 Accommodation slots. 21 still unfilled.');
    expect(summary.warnings).toContain('Chosen has 2 Complication slots. 2 still unfilled.');
  });

  it('treats non-repeatable options as binary selections while keeping repeatable tallies', () => {
    const withSelections = setAltChainBuilderSelectionCount(
      setAltChainBuilderSelectionCount(createDefaultAltChainBuilderState(), 'braving-the-gauntlets', 3),
      'budget-cuts',
      4,
    );

    expect(getAltChainBuilderSelectionCount(withSelections, 'braving-the-gauntlets')).toBe(1);
    expect(getAltChainBuilderSelectionCount(withSelections, 'budget-cuts')).toBe(4);
  });

  it('builds generated chainwide effect specs from recorded options', () => {
    const withSelections = setAltChainBuilderSelectionCount(
      setAltChainBuilderSelectionCount(
        {
          ...createDefaultAltChainBuilderState(),
          enabled: true,
          startingPoint: 'stranded',
        },
        'grant',
        2,
      ),
      'budget-cuts',
      3,
    );

    const specs = buildAltChainBuilderGeneratedEffectSpecs(withSelections);

    expect(specs).toHaveLength(2);
    expect(specs[0]?.optionId).toBe('grant');
    expect(specs[0]?.count).toBe(2);
    expect(specs[0]?.title).toBe('Grant x2');
    expect(specs[0]?.category).toBe('rule');
    expect((specs[0]?.importSourceMetadata as { budgetGrants?: Record<string, number> } | undefined)?.budgetGrants).toEqual({
      '0': 200,
    });
    expect(specs[1]?.optionId).toBe('budget-cuts');
    expect(specs[1]?.count).toBe(3);
    expect(specs[1]?.title).toBe('Budget Cuts x3');
    expect(specs[1]?.category).toBe('drawback');
  });

  it('uses the Supplements selection as tracked unlocks plus extra supplement count', () => {
    const withSupplements = setAltChainSupplementExtraSelectionCount(
      setAltChainTrackedSupplementSelected(
        setAltChainTrackedSupplementSelected(createDefaultAltChainBuilderState(), 'iconic', true),
        'three-boons',
        true,
      ),
      2,
    );

    expect(getAltChainBuilderSelectionCount(withSupplements, 'supplements')).toBe(4);
    expect(getAltChainSupplementSelectionSummary(withSupplements)).toEqual({
      selections: {
        iconic: true,
        cosmicBackpack: false,
        threeBoons: true,
        extraSelections: 2,
      },
      unlockedSupplementIds: ['iconic', 'three-boons'],
      trackedSelectionCount: 2,
      extraSelectionCount: 2,
      totalSelectionCount: 4,
    });

    const specs = buildAltChainBuilderGeneratedEffectSpecs(withSupplements);
    const supplementSpec = specs.find((spec) => spec.optionId === 'supplements');

    expect(supplementSpec?.count).toBe(4);
    expect((supplementSpec?.importSourceMetadata as { altChainTrackedSupplementIds?: string[] } | undefined)?.altChainTrackedSupplementIds).toEqual([
      'iconic',
      'three-boons',
    ]);
  });
});
