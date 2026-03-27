export interface SetupGuideStep {
  title: string;
  description: string;
  note?: string;
}

export interface SetupGuide {
  title: string;
  summary: string;
  steps: SetupGuideStep[];
}

export const iconicSetupGuide: SetupGuide = {
  title: 'Iconic walkthrough',
  summary:
    'Use Iconic to preserve what makes the jumper recognisable when the chain strips things down hard.',
  steps: [
    {
      title: 'Pick the jumper and create the profile',
      description:
        'Iconic belongs to a specific jumper. Start by focusing the right jumper, then create the Iconic profile if one does not exist yet.',
      note: 'If the jumper already has a profile, the goal is refinement rather than starting over.',
    },
    {
      title: 'Choose the tier that matches the concept',
      description:
        'Use Central Gimmick for one defining impossible thing, Suite for a compact signature package, and Baseline for a broader enduring foundation.',
      note: 'The tier is about how much of the concept needs to stay recognisable, not about raw power for its own sake.',
    },
    {
      title: 'Write the concept in plain language',
      description:
        'Fill in the concept summary and notes first. That gives you a clear standard to judge the package against before you touch the slots.',
      note: 'If a slot does not help the character stay themselves, it probably does not belong in Iconic.',
    },
    {
      title: 'Fill the preserved package',
      description:
        'Use the package slots for the perks, powers, and items that the character stops feeling like themselves without.',
      note: 'Think identity first, then mechanics.',
    },
  ],
};

export const personalRealitySetupGuide: SetupGuide = {
  title: 'Personal Reality walkthrough',
  summary:
    'Use Personal Reality when you want to plan the warehouse-style supplement itself, not just the jumper standing inside it.',
  steps: [
    {
      title: 'Start with pages 2 and 3',
      description:
        'Pick one core mode first, because that choice decides how the whole supplement budgets and grows.',
      note: 'Extra modes only modify the chosen core mode. They do not replace it.',
    },
    {
      title: 'Set the live budget inputs',
      description:
        'Record completed jumps, delayed adoption, transfers, discounts, or any other budget details that actually apply to this chain.',
      note: 'Getting the ledger right first makes the later pages much less confusing.',
    },
    {
      title: 'Move page by page instead of all at once',
      description:
        'Treat the builder like a guided worksheet. Work through facilities, logistics, and limitations in the order the supplement presents them.',
      note: 'You do not need to understand every page before starting. The structure is meant to carry you.',
    },
    {
      title: 'Use the worksheet as the source of truth',
      description:
        'Track purchases, repeatables, and notes directly in the builder so the budget summary stays useful.',
      note: 'When something feels interpretive, leave yourself a note right there rather than trying to remember it later.',
    },
  ],
};

export const cosmicBackpackSetupGuide: SetupGuide = {
  title: 'Cosmic Backpack walkthrough',
  summary:
    'Use Cosmic Backpack when you want a warehouse alternative that stays portable, short, and easy to reason about.',
  steps: [
    {
      title: 'Start with the free bag',
      description:
        'The base bag is already useful. Treat it as your default storage and only add upgrades when they solve a real problem for the chain.',
      note: 'You do not need to spend the full 1000 BP for the supplement to be worth taking.',
    },
    {
      title: 'Pick the conveniences you will actually use',
      description:
        'Core upgrades like Hammerspace, Stasis, or Adaptive Storage matter most when they remove friction from normal play.',
      note: 'If a feature sounds neat but would not come up often, it can wait.',
    },
    {
      title: 'Add attachments like a portable base camp',
      description:
        'Shelter, utilities, and support tools are easier to judge when you ask what you would want on hand every jump.',
      note: 'Magic Tent, Plumbing, Food Supply, and Crafting Tools make a strong low-complexity package.',
    },
    {
      title: 'Treat the warehouse-compression modifiers as built in',
      description:
        'Everything’s an Item and If You Can’t Hold It are assumed on this workspace so warehouse add-ons from any supplement can collapse into portable forms and be bought with Backpack BP.',
      note: 'That keeps cross-supplement warehouse purchases on one BP budget instead of splitting them across separate planners.',
    },
  ],
};

export function SetupGuidePanels(props: { guide: SetupGuide }) {
  return (
    <div className="selection-editor-list">
      {props.guide.steps.map((step, index) => (
        <article className="selection-editor" key={`${props.guide.title}-${step.title}`}>
          <div className="selection-editor__header">
            <div className="stack stack--compact">
              <strong>
                {index + 1}. {step.title}
              </strong>
              <p className="editor-section__copy">{step.description}</p>
            </div>
            <span className="pill pill--soft">Step {index + 1}</span>
          </div>
          {step.note ? <p className="editor-section__copy">{step.note}</p> : null}
        </article>
      ))}
    </div>
  );
}
