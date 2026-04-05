import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import {
  buildBranchWorkspace,
  getActiveChainDrawbackBudgetContributions,
  getCurrentJump,
  getEffectiveCurrentJumpState,
  getEffectiveParticipationBudgetState,
} from '../domain/chain/selectors';
import { createDefaultRulesModuleSettings } from '../domain/rules/customization';
import { validateNativeChainBundle } from '../schemas';

describe('workspace selectors', () => {
  function stripParticipationDrawbacks<T extends { drawbacks: unknown[]; retainedDrawbacks: unknown[] }>(participation: T): T {
    return {
      ...participation,
      drawbacks: [],
      retainedDrawbacks: [],
    };
  }

  it('resolves the active branch workspace and current jump from a native bundle', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const workspace = buildBranchWorkspace(session.bundle, session.bundle.chain.activeBranchId);

    expect(workspace.activeBranch?.id).toBe(session.bundle.chain.activeBranchId);
    expect(workspace.jumpers).toHaveLength(1);
    expect(workspace.jumps).toHaveLength(1);
    expect(getCurrentJump(session.bundle.chain, workspace.jumps)?.id).toBe(workspace.jumps[0].id);
  });

  it('computes effective current-jump state from rules context and active rule effects', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const currentJump = session.bundle.jumps[0];
    const now = new Date().toISOString();

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      chain: {
        ...session.bundle.chain,
        activeJumpId: currentJump.id,
      },
      jumpRulesContexts: [
        {
          id: 'rules-test',
          chainId: session.bundle.chain.id,
          branchId,
          jumpId: currentJump.id,
          createdAt: now,
          updatedAt: now,
          gauntlet: false,
          warehouseAccess: 'limited',
          powerAccess: 'manual',
          itemAccess: 'manual',
          altFormAccess: 'limited',
          supplementAccess: 'manual',
          notes: '',
          importSourceMetadata: {},
        },
      ],
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-rule-test',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'jump',
          ownerEntityType: 'jump',
          ownerEntityId: currentJump.id,
          title: 'Rule Override',
          description: '',
          category: 'rule',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            accessOverrides: {
              warehouseAccess: 'full',
              gauntlet: true,
            },
          },
        },
      ],
    });

    const state = getEffectiveCurrentJumpState(buildBranchWorkspace(bundle, branchId));

    expect(state.selectedJumpId).toBe(currentJump.id);
    expect(state.gauntlet).toBe(true);
    expect(state.effectiveAccessModes.warehouseAccess).toBe('full');
    expect(state.effectiveAccessModes.altFormAccess).toBe('limited');
    expect(state.contributingEffects).toHaveLength(1);
  });

  it('falls back to branch rules profile defaults when no jump context exists', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const currentJump = session.bundle.jumps[0];
    const now = new Date().toISOString();
    const baseSettings = createDefaultRulesModuleSettings(true);

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      chain: {
        ...session.bundle.chain,
        activeJumpId: currentJump.id,
      },
      houseRuleProfiles: [
        {
          id: 'house-rules-test',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          title: 'Strict Branch Rules',
          description: 'Testing fallback behavior.',
          settings: {
            ...baseSettings,
            defaults: {
              ...baseSettings.defaults,
              gauntlet: true,
              warehouseAccess: 'limited',
              powerAccess: 'locked',
            },
          },
        },
      ],
      jumpRulesContexts: [],
    });

    const state = getEffectiveCurrentJumpState(buildBranchWorkspace(bundle, branchId));

    expect(state.currentRulesSource).toBe('branch-defaults');
    expect(state.branchRulesProfile?.id).toBe('house-rules-test');
    expect(state.gauntlet).toBe(true);
    expect(state.effectiveAccessModes.warehouseAccess).toBe('limited');
    expect(state.effectiveAccessModes.powerAccess).toBe('locked');
  });

  it('adds active chain drawback rewards into effective participation budgets', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];
    const now = new Date().toISOString();

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: session.bundle.participations.map((participation) => stripParticipationDrawbacks(participation)),
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-drawback-budget',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Chain Budget Tax',
          description: '',
          category: 'drawback',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            value: 300,
            currency: 0,
          },
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(getActiveChainDrawbackBudgetContributions(workspace)).toHaveLength(1);
    expect(budgetState.chainDrawbackBudgetGrants).toEqual({ '0': 300 });
    expect(budgetState.effectiveBudgets['0']).toBe((baseParticipation.budgets['0'] ?? 0) + 300);
  });

  it('adds explicit budget grants from active chain rules into effective participation budgets', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];
    const now = new Date().toISOString();

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: session.bundle.participations.map((participation) => stripParticipationDrawbacks(participation)),
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-rule-budget-grant',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Grant x2',
          description: '',
          category: 'rule',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            altChainBuilderGenerated: true,
            altChainBuilderOptionId: 'grant',
            budgetGrants: {
              '0': 200,
            },
          },
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(getActiveChainDrawbackBudgetContributions(workspace)).toHaveLength(1);
    expect(budgetState.chainDrawbackBudgetGrants).toEqual({ '0': 200 });
    expect(budgetState.effectiveBudgets['0']).toBe((baseParticipation.budgets['0'] ?? 0) + 200);
  });

  it('hides tracked supplement effects when Alt-Chain Builder locks that supplement', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const now = new Date().toISOString();

    const lockedBundle = validateNativeChainBundle({
      ...session.bundle,
      chain: {
        ...session.bundle.chain,
        importSourceMetadata: {
          ...session.bundle.chain.importSourceMetadata,
          altChainBuilder: {
            version: 5,
            enabled: true,
            startingPoint: 'chosen',
            exchangeRate: 'favored',
            selectionCounts: {},
            supplementSelections: {
              iconic: false,
              cosmicBackpack: false,
              threeBoons: false,
              extraSelections: 0,
            },
            notes: '',
            lastSyncedAt: null,
          },
        },
      },
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-three-boons-hidden',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Double CP',
          description: '',
          category: 'rule',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            threeBoonsGenerated: true,
            threeBoonsBoonId: 'double-cp',
            trackedSupplementId: 'three-boons',
          },
        },
      ],
    });

    const unlockedBundle = validateNativeChainBundle({
      ...lockedBundle,
      chain: {
        ...lockedBundle.chain,
        importSourceMetadata: {
          ...lockedBundle.chain.importSourceMetadata,
          altChainBuilder: {
            ...(lockedBundle.chain.importSourceMetadata.altChainBuilder as Record<string, unknown>),
            supplementSelections: {
              iconic: false,
              cosmicBackpack: false,
              threeBoons: true,
              extraSelections: 0,
            },
          },
        },
      },
    });

    expect(buildBranchWorkspace(lockedBundle, branchId).effects.some((effect) => effect.id === 'effect-three-boons-hidden')).toBe(false);
    expect(buildBranchWorkspace(unlockedBundle, branchId).effects.some((effect) => effect.id === 'effect-three-boons-hidden')).toBe(true);
  });

  it('uses imported currency budgets when a participation has no explicit budget overrides', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: [
        stripParticipationDrawbacks({
          ...baseParticipation,
          budgets: {},
        }),
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(budgetState.baseBudgets['0']).toBe(1000);
    expect(budgetState.effectiveBudgets['0']).toBe(1000);
  });

  it('falls back to a default 1000 CP baseline for manual participations with no budget metadata yet', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: [
        stripParticipationDrawbacks({
          ...baseParticipation,
          budgets: {},
          importSourceMetadata: {},
        }),
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(budgetState.baseBudgets).toEqual({ '0': 1000 });
    expect(budgetState.effectiveBudgets).toEqual({ '0': 1000 });
  });

  it('lets explicit drawback budget grants override imported fallback values', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const now = new Date().toISOString();

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-drawback-budget-override',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Explicit Budget Override',
          description: '',
          category: 'drawback',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            value: 900,
            currency: 0,
            budgetGrants: {
              '0': 125,
              bonus: 40,
            },
          },
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const contributions = getActiveChainDrawbackBudgetContributions(workspace);

    expect(contributions).toHaveLength(1);
    expect(contributions[0]?.budgetGrants).toEqual({
      '0': 125,
      bonus: 40,
    });
  });

  it('adds participation drawback value into the effective jump budget', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: [
        {
          ...baseParticipation,
          budgets: {
            '0': 1000,
          },
          drawbacks: [
            {
              name: 'Budget Booster',
              value: 300,
              currency: 0,
            },
          ],
          retainedDrawbacks: [],
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(budgetState.participationDrawbackBudgetGrants).toEqual({ '0': 300 });
    expect(budgetState.effectiveBudgets['0']).toBe(1300);
  });

  it('does not apply chain drawback CP to companions when the chain flag is disabled', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];
    const now = new Date().toISOString();

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const companionId = 'companion-budget-test-disabled';
    const companionParticipationId = 'companion-participation-budget-test-disabled';
    const bundle = validateNativeChainBundle({
      ...session.bundle,
      companions: [
        ...session.bundle.companions,
        {
          id: companionId,
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          name: 'Budget Buddy',
          parentJumperId: session.bundle.jumpers[0]?.id ?? null,
          role: 'Support',
          status: 'active',
          originJumpId: null,
          importSourceMetadata: {},
        },
      ],
      participations: [
        ...session.bundle.participations.map((participation) => stripParticipationDrawbacks(participation)),
      ],
      companionParticipations: [
        ...session.bundle.companionParticipations,
        {
          ...stripParticipationDrawbacks(baseParticipation),
          id: companionParticipationId,
          companionId,
          budgets: {},
          drawbacks: [
            {
              name: 'Companion Jump Drawback',
              value: 100,
              currency: 0,
            },
          ],
          retainedDrawbacks: [],
        },
      ],
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-companion-budget-chain-drawback-disabled',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Companion Chain Drawback',
          description: '',
          category: 'drawback',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            value: 300,
            currency: 0,
          },
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const participation = workspace.participations.find((entry) => entry.id === companionParticipationId) ?? null;
    const budgetState = getEffectiveParticipationBudgetState(workspace, participation);

    expect(workspace.chain.chainSettings.chainDrawbacksForCompanions).toBe(false);
    expect(budgetState.baseBudgets['0']).toBe(800);
    expect(budgetState.chainDrawbackBudgetGrants).toEqual({});
    expect(budgetState.contributingChainDrawbacks).toEqual([]);
    expect(budgetState.participationDrawbackBudgetGrants['0']).toBe(100);
    expect(budgetState.effectiveBudgets['0']).toBe(900);
  });

  it('gives companion participations 80 percent base CP and chain drawback CP when the chain flag is enabled, while jump drawbacks stay full value', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];
    const now = new Date().toISOString();

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const companionId = 'companion-budget-test';
    const companionParticipationId = 'companion-participation-budget-test';
    const bundle = validateNativeChainBundle({
      ...session.bundle,
      chain: {
        ...session.bundle.chain,
        chainSettings: {
          ...session.bundle.chain.chainSettings,
          chainDrawbacksForCompanions: true,
        },
      },
      companions: [
        ...session.bundle.companions,
        {
          id: companionId,
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          name: 'Budget Buddy',
          parentJumperId: session.bundle.jumpers[0]?.id ?? null,
          role: 'Support',
          status: 'active',
          originJumpId: null,
          importSourceMetadata: {},
        },
      ],
      participations: [
        ...session.bundle.participations.map((participation) => stripParticipationDrawbacks(participation)),
      ],
      companionParticipations: [
        ...session.bundle.companionParticipations,
        {
          ...stripParticipationDrawbacks(baseParticipation),
          id: companionParticipationId,
          companionId,
          budgets: {},
          drawbacks: [
            {
              name: 'Companion Jump Drawback',
              value: 100,
              currency: 0,
            },
          ],
          retainedDrawbacks: [],
        },
      ],
      effects: [
        ...session.bundle.effects,
        {
          id: 'effect-companion-budget-chain-drawback',
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          scopeType: 'chain',
          ownerEntityType: 'chain',
          ownerEntityId: session.bundle.chain.id,
          title: 'Companion Chain Drawback',
          description: '',
          category: 'drawback',
          state: 'active',
          sourceEffectId: null,
          importSourceMetadata: {
            value: 300,
            currency: 0,
          },
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const participation = workspace.participations.find((entry) => entry.id === companionParticipationId) ?? null;
    const budgetState = getEffectiveParticipationBudgetState(workspace, participation);

    expect(budgetState.baseBudgets['0']).toBe(800);
    expect(budgetState.chainDrawbackBudgetGrants['0']).toBe(240);
    expect(budgetState.contributingChainDrawbacks).toHaveLength(1);
    expect(budgetState.participationDrawbackBudgetGrants['0']).toBe(100);
    expect(budgetState.effectiveBudgets['0']).toBe(1140);
  });

  it('falls back to an 800 CP baseline for manual companion participations with no budget metadata yet', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];
    const now = new Date().toISOString();

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const companionId = 'companion-fallback-budget-test';
    const companionParticipationId = 'companion-fallback-participation-test';
    const bundle = validateNativeChainBundle({
      ...session.bundle,
      companions: [
        ...session.bundle.companions,
        {
          id: companionId,
          chainId: session.bundle.chain.id,
          branchId,
          createdAt: now,
          updatedAt: now,
          name: 'Fallback Buddy',
          parentJumperId: null,
          role: '',
          status: 'active',
          originJumpId: null,
          importSourceMetadata: {},
        },
      ],
      participations: [
        ...session.bundle.participations.map((participation) => stripParticipationDrawbacks(participation)),
      ],
      companionParticipations: [
        ...session.bundle.companionParticipations,
        {
          ...stripParticipationDrawbacks(baseParticipation),
          id: companionParticipationId,
          companionId,
          budgets: {},
          importSourceMetadata: {},
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const participation = workspace.participations.find((entry) => entry.id === companionParticipationId) ?? null;
    const budgetState = getEffectiveParticipationBudgetState(workspace, participation);

    expect(budgetState.baseBudgets).toEqual({ '0': 800 });
    expect(budgetState.effectiveBudgets).toEqual({ '0': 800 });
  });

  it('supports string-key custom currencies in participation drawback grants', () => {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const branchId = session.bundle.chain.activeBranchId;
    const baseParticipation = session.bundle.participations[0];

    if (!baseParticipation) {
      throw new Error('Expected the sample import to include a participation.');
    }

    const bundle = validateNativeChainBundle({
      ...session.bundle,
      participations: [
        {
          ...baseParticipation,
          budgets: {
            customBudget: 400,
          },
          drawbacks: [
            {
              name: 'Alt Currency Drawback',
              value: 150,
              currency: 'customBudget',
            },
          ],
          retainedDrawbacks: [],
        },
      ],
    });

    const workspace = buildBranchWorkspace(bundle, branchId);
    const budgetState = getEffectiveParticipationBudgetState(workspace, workspace.participations[0] ?? null);

    expect(budgetState.participationDrawbackBudgetGrants).toEqual({ customBudget: 150 });
    expect(budgetState.effectiveBudgets.customBudget).toBe(550);
  });
});
