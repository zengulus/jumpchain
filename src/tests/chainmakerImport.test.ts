import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { CURRENT_SCHEMA_VERSION, NATIVE_FORMAT_VERSION } from '../app/config';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import { detectImportSource } from '../domain/import/sourceDetection';
import { NativeSaveEnvelopeSchema } from '../schemas';

describe('ChainMaker v2 import foundation', () => {
  it('detects the sample as supported ChainMaker v2 JSON', () => {
    const detection = detectImportSource(sampleChainMaker);

    expect(detection.sourceType).toBe('chainmaker-v2');
    expect(detection.sourceVersion).toBe('2.0');
    expect(detection.isSupported).toBe(true);
  });

  it('maps the sample into a typed normalized summary and native bundle', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);

    expect(session.normalized.summary).toEqual({
      chainName: '[untitled chain]',
      jumperCount: 1,
      jumpCount: 1,
      chainDrawbackCount: 0,
      altformCount: 1,
      participationCount: 1,
    });
    expect(session.bundle.jumpers).toHaveLength(1);
    expect(session.bundle.jumps).toHaveLength(1);
    expect(session.bundle.participations).toHaveLength(1);
    expect(session.bundle.bodymodProfiles).toHaveLength(1);
    expect(session.importReport.unresolvedMappings.some((mapping) => mapping.path === 'purchaseCategories')).toBe(
      true,
    );
  });

  it('serializes the generated native bundle into a versioned envelope', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);

    const envelope = NativeSaveEnvelopeSchema.parse({
      formatVersion: NATIVE_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '0.1.0-test',
      chains: [session.bundle],
      metadata: {
        source: 'fixture-test',
      },
    });

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.chains[0].chain.title).toBe('[untitled chain]');
  });

  it('treats malformed payloads as unknown sources', () => {
    const detection = detectImportSource(['not', 'an', 'object']);

    expect(detection.sourceType).toBe('unknown');
    expect(detection.isSupported).toBe(false);
  });

  it('fills safe defaults for partial per-jump character blocks', () => {
    const partialJumpSource = {
      ...sampleChainMaker,
      jumps: {
        ...sampleChainMaker.jumps,
        '0': {
          ...sampleChainMaker.jumps['0'],
          notes: {},
          bankDeposits: {},
          currencyExchanges: {},
          supplementPurchases: {},
          supplementInvestments: {},
          purchases: {},
          retainedDrawbacks: {},
          drawbacks: {},
          drawbackOverrides: {},
          origins: {},
          altForms: {},
          narratives: {},
          budgets: {},
          stipends: {},
        },
      },
    };
    const session = prepareChainMakerV2ImportSession(partialJumpSource);
    const participation = session.bundle.participations[0];

    expect(participation.notes).toBe('');
    expect(participation.bankDeposit).toBe(0);
    expect(participation.purchases).toHaveLength(0);
    expect(participation.drawbacks).toHaveLength(0);
    expect(participation.origins).toEqual({});
  });
});
