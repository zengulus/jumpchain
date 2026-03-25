import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import { buildBranchWorkspace, getCurrentJump, getEffectiveCurrentJumpState } from '../domain/chain/selectors';
import { createDefaultRulesModuleSettings } from '../domain/rules/customization';
import { validateNativeChainBundle } from '../schemas';

describe('workspace selectors', () => {
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
});
