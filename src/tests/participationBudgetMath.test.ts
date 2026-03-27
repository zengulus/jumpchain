import { applyPurchaseStipends } from '../features/participation/budgetMath';

describe('participation budget math', () => {
  it('applies stipends against matching subtype purchases in order', () => {
    const breakdown = applyPurchaseStipends(
      [
        { currencyKey: '0', subtypeKey: '1', grossAmount: 300 },
        { currencyKey: '0', subtypeKey: '1', grossAmount: 200 },
        { currencyKey: '0', subtypeKey: '10', grossAmount: 150 },
      ],
      {
        '0': {
          '1': 400,
          '10': 50,
        },
      },
    );

    expect(breakdown).toEqual([
      { currencyKey: '0', subtypeKey: '1', grossAmount: 300, stipendApplied: 300, netAmount: 0 },
      { currencyKey: '0', subtypeKey: '1', grossAmount: 200, stipendApplied: 100, netAmount: 100 },
      { currencyKey: '0', subtypeKey: '10', grossAmount: 150, stipendApplied: 50, netAmount: 100 },
    ]);
  });

  it('ignores stipends for unmatched currencies, missing subtypes, and non-positive spend', () => {
    const breakdown = applyPurchaseStipends(
      [
        { currencyKey: '0', subtypeKey: null, grossAmount: 200 },
        { currencyKey: 'other', subtypeKey: '1', grossAmount: 200 },
        { currencyKey: '0', subtypeKey: '1', grossAmount: 0 },
      ],
      {
        '0': {
          '1': 500,
        },
      },
    );

    expect(breakdown).toEqual([
      { currencyKey: '0', subtypeKey: null, grossAmount: 200, stipendApplied: 0, netAmount: 200 },
      { currencyKey: 'other', subtypeKey: '1', grossAmount: 200, stipendApplied: 0, netAmount: 200 },
      { currencyKey: '0', subtypeKey: '1', grossAmount: 0, stipendApplied: 0, netAmount: 0 },
    ]);
  });
});
