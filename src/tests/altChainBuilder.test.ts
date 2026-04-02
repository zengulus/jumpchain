import {
  createDefaultAltChainBuilderState,
  hasAltChainBuilderBeenUsed,
  parseAltChainBuilderState,
  updateAltChainBuilderMetadata,
} from '../features/chainwide-rules/altChainBuilder';

describe('alt-chain builder helpers', () => {
  it('parses invalid data with safe defaults', () => {
    const parsed = parseAltChainBuilderState({
      enabled: 'yes',
      startingPoint: 'wildcard',
      exchangeRate: 'broken',
      notes: 42,
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
        enabled: true,
        startingPoint: 'stranded',
        exchangeRate: 'survivor',
        notes: 'Grounded branch start.',
      },
    );

    expect(nextMetadata.cosmicBackpack).toEqual({ enabled: true });
    expect(nextMetadata.altChainBuilder).toEqual({
      enabled: true,
      startingPoint: 'stranded',
      exchangeRate: 'survivor',
      notes: 'Grounded branch start.',
    });
  });

  it('treats enabled or noted builders as already used', () => {
    expect(hasAltChainBuilderBeenUsed(createDefaultAltChainBuilderState())).toBe(false);
    expect(
      hasAltChainBuilderBeenUsed({
        enabled: true,
        startingPoint: 'chosen',
        exchangeRate: 'favored',
        notes: '',
      }),
    ).toBe(true);
    expect(
      hasAltChainBuilderBeenUsed({
        enabled: false,
        startingPoint: 'chosen',
        exchangeRate: 'favored',
        notes: 'Imported decisions.',
      }),
    ).toBe(true);
  });
});
