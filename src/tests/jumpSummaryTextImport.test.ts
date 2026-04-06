import { describe, expect, it } from 'vitest';
import { prepareJumpSummaryTextImportSession } from '../domain/import/jumpSummaryText';
import { detectImportSource } from '../domain/import/sourceDetection';

const sampleJumpSummaryText = `
Harry Potter (All Mini Jumps):

-------

Budgets:
Starting Budget: 8000 CP

Chain Drawbacks [1000 CP]
Drawbacks [300 CP]:
   - Pesky Pixie (200 CP): It seems a colony of Cornish Pixies have been released onto the grounds.
   - Ministry Hearing (100 CP): The ministry has set a legal hearing against you.

Final Budget: 8300 CP
-------
Origin & Background:
   - Age: 25
   - Gender: Unknown
   - Location: Hogwarts
   - Origin: Drop-In

Total Cost: 0 CP

-------

Purchases:
Perk [100 CP]:
   - Don't say his name! (100 CP [reduced]): Whenever someone says your name or an alias that you have, you will instantly know.

Item [8200 CP]:
   - Hogwarts Castle (8200 CP): You have gained a pocket dimension copy of Hogwarts Castle.
   It includes the grounds and supporting outbuildings.

Total Points Spent: 8300 CP
-------
Remaining Points: 0 CP
`.trim();

describe('jump summary text import', () => {
  it('detects supported jump summary text files', () => {
    const detection = detectImportSource(sampleJumpSummaryText);

    expect(detection.sourceType).toBe('jump-summary-text');
    expect(detection.sourceVersion).toBe('1.0');
    expect(detection.isSupported).toBe(true);
  });

  it('imports purchases as precalculated non-budget-spending selections', () => {
    const session = prepareJumpSummaryTextImportSession(sampleJumpSummaryText, {
      fileName: 'Harry Potter (All Mini Jumps) [Erica].txt',
    });
    const participation = session.bundle.participations[0];
    const purchaseRecords = participation?.purchases as Array<Record<string, unknown>>;
    const drawbackRecords = participation?.drawbacks as Array<Record<string, unknown>>;

    expect(session.bundle.chain.title).toBe('Harry Potter (All Mini Jumps) [Erica]');
    expect(session.bundle.chain.sourceMetadata?.sourceType).toBe('jump-summary-text');
    expect(session.bundle.importReports[0]?.sourceType).toBe('jump-summary-text');
    expect(session.bundle.jumpers[0]?.name).toBe('Erica');
    expect(session.bundle.jumps[0]?.title).toBe('Harry Potter (All Mini Jumps)');
    expect(participation?.status).toBe('active');
    expect(purchaseRecords).toHaveLength(2);
    expect(purchaseRecords.every((record) => record.free === true)).toBe(true);
    expect(purchaseRecords.every((record) => record.discountSource === 'precalculated')).toBe(true);
    expect(purchaseRecords[0]?.value).toBe(100);
    expect(purchaseRecords[1]?.description).toContain('supporting outbuildings');
    expect(drawbackRecords).toHaveLength(2);
    expect(drawbackRecords.every((record) => record.free === true)).toBe(true);
    expect(participation?.origins).toMatchObject({
      '0': { summary: '25' },
      '1': { summary: 'Unknown' },
      '2': { summary: 'Hogwarts' },
      '3': { summary: 'Drop-In' },
    });
    expect((participation?.importSourceMetadata as Record<string, unknown>).currencies).toMatchObject({
      '0': {
        name: 'Choice Points',
        abbrev: 'CP',
        budget: 0,
      },
    });
    expect(session.importReport.preservedSourceSummary).toMatchObject({
      purchaseCount: 2,
      drawbackCount: 2,
      originCount: 4,
      remainingPoints: 0,
    });
    expect(
      session.normalized.unresolvedMappings.some(
        (mapping) =>
          mapping.path === 'participations.0.purchases' &&
          mapping.reason.includes('normalized to not spend budget'),
      ),
    ).toBe(true);
  });
});
