import { describe, expect, it } from 'vitest';
import type { Chain } from '../domain/chain/types';
import type { Branch } from '../domain/branch/types';
import type { NativeChainBundle } from '../domain/save';
import { buildUniversalSearchResults, matchesSearchQuery } from '../features/search/searchUtils';

const now = '2026-03-26T00:00:00.000Z';

function createChain(id: string, title: string): Chain {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title,
    schemaVersion: 1,
    formatVersion: 'test',
    activeBranchId: `${id}-branch`,
    activeJumpId: `${id}-jump`,
    chainSettings: {
      chainDrawbacksForCompanions: false,
      chainDrawbacksSupplements: true,
      narratives: 'enabled',
      altForms: true,
    },
    bankSettings: {
      enabled: false,
      maxDeposit: 0,
      depositRatio: 0,
      interestRate: 0,
    },
    importSourceMetadata: {
      cosmicBackpack: {
        notes: 'Garage-ready loadout with a mobile workshop and shelter.',
        appearanceNotes: 'Dark canvas backpack with archive pins.',
        customUpgrades: [
          {
            id: 'garage-annex',
            title: 'Garage Annex',
            costBp: 75,
            addedVolumeFt3: 1500,
            volumeMultiplier: 1,
            notes: 'Fold-out garage workspace for cross-supplement warehouse tools.',
          },
        ],
      },
    },
  };
}

function createBranch(chainId: string, title: string): Branch {
  return {
    id: `${chainId}-branch`,
    chainId,
    title,
    sourceBranchId: null,
    forkedFromJumpId: null,
    isActive: true,
    notes: `${title} branch notes`,
    createdAt: now,
    updatedAt: now,
  };
}

function createBundle(chainId: string, title: string): NativeChainBundle {
  const chain = createChain(chainId, title);
  const branch = createBranch(chainId, `${title} Mainline`);

  return {
    chain,
    branches: [branch],
    jumpers: [
      {
        id: `${chainId}-jumper`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        name: 'Avery Archivist',
        isPrimary: true,
        gender: 'nonbinary',
        originalAge: 27,
        notes: 'Keeps the archive in perfect order.',
        originalFormSourceId: null,
        personality: {
          personality: 'Calm and methodical',
          motivation: 'Preserve every continuity thread.',
          likes: 'Quiet vaults',
          dislikes: 'Data loss',
          quirks: 'Labels everything',
        },
        background: {
          summary: 'Historian of impossible worlds',
          description: 'Started as a record-keeper before the first jump.',
        },
        importSourceMetadata: {},
      },
    ],
    companions: [
      {
        id: `${chainId}-companion`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        name: 'Mira Garagehand',
        parentJumperId: `${chainId}-jumper`,
        role: 'Mechanic',
        status: 'active',
        originJumpId: `${chainId}-jump`,
        importSourceMetadata: {},
      },
    ],
    jumps: [
      {
        id: `${chainId}-jump`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        title: 'Archive City',
        orderIndex: 0,
        status: 'current',
        jumpType: 'standard',
        duration: {
          years: 10,
          months: 0,
          days: 0,
        },
        participantJumperIds: [`${chainId}-jumper`],
        sourceJumpId: null,
        importSourceMetadata: {},
      },
    ],
    participations: [
      {
        id: `${chainId}-participation`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        jumpId: `${chainId}-jump`,
        jumperId: `${chainId}-jumper`,
        status: 'active',
        notes: 'Keeps a live expedition log.',
        purchases: [
          {
            name: 'Garage Drone',
            summary: 'Garage Drone',
            description: 'Mobile repair assistant for workshop and convoy maintenance.',
            tags: ['garage', 'drone', 'support'],
            purchaseType: 1,
            subtype: 1,
            selectionKind: 'purchase',
          },
          {
            name: 'Archive Hack',
            summary: 'Archive Hack',
            description: 'Modular archive interface and utility rig.',
            tags: ['archive', 'utility'],
            purchaseType: 0,
            subtype: 10,
            selectionKind: 'purchase',
          },
        ],
        drawbacks: [],
        retainedDrawbacks: [],
        origins: {},
        budgets: { '0': 1000 },
        stipends: {},
        narratives: {
          accomplishments: 'Recovered the lost catalog.',
          challenges: '',
          goals: 'Restore the library network.',
        },
        altForms: [
          {
            name: 'Courier Raven',
            source: 'Feather cloak',
            notes: 'Fast messenger form for archive districts and rooftop travel.',
          },
        ],
        bankDeposit: 0,
        currencyExchanges: [],
        supplementPurchases: {},
        supplementInvestments: {},
        drawbackOverrides: {},
        importSourceMetadata: {
          purchaseSubtypes: {
            '0': { name: 'Perk', type: 0, essential: true },
            '1': { name: 'Item', type: 1, essential: true },
            '10': { name: 'Power', type: 0, essential: false },
          },
        },
      },
    ],
    effects: [
      {
        id: `${chainId}-effect`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        scopeType: 'jumper',
        ownerEntityType: 'jumper',
        ownerEntityId: `${chainId}-jumper`,
        title: 'Echo Shield',
        description: 'A resonant ward that protects the archive vault.',
        category: 'perk',
        state: 'active',
        sourceEffectId: null,
        importSourceMetadata: {},
      },
    ],
    bodymodProfiles: [],
    jumpRulesContexts: [],
    houseRuleProfiles: [],
    presetProfiles: [],
    snapshots: [
      {
        id: `${chainId}-snapshot`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        title: 'Garage Checkpoint',
        description: 'Snapshot taken before expanding the garage wing.',
        createdFromJumpId: `${chainId}-jump`,
        payloadJson: '{}',
        summary: {
          jumpCount: 1,
          jumperCount: 1,
          effectCount: 1,
        },
      },
    ],
    notes: [
      {
        id: `${chainId}-note`,
        chainId,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        scopeType: 'chain',
        ownerEntityType: 'chain',
        ownerEntityId: chainId,
        noteType: 'chain',
        title: 'Vault Ledger',
        content: 'Archive intake and garage staging notes.',
        tags: ['archive', 'garage'],
      },
    ],
    attachments: [],
    importReports: [],
  };
}

describe('search utilities', () => {
  it('matches across combined text fields', () => {
    expect(matchesSearchQuery('archive vault', 'Echo Shield', 'Protects the archive vault')).toBe(true);
    expect(matchesSearchQuery('archive vault', 'Echo Shield', 'Protects the garage')).toBe(false);
  });

  it('builds routed results for active-branch records', () => {
    const bundle = createBundle('chain-alpha', 'Alpha Chain');
    const results = buildUniversalSearchResults({
      query: 'garage',
      overviews: [
        {
          chainId: bundle.chain.id,
          title: bundle.chain.title,
          updatedAt: now,
          activeBranchId: bundle.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [bundle],
      preferredChainId: bundle.chain.id,
    });

    expect(results.some((result) => result.kind === 'snapshot' && result.to.includes('/backups?snapshot='))).toBe(true);
    expect(results.some((result) => result.kind === 'note' && result.to.includes('/notes?note='))).toBe(true);
    expect(results.some((result) => result.kind === 'cosmic-backpack' && result.to.includes('/cosmic-backpack'))).toBe(true);
  });

  it('only adds static cosmic backpack catalog results for the preferred chain', () => {
    const alpha = createBundle('chain-alpha', 'Alpha Chain');
    const beta = createBundle('chain-beta', 'Beta Chain');

    const withoutPreference = buildUniversalSearchResults({
      query: 'hammerspace',
      overviews: [
        {
          chainId: alpha.chain.id,
          title: alpha.chain.title,
          updatedAt: now,
          activeBranchId: alpha.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
        {
          chainId: beta.chain.id,
          title: beta.chain.title,
          updatedAt: now,
          activeBranchId: beta.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [alpha, beta],
    });

    const withPreference = buildUniversalSearchResults({
      query: 'hammerspace',
      overviews: [
        {
          chainId: alpha.chain.id,
          title: alpha.chain.title,
          updatedAt: now,
          activeBranchId: alpha.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
        {
          chainId: beta.chain.id,
          title: beta.chain.title,
          updatedAt: now,
          activeBranchId: beta.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [alpha, beta],
      preferredChainId: alpha.chain.id,
    });

    expect(withoutPreference.some((result) => result.kind === 'cosmic-backpack' && result.title.toLowerCase().includes('hammerspace'))).toBe(false);
    expect(withPreference.some((result) => result.kind === 'cosmic-backpack' && result.title.toLowerCase().includes('hammerspace'))).toBe(true);
  });

  it('surfaces custom cosmic backpack upgrades in search results', () => {
    const bundle = createBundle('chain-alpha', 'Alpha Chain');
    const results = buildUniversalSearchResults({
      query: 'garage annex',
      overviews: [
        {
          chainId: bundle.chain.id,
          title: bundle.chain.title,
          updatedAt: now,
          activeBranchId: bundle.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [bundle],
      preferredChainId: bundle.chain.id,
    });

    expect(results.some((result) => result.kind === 'cosmic-backpack' && result.title === 'Garage Annex')).toBe(true);
  });

  it('builds tagged selection cards and alt-form cards for participation data', () => {
    const bundle = createBundle('chain-alpha', 'Alpha Chain');

    const taggedSelectionResults = buildUniversalSearchResults({
      query: 'garage drone',
      overviews: [
        {
          chainId: bundle.chain.id,
          title: bundle.chain.title,
          updatedAt: now,
          activeBranchId: bundle.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [bundle],
      preferredChainId: bundle.chain.id,
    });

    expect(
      taggedSelectionResults.some(
        (result) =>
          result.kind === 'selection' &&
          result.title === 'Garage Drone' &&
          result.tags.includes('garage') &&
          result.to.includes('participationTab=items'),
      ),
    ).toBe(true);

    const altFormResults = buildUniversalSearchResults({
      query: 'courier raven',
      overviews: [
        {
          chainId: bundle.chain.id,
          title: bundle.chain.title,
          updatedAt: now,
          activeBranchId: bundle.chain.activeBranchId,
          jumperCount: 1,
          jumpCount: 1,
          importReportCount: 0,
        },
      ],
      bundles: [bundle],
      preferredChainId: bundle.chain.id,
    });

    expect(
      altFormResults.some(
        (result) =>
          result.kind === 'alt-form' &&
          result.title === 'Courier Raven' &&
          result.to.includes('participationTab=alt-forms'),
      ),
    ).toBe(true);
  });
});
