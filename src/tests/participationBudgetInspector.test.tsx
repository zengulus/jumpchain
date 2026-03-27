import { render, screen } from '@testing-library/react';
import { buildBranchWorkspace } from '../domain/chain/selectors';
import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import { ParticipationBudgetInspector, ParticipationBudgetShellAttachment } from '../features/participation/ParticipationPage';
import sampleChainMaker from '../fixtures/chainmaker/chainmaker-v2.sample.json';

describe('participation budget inspector', () => {
  function createLegacyStipendWorkspace() {
    const session = prepareChainMakerV2ImportSession(sampleChainMaker);
    const bundle = {
      ...session.bundle,
      participations: session.bundle.participations.map((participation, index) =>
        index === 0
          ? {
              ...participation,
              purchases: [
                {
                  name: 'Legacy Item',
                  value: 200,
                  currency: 0,
                  costModifier: 0,
                  purchaseValue: 0,
                  purchaseType: 1,
                  subtype: 1,
                },
              ],
              drawbacks: [],
              retainedDrawbacks: [],
              origins: {},
              budgets: { '0': 1000 },
              stipends: {
                '0': {
                  '1': 100,
                },
              },
              bankDeposit: 0,
              currencyExchanges: [],
            }
          : participation,
      ),
    };
    const workspace = buildBranchWorkspace(bundle, bundle.chain.activeBranchId);
    const participation = workspace.participations[0];

    if (!participation) {
      throw new Error('Expected a participation in the sample workspace.');
    }

    const jumper = workspace.jumpers.find((entry) => entry.id === participation.jumperId);

    if (!jumper) {
      throw new Error('Expected the participation jumper to be present.');
    }

    return {
      workspace,
      participation,
      jumper,
      jump: workspace.jumps[0],
    };
  }

  it('applies stipends to legacy purchases that carry a stale zero purchaseValue', () => {
    const { workspace, participation, jumper } = createLegacyStipendWorkspace();

    render(
      <ParticipationBudgetInspector
        participant={{ id: jumper.id, name: jumper.name, kind: 'jumper' }}
        participation={participation}
        workspace={workspace}
      />,
    );

    expect(screen.getByText('Choice Points (CP): 900 left')).toBeTruthy();
    expect(screen.getByText(/100 covered by stipends first/)).toBeTruthy();
  });

  it('shows the active stipend note in the purchases budget shell', () => {
    const { workspace, participation, jumper, jump } = createLegacyStipendWorkspace();

    if (!jump) {
      throw new Error('Expected a jump in the sample workspace.');
    }

    render(
      <ParticipationBudgetShellAttachment
        jump={jump}
        participant={{ id: jumper.id, name: jumper.name, kind: 'jumper' }}
        participation={participation}
        workspace={workspace}
      />,
    );

    expect(screen.getByText(/Stipends apply before the main budget:/)).toBeTruthy();
    expect(screen.getByText(/Items stipend: 100 Choice Points \(CP\)/)).toBeTruthy();
  });
});
