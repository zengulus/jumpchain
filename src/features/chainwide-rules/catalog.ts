export type AltChainBuilderOptionKind = 'accommodation' | 'complication';
export type AltChainBuilderOptionGroup = 'chain' | 'fiat' | 'companions' | 'choice-points';

export interface AltChainBuilderOption {
  id: string;
  title: string;
  kind: AltChainBuilderOptionKind;
  group: AltChainBuilderOptionGroup;
  description: string;
  note?: string;
  repeatable?: boolean;
  maxSelections?: number;
}

function option(
  id: string,
  title: string,
  kind: AltChainBuilderOptionKind,
  group: AltChainBuilderOptionGroup,
  description: string,
  extras: Pick<Partial<AltChainBuilderOption>, 'note' | 'repeatable' | 'maxSelections'> = {},
): AltChainBuilderOption {
  return {
    id,
    title,
    kind,
    group,
    description,
    ...extras,
  };
}

export const ALT_CHAIN_OPTION_GROUP_LABELS: Record<AltChainBuilderOptionGroup, string> = {
  chain: 'Chain',
  fiat: 'Fiat',
  companions: 'Companions',
  'choice-points': 'Choice Points',
};

export const altChainBuilderOptionCatalog: AltChainBuilderOption[] = [
  option('braving-the-gauntlets', 'Braving the Gauntlets', 'accommodation', 'chain', 'Treat gauntlets as reward-bearing challenge runs without normal CP shopping and without chain-failing on death.'),
  option('death-is-not-the-end', 'Death is Not the End', 'accommodation', 'chain', 'If the jumper dies or otherwise ends the chain, they go home with what they earned instead of simply losing everything.'),
  option('going-native', 'Going Native', 'accommodation', 'chain', 'Let the jumper stay in a setting they want to call home and voluntarily end the chain there.'),
  option('homesick', 'Homesick', 'accommodation', 'chain', 'At the end of each jump the jumper may choose to go home for good with everything collected so far.'),
  option('look-before-you-jump', 'Look Before You Jump', 'accommodation', 'chain', 'Let the jumper choose the next jump instead of being sent somewhere blindly.'),
  option('nothing-happened-while-you-were-out', 'Nothing Happened While You Were Out', 'accommodation', 'chain', 'Pause visited worlds while the jumper is away so they do not advance until revisited or the chain ends.'),
  option('spark-end-jump', 'Spark/End-Jump', 'accommodation', 'chain', 'Make the end of the chain culminate in a rare Spark and the kind of multiversal apotheosis associated with it.'),
  option('supplements', 'Supplements', 'accommodation', 'chain', 'Open the door to hotels, arenas, rivals, warehouses, body mods, and other supplement-side systems.', {
    note: 'Chosen starts with two purchases of this option. This builder also uses it to unlock Iconic, Cosmic Backpack, and Three Boons.',
    repeatable: true,
  }),
  option('combine-jumps', 'Combine Jumps', 'accommodation', 'chain', 'Merge multiple jumps together into one blended setting while each jump keeps its own background and option structure.'),
  option('cyoa-in-the-sky', 'CYOA In the Sky', 'accommodation', 'chain', 'Allow the jumper to build jumps out of outside CYOAs instead of sticking to standard jump documents.'),
  option('dont-i-know-you', "Don't I Know You?", 'accommodation', 'chain', 'Have the jumper keep running into familiar faces, alternate selves, or eerily similar versions of people they know.'),
  option('every-origin-drops-in', 'Every Origin Drops-In', 'accommodation', 'chain', 'Treat every origin as a Drop-In for identity and history while still preserving its discounts.'),
  option('fanon-over-canon', 'Fanon > Canon', 'accommodation', 'chain', 'Let strong or widely accepted fanon override canon when it makes the setting fit better.'),
  option('flexible-travel-schedule', 'Flexible Travel Schedule', 'accommodation', 'chain', 'Adjust how long the jumper stays in each jump instead of always spending the default full term there.', {
    note: 'Can be taken up to four times.',
    maxSelections: 4,
  }),
  option('flexible-vacation-time', 'Flexible Vacation Time', 'accommodation', 'chain', 'Shift the visit window earlier or later in the setting timeline so the jumper arrives when the story is actually useful.'),
  option('going-back', 'Going Back', 'accommodation', 'chain', 'After the chain ends, let the jumper return to any world they visited instead of only going home.', {
    note: 'Requires Death is Not the End, Going Native, or Homesick.',
  }),
  option('many-hats', 'Many Hats', 'accommodation', 'chain', 'Buy multiple backgrounds for the jumper or companions instead of forcing a single-history origin choice.'),
  option('rejecting-fate', 'Rejecting Fate', 'accommodation', 'chain', 'Ignore jump-mandated random rolls and choose the result for age, gender, bloodline, location, and similar variables.'),
  option('resolve-and-leave', 'Resolve and Leave', 'accommodation', 'chain', 'Allow a jump to end early once the core canon problem is actually solved and at least a year has passed.'),
  option('travel-advisory-warning', 'Travel Advisory Warning', 'accommodation', 'chain', 'Give the jumper advance notice before a jump starts or ends so they can prepare and gather what matters.'),

  option('alt-form-armoire', 'Alt-Form Armoire', 'accommodation', 'fiat', 'Let the jumper switch freely between purchased alternate forms instead of being trapped in the current one.'),
  option('before-babel', 'Before Babel', 'accommodation', 'fiat', 'Guarantee communication with locals in the starting area of each jump even when the language should be foreign.'),
  option('under-warranty', 'Under Warranty', 'accommodation', 'fiat', 'Return lost, stolen, or unintentionally destroyed CP-purchased things in a convenient place at jump end.', {
    note: 'Chosen starts with three purchases. Often tracked separately for perks, companions, and items.',
    maxSelections: 3,
  }),
  option('universal-power', 'Universal Power', 'accommodation', 'fiat', 'Keep out-of-context powers functioning even when the local metaphysics would normally shut them off.'),
  option('alt-form-blender', 'Alt-Form Blender', 'accommodation', 'fiat', 'Blend the best parts or appearances of multiple alt-forms at the same time.', {
    note: 'Requires Alt-Form Armoire.',
  }),
  option('singular-power-pool', 'Singular Power Pool', 'accommodation', 'fiat', 'Collapse multiple supernatural resource pools into one shared pool instead of tracking each system separately.'),

  option('benched', 'Benched', 'accommodation', 'companions', 'Give the chain effectively unlimited companion slots and let the jumper decide which companions are actively imported.'),
  option('not-alone', 'Not Alone', 'accommodation', 'companions', 'Increase the number of companions who can actively follow the jumper from jump to jump.', {
    note: 'Chosen starts with four purchases. Each purchase expands active companion capacity.',
    repeatable: true,
  }),
  option('spawn-of-jumper', 'Spawn of Jumper', 'accommodation', 'companions', 'Automatically treat the jumper’s children as companions.'),
  option('canon-tag-along', 'Canon Tag-Along', 'accommodation', 'companions', 'Let the jumper recruit canon characters as companions even when the jump document forgot to offer them.'),
  option('companion-option', 'Companion Option', 'accommodation', 'companions', 'Add missing OC companion or import tiers to jumps that do not already provide them.', {
    note: 'Usually handled as up to three purchase tiers.',
    maxSelections: 3,
  }),
  option('companions-can-take-drawbacks', 'Companions Can Take Drawbacks', 'accommodation', 'companions', 'Allow companions to earn their own CP from personal drawbacks.'),
  option('co-op-mode', 'Co-op Mode', 'accommodation', 'companions', 'Start the chain with a true co-jumper who gets their own background and starting CP each jump.'),
  option('cp-donation', 'CP Donation', 'accommodation', 'companions', 'Let companions benefit from CP the jumper does not spend.'),
  option('the-entourage', 'The Entourage', 'accommodation', 'companions', 'Import any number of companions for free instead of paying import costs.'),
  option('followers', 'Followers', 'accommodation', 'companions', 'Bring along non-companion followers who travel with the chain without gaining CP or origin support.'),
  option('native-selves', 'Native Selves', 'accommodation', 'companions', 'Allow the jumper to encounter alternate or native versions of themselves in matching settings.'),

  option('batch-job', 'Batch Job', 'accommodation', 'choice-points', 'Repeat purchases in a jump document even when the document does not explicitly say repeat buys are allowed.'),
  option('foreign-purchase', 'Foreign Purchase', 'accommodation', 'choice-points', 'Buy from an unused jump document by paying undiscounted price plus half again.', {
    note: 'Can be taken twice.',
    maxSelections: 2,
  }),
  option('gift-return', 'Gift Return', 'accommodation', 'choice-points', 'Trade away freebies or stipends for up to half their CP value and spend that budget elsewhere.'),
  option('grant', 'Grant', 'accommodation', 'choice-points', 'Receive an extra 100 CP each jump.', {
    note: 'Can be taken up to ten times.',
    maxSelections: 10,
  }),
  option('haggle-down', 'Haggle Down', 'accommodation', 'choice-points', 'Buy smaller or weaker versions of perks, items, and drawbacks for a lower price.'),
  option('ive-been-x-before', "I've Been X Before", 'accommodation', 'choice-points', 'Keep qualifying for familiar discounts across later jumps once the jumper or companion has earned them once.'),
  option('savings-account', 'Savings Account', 'accommodation', 'choice-points', 'Bank 100 CP for a future jump instead of spending it now.', {
    note: 'Each purchase banks another 100 CP. The source notes mention a 10% interest variant.',
    repeatable: true,
  }),
  option('unlimited-drawbacks', 'Unlimited Drawbacks', 'accommodation', 'choice-points', 'Remove the normal drawback cap so the jumper can keep taking more if desired.'),

  option('entertain-me', 'Entertain Me', 'complication', 'chain', 'Make the jumper’s continued chain depend on keeping some higher power amused and obeying whatever directives it issues.'),
  option('always-drop-in', 'Always/Never Drop-In', 'complication', 'chain', 'Force the chain to stick to one Drop-In continuity rule every jump instead of choosing it case by case.', {
    note: 'Always Drop-In conflicts with Random Background and Every Origin Drops-In.',
  }),
  option('as-you-were-same-age', 'As You Were: Same Age', 'complication', 'chain', 'Keep age stable instead of rolling or changing it from jump to jump.'),
  option('as-you-were-same-sex', 'As You Were: Same Sex', 'complication', 'chain', 'Keep sex stable instead of allowing jump-by-jump change.'),
  option('as-you-were-same-race', 'As You Were: Same Race', 'complication', 'chain', 'Keep race stable instead of letting jump origin options fully rewrite it.'),
  option('blind-chain', 'Blind Chain', 'complication', 'chain', 'Keep the jumper ignorant of where they are going, what the setting is, or even the chain mechanics themselves.'),
  option('displaced-spirit', 'Displaced Spirit', 'complication', 'chain', 'Make each new host identity resist the jumper and muddy memories, motives, and self-control.'),
  option('effecting-change', 'Effecting Change', 'complication', 'chain', 'Require the jumper to meaningfully engage with and alter the setting’s plot or risk slipping out of the story entirely.'),
  option('escalation-chain', 'Escalation Chain', 'complication', 'chain', 'Stop the chain from de-escalating into lower-power settings once the jumper has already climbed upward.'),
  option('heavy-is-the-quill', 'Heavy Is The Quill', 'complication', 'chain', 'Require writeups between jumps so the chain is documented instead of only imagined.', {
    note: 'Can be taken up to ten times.',
    maxSelections: 10,
  }),
  option('native-jumper', 'Native Jumper', 'complication', 'chain', 'Make the jumper a canon or original in-setting character instead of a self-insert.'),
  option('never-ending-chain', 'Never-Ending Chain', 'complication', 'chain', 'Remove normal end-of-chain exits so the jumper keeps jumping until death or something worse stops them.', {
    note: 'Incompatible with Death is Not the End, Going Native, Homesick, and Going Back.',
  }),
  option('you-are-the-companion', 'No, Jumper, You Are the Companion', 'complication', 'chain', 'Shift story focus away from the jumper and toward a companion, follower, or observer.'),
  option('you-are-the-protagonist', 'No, Jumper, You Are the Protagonist', 'complication', 'chain', 'Force the jumper to step into the hero role when canon protagonists cannot carry the story.', {
    note: 'Incompatible with No, Jumper, You Are the Companion.',
  }),
  option('pants-problem', 'Pants Problem', 'complication', 'chain', 'Randomize gender each jump in a way perks and powers are not allowed to bypass.'),
  option('quickly-now', 'Quickly, Now!', 'complication', 'chain', 'Limit jump-doc decision time so the jumper must choose quickly or lose options.'),
  option('random-background', 'Random Background', 'complication', 'chain', 'Randomize origin, age, background, and starting location instead of choosing them.', {
    note: 'Conflicts with Rejecting Fate and often with As You Were.',
  }),
  option('reincarnation', 'Reincarnation', 'complication', 'chain', 'End jumps on death, restart the next jump as a newborn, and treat early death before the protected window as chain-fail.', {
    note: 'Requires Every Origin Drops-In and Death is Not the End. Incompatible with Flexible Travel Schedule.',
  }),
  option('roll-chain', 'Roll Chain', 'complication', 'chain', 'Randomize the next jump instead of choosing where the jumper goes.'),
  option('scars-stay-with-you', 'Scars Stay With You', 'complication', 'chain', 'Carry old wounds, scars, and marks forward instead of letting each jump reset appearance cleanly.'),
  option('stat-me', 'Stat Me!', 'complication', 'chain', 'Turn the chain into an RPG campaign that has to be actually statted and played through.'),
  option('stations-of-canon', 'Stations of Canon Set In Stone', 'complication', 'chain', 'Lock the most annoying canon beats in place no matter what the jumper does.'),
  option('street-level-chain', 'Street-Level Chain', 'complication', 'chain', 'Restrict the chain to settings that stay within a grounded power band.'),
  option('thematic-chain', 'Thematic Chain', 'complication', 'chain', 'Restrict every jump in the chain to a shared theme such as war, magic, monsters, or music.'),
  option('uncertain-schedule', 'Uncertain Schedule', 'complication', 'chain', 'Randomize jump length instead of always using the default ten-year schedule.'),
  option('unreliable-canon', 'Unreliable Canon', 'complication', 'chain', 'Let the setting drift wildly away from canon in ways that are usually not helpful to the jumper.', {
    note: 'Largely incompatible with Combine Jumps.',
  }),

  option('diminishing-returns', 'Diminishing Returns', 'complication', 'fiat', 'Make additive perk stacking taper off quickly instead of compounding cleanly forever.'),
  option('the-one-var-type-error', "'The_1' VAR TYPE ERROR", 'complication', 'fiat', 'Block perks from simply granting supernatural abilities outright.'),
  option('kung-fu-failed-to-load', '() KUNG-FU FAILED TO LOAD', 'complication', 'fiat', 'Force knowledge and skill perks to be learned the hard way instead of appearing fully formed.'),
  option('guns-not-found', '404 GUNS NOT FOUND', 'complication', 'fiat', 'Remove item purchases that could normally be obtained in-setting by mundane means.', {
    note: 'Incompatible with Discontinued Promotional Item.',
  }),
  option('after-babel', 'After Babel', 'complication', 'fiat', 'Remove automatic local-language understanding from Drop-Ins unless the jumper learns or translates it manually.', {
    note: 'Only applies to Drop-Ins. Incompatible with Before Babel and Never Drop-In.',
  }),
  option('cyoa-edition', 'CYOA Edition', 'complication', 'fiat', 'Lock the jumper and companions to what they bought in the current link of the chain until the chain ends.'),
  option('delayed-delivery', 'Delayed Delivery', 'complication', 'fiat', 'Spread new purchases out over the jump instead of giving them all up front.'),
  option('discontinued-promotional-item', 'Discontinued Promotional Item', 'complication', 'fiat', 'Strip out genre-breaking fiat items from mundane settings and force item offerings to match the setting tone.'),
  option('drawbacks-follow', 'Drawbacks Follow', 'complication', 'fiat', 'Keep drawbacks haunting the jumper after the jump where they were taken.'),
  option('highlander', 'Highlander', 'complication', 'fiat', 'Split the jumper’s starting CP with another jumper and make them hunt the rival down to reclaim it.'),
  option('metaphysical-incompatibility', 'Metaphysical Incompatibility', 'complication', 'fiat', 'Let powers, magics, and technologies from different settings interfere or interact badly.'),
  option('no-stat-perks', 'No Stat Perks', 'complication', 'fiat', 'Pick core attributes and make perks stop improving those stats.', {
    note: 'Can be taken up to six times.',
    maxSelections: 6,
  }),
  option('not-so-quick-change', 'Not-So-Quick-Change', 'complication', 'fiat', 'Make alt-form changes take time, warehouse access, or other restrictions instead of happening instantly.'),
  option('thematic-purchases', 'Thematic Purchases', 'complication', 'fiat', 'Require purchases to fit chosen themes instead of letting the jumper buy outside the concept.', {
    note: 'Often tracked separately for items, companions, and perks.',
    maxSelections: 3,
  }),
  option('vancian-powers', 'Vancian Powers', 'complication', 'fiat', 'Limit active powers and require meditation to swap which powers are loaded at a given time.'),

  option('a-companion-in-need', 'A Companion In Need', 'complication', 'companions', 'Remove normal imported companion stipends and force you to support them some other way.', {
    note: 'Incompatible with The Entourage.',
  }),
  option('foil', 'Foil', 'complication', 'companions', 'Give every companion an antagonist who keeps following the chain and wants the jumper stopped.'),
  option('jumpers-cp-card', "Jumper's CP Card", 'complication', 'companions', 'Let companions make their own terrible spending decisions with the CP allotted to them.'),
  option('no-canon-companions', 'No Canon Companions', 'complication', 'companions', 'Prevent canon characters from leaving the setting as companions or followers.'),
  option('no-oc-companions', 'No OC Companions', 'complication', 'companions', 'Restrict companion choices to characters who actually appeared in canon.'),
  option('random-roster', 'Random Roster', 'complication', 'companions', 'Randomize which companions get imported when not everyone can come.', {
    note: 'Requires at least two purchases of Not Alone.',
  }),
  option('see-you-space-cowboy', 'See You, Space Cowboy', 'complication', 'companions', 'Make companion death work the same way jumper death does instead of quietly brushing it aside.', {
    note: "Incompatible with Under Warranty's companion protection.",
  }),

  option('bank-error-not-in-your-favor', 'Bank Error Not In Your Favor', 'complication', 'choice-points', 'Halve supplement stipends while letting regular CP substitute for them.', {
    note: 'Can be taken twice.',
    maxSelections: 2,
  }),
  option('beggars-and-choosers', 'Beggars and Choosers', 'complication', 'choice-points', 'Start jumps with 0 CP but double the CP value of drawbacks.', {
    note: 'Incompatible with Budget Cuts and Random Starting CP.',
  }),
  option('budget-cuts', 'Budget Cuts', 'complication', 'choice-points', 'Reduce starting CP by 100 each time.', {
    note: 'Repeatable. After ten purchases the source expects Roll With the Drawbacks to cover the rest.',
    repeatable: true,
  }),
  option('cp-equals-xp', 'CP = XP', 'complication', 'choice-points', 'Make purchases unlock only after the jumper earns the equivalent through adventure or growth.'),
  option('drawback-depreciation', 'Drawback Depreciation', 'complication', 'choice-points', 'Cut drawback payouts in half, then remove them entirely on the second purchase.', {
    note: 'Can be taken up to two times.',
    maxSelections: 2,
  }),
  option('no-such-thing-as-a-free-x', 'No Such Thing As A Free X', 'complication', 'choice-points', 'Turn freebies into discounts instead of fully free choices.'),
  option('random-starting-cp', 'Random Starting CP', 'complication', 'choice-points', 'Randomize starting CP anywhere from 0 up to the normal amount.'),
  option('reduced-discount', 'Reduced Discount', 'complication', 'choice-points', 'Downgrade discounts to a flat 100 CP off and remove them entirely on the second purchase.', {
    note: 'Can be taken up to two times.',
    maxSelections: 2,
  }),
  option('roll-with-the-drawbacks', 'Roll With the Drawbacks', 'complication', 'choice-points', 'Force the jumper to carry a minimum amount of drawback value without necessarily being paid for it.', {
    note: 'Can be taken up to five times.',
    maxSelections: 5,
  }),
  option('you-get-what-you-pay-for', 'You Get What You Pay For', 'complication', 'choice-points', 'Discounted perks and items come through weaker unless full price is paid.'),
  option('wait-for-it-to-go-on-sale', 'Wait For It To Go On Sale', 'complication', 'choice-points', 'Restrict the jumper to free, discounted, or always-available options.'),
  option('what-do-you-think-i-paid-for-this', 'What Do You Think I Paid for This?', 'complication', 'choice-points', 'Restrict the jumper to full-price or always-available options instead of letting them exploit discounts.', {
    note: 'Conflicts with a fully doubled No Such Thing As A Free X.',
  }),
];

export function isAltChainBuilderOptionRepeatable(option: AltChainBuilderOption | undefined) {
  if (!option) {
    return false;
  }

  return option.repeatable === true || (typeof option.maxSelections === 'number' && option.maxSelections > 1);
}

export function getAltChainBuilderSelectionLimit(option: AltChainBuilderOption | undefined) {
  if (!option) {
    return 1;
  }

  if (typeof option.maxSelections === 'number' && Number.isFinite(option.maxSelections)) {
    return option.maxSelections;
  }

  return isAltChainBuilderOptionRepeatable(option) ? undefined : 1;
}

export const altChainBuilderOptionsById = Object.fromEntries(
  altChainBuilderOptionCatalog.map((entry) => [entry.id, entry]),
) as Record<string, AltChainBuilderOption>;
