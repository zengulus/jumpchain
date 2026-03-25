import ericaAndAshlyn from '../fixtures/chainmaker/erica-and-ashlyn.sample.json';
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
    expect(session.importReport.unresolvedMappings.some((mapping) => mapping.path === 'topLevelPreservedBlocks')).toBe(
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

  it('cleans dirty ChainMaker fields before DTO validation', () => {
    const dirtyJump = { ...sampleChainMaker.jumps['0'] } as Record<string, unknown>;

    delete dirtyJump.notes;
    delete dirtyJump.bankDeposits;
    delete dirtyJump.drawbacks;
    delete dirtyJump.purchases;
    delete dirtyJump.useNarratives;

    const dirtySource = {
      ...sampleChainMaker,
      characterList: 'not-an-array',
      characters: {
        ...sampleChainMaker.characters,
        '0': {
          ...sampleChainMaker.characters['0'],
          originalAge: ' 19 ',
        },
      },
      jumps: {
        ...sampleChainMaker.jumps,
        '0': dirtyJump,
      },
    };
    const session = prepareChainMakerV2ImportSession(dirtySource);

    expect(session.cleaning.changes.some((change) => change.path === 'characters.0.originalAge')).toBe(true);
    expect(session.cleaning.changes.some((change) => change.path === 'characterList')).toBe(true);
    expect(session.cleaning.changes.some((change) => change.path === 'jumps.0.notes')).toBe(true);
    expect(session.cleaning.changes.some((change) => change.path === 'jumps.0.useNarratives')).toBe(true);
    expect(session.bundle.jumpers[0]?.originalAge).toBe(19);
    expect(session.bundle.participations[0]?.drawbacks).toEqual([]);
    expect(session.normalized.warnings[0]?.code).toBe('chainmaker_cleaner_applied');
    expect(session.importReport.preservedSourceSummary.cleanerChangeCount).toBe(session.cleaning.changes.length);
  });

  it('comfortably imports the Erica and Ashlyn ChainMaker export', () => {
    const detection = detectImportSource(ericaAndAshlyn);
    const session = prepareChainMakerV2ImportSession(ericaAndAshlyn);
    const ashlyn = session.bundle.jumpers.find((jumper) => jumper.name === 'Ashlyn');
    const mackenzie = session.bundle.jumpers.find((jumper) => jumper.name === 'Mackenzie');
    const kaspar = session.bundle.jumpers.find((jumper) => jumper.name === 'Kaspar');
    const importedSelectionNames = session.bundle.participations.flatMap((participation) =>
      participation.purchases.map((purchase) => {
        if (typeof purchase === 'object' && purchase !== null && 'name' in purchase && typeof purchase.name === 'string') {
          return purchase.name;
        }

        return '';
      }),
    );

    expect(detection.sourceType).toBe('chainmaker-v2');
    expect(detection.sourceVersion).toBe('2.0');
    expect(detection.isSupported).toBe(true);
    expect(session.normalized.summary).toEqual({
      chainName: 'Erica & Ashlyn',
      jumperCount: 4,
      jumpCount: 4,
      chainDrawbackCount: 1,
      altformCount: 4,
      participationCount: 9,
    });
    expect(session.importReport.preservedSourceSummary.purchaseCatalogCount).toBe(207);
    expect(session.cleaning.changes.some((change) => change.path === 'characters.1.originalAge')).toBe(true);
    expect(session.cleaning.changes.some((change) => change.path === 'characters.3.originalAge')).toBe(true);
    expect(ashlyn?.originalAge).toBe(20);
    expect(kaspar?.originalAge).toBe(25);
    expect(mackenzie?.originalAge).toBeNull();
    expect(mackenzie?.importSourceMetadata.originalAgeRaw).toBe('Mysterious');
    expect(session.bundle.effects[0]?.title).toBe('Power Cap');
    expect(importedSelectionNames).toContain('Gotta Read’em All!');
    expect(importedSelectionNames).toContain('Dragon Tongue');
  });
});
