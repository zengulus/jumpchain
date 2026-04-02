export interface ThreeBoonsOption {
  id: string;
  number: number;
  title: string;
  description: string;
  note?: string;
  repeatable?: boolean;
  maxSelections?: number;
  rollOnly?: boolean;
  extraRolls?: number;
}

function boon(
  number: number,
  id: string,
  title: string,
  description: string,
  extras: Pick<Partial<ThreeBoonsOption>, 'note' | 'repeatable' | 'maxSelections' | 'rollOnly' | 'extraRolls'> = {},
): ThreeBoonsOption {
  return {
    id,
    number,
    title,
    description,
    ...extras,
  };
}

export const threeBoonsCatalog: ThreeBoonsOption[] = [
  boon(
    1,
    'multiplayer-chain',
    'Multiplayer Chain',
    'Grant another person full jumper status so they can travel the chain with the same baseline privileges and the same boons you chose here, except for this boon.',
    { note: 'You still control where the chain goes unless the source says otherwise. May be taken up to three times.', maxSelections: 3 },
  ),
  boon(
    2,
    'maximum-rewards',
    'Maximum Rewards',
    'Start each jump with the document’s full drawback CP cap already banked, or 800 extra CP when the jump has no stated drawback limit.',
    {
      note: 'Gauntlets use half their maximum drawback payout or 400 CP if no cap is listed. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    3,
    'drawback-booster',
    'Drawback Booster',
    'Double drawback payouts, stacking multiplicatively if you take the boon again.',
    {
      note: 'Does not change the payout from Maximum Rewards, and drawback caps still use the base listed value. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    4,
    'broken-limiter',
    'Broken Limiter',
    'Remove normal perk and power caps below Spark-tier, remove diminishing returns between overlapping perks, and let built-in self-destructive side effects be trained away over time.',
  ),
  boon(5, 'one-free', 'One Free', 'In every jump you may pick one perk or item purchase and receive it for free.'),
  boon(
    6,
    'body-modding-dream',
    'Body Modding Dream',
    'Once per jump, buy one perk or item at double its undiscounted cost to add it to the Bodymod.',
    {
      note: 'Items added this way stay available in gauntlets and item lock-down but do not become literal body parts. Free options cost 50 CP. Cannot be combined with One Free.',
    },
  ),
  boon(
    7,
    'eternal-empire',
    'Eternal Empire',
    'Gain an ever-expanding pocket domain that absorbs every territory, building, and landholding you acquire, even when they were not purchased with CP.',
  ),
  boon(
    8,
    'the-conqueror',
    'The Conqueror',
    'Once per jump, after defeating a great foe, you may claim everything they own, including powers, possessions, and broader holdings.',
    { note: 'May be taken up to three times.', maxSelections: 3 },
  ),
  boon(
    9,
    'purchase-heaven',
    'Purchase Heaven',
    'Buy the same perk or item multiple times and let the copies stack naturally when that makes sense.',
    {
      note: 'Each purchase doubles how many times a perk or item can be rebought through this boon. Original discounts still apply to repeat purchases. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    10,
    'friendly-friends',
    'Friendly Friends',
    'Give the chain effectively infinite companion imports, make companion options free, and grant imported companions an extra CP stipend.',
    {
      note: 'The extra stipend starts at 400 CP above the highest in-jump import stipend, or 800 CP if the jump has no import stipend. Each extra purchase doubles that boon-granted stipend. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    11,
    'temporal-distortion-room',
    'Temporal Distortion Room',
    'Open a portal to a controllable training pocket world where time flows at one year inside for every day outside.',
    {
      note: 'The environment is fully configurable, built structures persist, and later purchases double the time ratio. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    12,
    'origin-boon',
    'Origin Boon',
    'Take a second origin and keep its benefits without being forced to take its baggage unless you want to.',
    {
      note: 'Purely racial lists are excluded unless the race is literally the origin with its own discounts. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    13,
    'instant-craft',
    'Instant Craft',
    'Sacrifice appropriate raw resources to instantly produce units, creatures, or goods as long as you have facilities that could make them.',
    { note: 'Buildings take about a minute and also consume construction tools.' },
  ),
  boon(
    14,
    'dyson-jumper',
    'Dyson Jumper',
    'Gain the supernatural energy output equivalent of three Dyson spheres and split that output across up to three energy systems you have encountered.',
    {
      note: 'You can also route the output into nearby devices or dedicate one sphere-equivalent to a Matrioshka Brain. May be taken up to two times.',
      maxSelections: 2,
    },
  ),
  boon(
    15,
    'unlimited-hub-works',
    'Unlimited Hub Works',
    'Create an inter-jump hub that can load multiple jumps at once so their settings remain available in parallel.',
    {
      note: 'The first purchase loads up to four jumps. Each extra purchase doubles that limit. May be taken up to three times.',
      maxSelections: 3,
    },
  ),
  boon(
    16,
    'alt-form-continuity',
    'Alt-Form Continuity',
    'Enter later jumps as a species you already have as an alt-form, or add the new species benefits on top of the existing form.',
  ),
  boon(
    17,
    'savings-boon',
    'Savings Boon',
    'Carry unused CP forward into later jumps through a savings account.',
    { note: 'Each extra purchase makes the saved pool duplicate itself once at the end of every jump.', repeatable: true },
  ),
  boon(
    18,
    'investment-firm',
    'Investment Firm',
    'Sacrifice starting CP in chunks of 200 to create a standing investment that pays back half that amount every future jump.',
    {
      note: 'If you invest more than your starting CP, the difference must be covered by drawbacks every jump. Gauntlets do not generate investment returns.',
    },
  ),
  boon(
    19,
    'boost-one',
    'Boost One',
    'Pick one perk, one item, one learned power, and one extra floating pick among those categories, then break every listed limit on them.',
  ),
  boon(
    20,
    'harmonious',
    'Harmonious',
    'Build Generic First Jump without setting choices and add that build to the Bodymod, while also gaining Harmony for free.',
    { note: 'This boon sets the stipend to 2000 CP.' },
  ),
  boon(
    21,
    'all-your-bases',
    'All Your Bases',
    'Gain Personal Reality at the +200% stipend level even if you are already using another warehouse-style supplement.',
    { note: 'It stacks with other warehouse supplements instead of replacing them.' },
  ),
  boon(
    22,
    'bodymod-plus',
    'Bodymod+',
    'Take the Bodymod twice, either as two different supplements or as two passes through the same document.',
    { note: 'You also gain a 50% boost to the supplement points those Bodymod supplements grant.' },
  ),
  boon(
    23,
    'frontload',
    'Frontload',
    'Spend a 3000 CP stipend on perks and items from any documents and add them to your Bodymod, as long as each base price stays at 600 CP or below and the power level stays under Piccolo Jr. Saga Goku.',
    { note: 'Free perks or items cost 50 CP, and alt-form options become transformations.' },
  ),
  boon(
    24,
    'universal-supplement',
    'Universal Supplement',
    'Attach any jump or supplement to any other jump once per jump for each purchase of this boon.',
    { note: 'The source explicitly says there is no roll-side cap on how many times this can be gained.', repeatable: true },
  ),
  boon(
    25,
    'drawback-import',
    'Drawback Import',
    'Mail-order drawbacks from visited jumps or related settings into the current jump as long as they can be explained in-setting and do not depend on named outside characters.',
  ),
  boon(
    26,
    'first-jump-bodymod',
    'First Jump Bodymod',
    'Make your first jump become part of the Bodymod, or apply this to the second jump if the first already does that.',
    { note: 'Roll only.', rollOnly: true },
  ),
  boon(
    27,
    'for-the-long-haul',
    'For the Long-Haul',
    'Failing or dying in a jump kicks you out without that jump’s gains instead of ending the chain outright, and you can retry old jumps later in fresh timelines.',
    { note: 'Roll only.', rollOnly: true },
  ),
  boon(
    28,
    'double-cp',
    'Double CP',
    'Double the jump’s starting CP, or double Universal Drawback Supplement gains in gauntlets that would otherwise grant no starting CP.',
    { note: 'Roll only. May be obtained up to two times.', rollOnly: true, maxSelections: 2 },
  ),
  boon(
    29,
    'another-boon',
    'Another Boon',
    'Gain two additional boon rolls.',
    { note: 'Roll only. May be obtained up to two times.', rollOnly: true, maxSelections: 2, extraRolls: 2 },
  ),
  boon(
    30,
    'double-the-extra-boons',
    'Double the Extra Boons',
    'Gain three additional boon rolls.',
    { note: 'Roll only. May be obtained up to two times.', rollOnly: true, maxSelections: 2, extraRolls: 3 },
  ),
];

export const threeBoonsOptionsById = Object.fromEntries(
  threeBoonsCatalog.map((entry) => [entry.id, entry]),
) as Record<string, ThreeBoonsOption>;

export const threeBoonsOptionsByNumber = Object.fromEntries(
  threeBoonsCatalog.map((entry) => [entry.number, entry]),
) as Record<number, ThreeBoonsOption>;

export function isThreeBoonsOptionRepeatable(option: ThreeBoonsOption | undefined) {
  if (!option) {
    return false;
  }

  return option.repeatable === true || (typeof option.maxSelections === 'number' && option.maxSelections > 1);
}

export function getThreeBoonsSelectionLimit(option: ThreeBoonsOption | undefined, allowRollOnly = true) {
  if (!option) {
    return 1;
  }

  if (!allowRollOnly && option.rollOnly) {
    return 0;
  }

  if (typeof option.maxSelections === 'number' && Number.isFinite(option.maxSelections)) {
    return option.maxSelections;
  }

  return isThreeBoonsOptionRepeatable(option) ? undefined : 1;
}
