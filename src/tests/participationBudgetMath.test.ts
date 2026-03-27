import { applyPurchaseStipends } from '../features/participation/budgetMath';

describe('participation budget math', () => {
  it('applies stipends against matching subtype purchases in order', () => {
    const breakdown = applyPurchaseStipends(
      [
        { sectionKey: 'item', grossAmount: 300 },
        { sectionKey: 'item', grossAmount: 200 },
        { sectionKey: 'subsystem', grossAmount: 150 },
      ],
      {
        item: 400,
        subsystem: 50,
      },
    );

    expect(breakdown).toEqual([
      { sectionKey: 'item', grossAmount: 300, stipendApplied: 300, netAmount: 0 },
      { sectionKey: 'item', grossAmount: 200, stipendApplied: 100, netAmount: 100 },
      { sectionKey: 'subsystem', grossAmount: 150, stipendApplied: 50, netAmount: 100 },
    ]);
  });

  it('ignores stipends for unmatched sections and non-positive spend', () => {
    const breakdown = applyPurchaseStipends(
      [
        { sectionKey: 'perk', grossAmount: 200 },
        { sectionKey: 'other', grossAmount: 200 },
        { sectionKey: 'item', grossAmount: 0 },
      ],
      {
        item: 500,
      },
    );

    expect(breakdown).toEqual([
      { sectionKey: 'perk', grossAmount: 200, stipendApplied: 0, netAmount: 200 },
      { sectionKey: 'other', grossAmount: 200, stipendApplied: 0, netAmount: 200 },
      { sectionKey: 'item', grossAmount: 0, stipendApplied: 0, netAmount: 0 },
    ]);
  });
});
