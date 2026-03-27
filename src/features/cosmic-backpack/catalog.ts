export type CosmicBackpackOptionCategory = 'core-upgrade' | 'attachment' | 'modifier';

export interface CosmicBackpackOption {
  id: string;
  title: string;
  category: CosmicBackpackOptionCategory;
  costBp: number;
  description: string;
  note?: string;
  requirementIds?: string[];
}

export const COSMIC_BACKPACK_TOTAL_BP = 1000;
export const COSMIC_BACKPACK_BASE_VOLUME_FT3 = 512;
export const COSMIC_BACKPACK_BASE_VOLUME_M3 = 14.5;
export const cosmicBackpackMandatoryOptionIds = ['everythings-an-item', 'if-you-cant-hold-it'] as const;

export const cosmicBackpackBaseDescription =
  'A cosmic backpack with an indestructible 8x8x8 foot interior. If it is lost or stolen, it returns within a day. Items can be stored near the mouth of the bag and retrieved by willing for them.';

export const cosmicBackpackOptionCatalog: CosmicBackpackOption[] = [
  {
    id: 'custom-appearance',
    title: 'Custom Appearance',
    category: 'core-upgrade',
    costBp: 0,
    description: 'Change the backpack look to suit you, including automatically blending into the current universe if you want.',
  },
  {
    id: 'access-control',
    title: 'Access Control',
    category: 'core-upgrade',
    costBp: 0,
    description: 'Only you or your companions can access the contents of the bag.',
  },
  {
    id: 'more-space',
    title: 'More Space',
    category: 'core-upgrade',
    costBp: 200,
    description: 'Doubles the interior volume of the bag.',
    note: 'Can only be taken once.',
  },
  {
    id: 'adaptive-storage',
    title: 'Adaptive Storage',
    category: 'core-upgrade',
    costBp: 200,
    description: 'CP-purchased items from jumps will always fit inside the bag without taking up storage space.',
  },
  {
    id: 'stasis',
    title: 'Stasis',
    category: 'core-upgrade',
    costBp: 100,
    description: 'Stored items remain in stasis so they do not deteriorate or rot.',
    note: 'Can be toggled per item.',
  },
  {
    id: 'touch-and-go',
    title: 'Touch and Go',
    category: 'core-upgrade',
    costBp: 100,
    description: 'Store items into the bag with a touch instead of guiding them to the mouth manually.',
  },
  {
    id: 'hammerspace',
    title: 'Hammerspace',
    category: 'core-upgrade',
    costBp: 200,
    description: 'Retrieve stored items with a thought so they appear directly in your hands when there is room.',
  },
  {
    id: 'not-a-backpack',
    title: 'Not a Backpack',
    category: 'core-upgrade',
    costBp: 100,
    description: 'Replace the backpack form with another carried container such as a purse, satchel, or roller luggage.',
  },
  {
    id: 'food-supply',
    title: 'Food Supply',
    category: 'attachment',
    costBp: 100,
    description: 'A replenishing supply of simple but nutritious bagged meals for up to ten people per day.',
  },
  {
    id: 'gourmet-food',
    title: 'Gourmet Food',
    category: 'attachment',
    costBp: 200,
    description: 'Upgrade Food Supply into varied hot gourmet meals that adapt to future jumps.',
    requirementIds: ['food-supply'],
  },
  {
    id: 'electricity',
    title: 'Electricity',
    category: 'attachment',
    costBp: 100,
    description: 'An adaptable electrical outlet on the bag that works with local appliances.',
  },
  {
    id: 'plumbing',
    title: 'Plumbing',
    category: 'attachment',
    costBp: 100,
    description: 'A faucet on the bag with an infinite supply of clean water at normal sink flow.',
  },
  {
    id: 'air-filtration',
    title: 'Air Filtration',
    category: 'attachment',
    costBp: 100,
    description: 'Passively filters the surrounding air into a clean, breathable five-meter bubble.',
    note: 'Does not work underwater.',
  },
  {
    id: 'air-supply',
    title: 'Air Supply',
    category: 'attachment',
    costBp: 100,
    description: 'Upgrade Air Filtration into an infinite clean air source for up to ten people.',
    note: 'Can vent from the bag or feed retractable oxygen masks.',
    requirementIds: ['air-filtration'],
  },
  {
    id: 'heating-cooling',
    title: 'Heating/Cooling',
    category: 'attachment',
    costBp: 100,
    description: 'Keeps your body thermally regulated through the bag surface.',
  },
  {
    id: 'computer-interface',
    title: 'Computer Interface',
    category: 'attachment',
    costBp: 100,
    description: 'Use devices inside the bag through retractable peripherals and a contents interface.',
  },
  {
    id: 'integrative-technology',
    title: 'Integrative Technology',
    category: 'attachment',
    costBp: 100,
    description: 'Upgrade Computer Interface so devices in the bag integrate into one seamless system.',
    requirementIds: ['computer-interface'],
  },
  {
    id: 'local-net',
    title: 'Local Net',
    category: 'attachment',
    costBp: 100,
    description: 'A secure connection to the local universe internet when one exists.',
  },
  {
    id: 'magic-tent',
    title: 'Magic Tent',
    category: 'attachment',
    costBp: 100,
    description: 'A compact bedroll that unfolds into a weatherproof tent with sleeping space for ten people.',
  },
  {
    id: 'magic-cottage',
    title: 'Magic Cottage',
    category: 'attachment',
    costBp: 200,
    description: 'Upgrade Magic Tent into a cozy furnished cottage with enough living space for ten people.',
    note: 'Includes a bathroom if Plumbing is also purchased.',
    requirementIds: ['magic-tent'],
  },
  {
    id: 'crafting-tools',
    title: 'Crafting Tools',
    category: 'attachment',
    costBp: 100,
    description: 'A side pouch with common crafting and repair tools plus a compact workbench.',
    note: 'The tool set expands to match common tools in each jump.',
  },
  {
    id: 'first-aid-kit',
    title: 'First Aid Kit',
    category: 'attachment',
    costBp: 100,
    description: 'A fully equipped kit that can stabilize even critical patients.',
  },
  {
    id: 'healing-potions',
    title: 'Healing Potions',
    category: 'attachment',
    costBp: 100,
    description: 'Upgrade First Aid Kit with ten restorative potions that can fully heal over an hour.',
    note: 'Used potions replenish one month later.',
    requirementIds: ['first-aid-kit'],
  },
  {
    id: 'weapon-holster',
    title: 'Weapon Holster',
    category: 'attachment',
    costBp: 100,
    description: 'A dedicated attachment that keeps a favored weapon secure and lets it leap into your hands instantly.',
  },
  {
    id: 'everythings-an-item',
    title: "Everything's an Item",
    category: 'modifier',
    costBp: 0,
    description: 'Purchased attachments become discrete items you can attach to the bag or store inside it without taking space.',
  },
  {
    id: 'if-you-cant-hold-it',
    title: "If You Can't Hold It...",
    category: 'modifier',
    costBp: 0,
    description: 'Warehouse additions become compact items or summoning tokens instead of large attached structures.',
  },
];

export const cosmicBackpackOptionsById = Object.fromEntries(
  cosmicBackpackOptionCatalog.map((option) => [option.id, option]),
) as Record<string, CosmicBackpackOption>;
