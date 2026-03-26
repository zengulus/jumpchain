import { iconicBodymodModes, type BodymodMode, type IconicBodymodMode } from '../../domain/common';
import type { BodymodProfile, IconicSelection } from '../../domain/bodymod/types';

export interface IconicSlotTemplate {
  label: string;
  defaultKind: IconicSelection['kind'];
  hint: string;
}

export interface IconicTierConfig {
  title: string;
  description: string;
  startingLevel: string;
  progression: string;
  slots: IconicSlotTemplate[];
}

export const ICONIC_TIER_CONFIGS: Record<IconicBodymodMode, IconicTierConfig> = {
  'central-gimmick': {
    title: 'Central Gimmick',
    description: 'One defining impossible thing stays substantially itself across the chain.',
    startingLevel: 'Starts at full intended power and usually stays there, even under heavy restriction.',
    progression: 'Stability tier. The point is preserving the conceit, not staged growth.',
    slots: [
      {
        label: 'Defining purchase',
        defaultKind: 'power',
        hint: 'The one purchase that the character stops feeling like themselves without.',
      },
    ],
  },
  suite: {
    title: 'The Suite',
    description: 'A compact signature package: three core abilities and one key item.',
    startingLevel: 'Starts at the setting Core benchmark and stays recognisable in gauntlets.',
    progression: 'Can naturally grow up to Peak through training, upgrades, practice, and the chain itself.',
    slots: [
      {
        label: 'Core ability 1',
        defaultKind: 'perk',
        hint: 'A foundational perk or power that should always stay online.',
      },
      {
        label: 'Core ability 2',
        defaultKind: 'power',
        hint: 'Another part of the recognisable package.',
      },
      {
        label: 'Core ability 3',
        defaultKind: 'perk',
        hint: 'The last signature ability slot for this tier.',
      },
      {
        label: 'Signature item',
        defaultKind: 'item',
        hint: 'The external piece of gear or artefact that belongs in the package.',
      },
    ],
  },
  baseline: {
    title: 'The Baseline',
    description: 'A broader foundation of perks and items that starts modestly and grows with the chain.',
    startingLevel: 'Starts at the setting Floor benchmark and stays available even when stripped down.',
    progression: 'Grows through actual in-chain development, usually up to Peak.',
    slots: [
      {
        label: 'Foundation perk 1',
        defaultKind: 'perk',
        hint: 'A core trait that should always be part of the character.',
      },
      {
        label: 'Foundation perk 2',
        defaultKind: 'perk',
        hint: 'Another stable piece of the character foundation.',
      },
      {
        label: 'Foundation perk 3',
        defaultKind: 'perk',
        hint: 'A third baseline capability or trait.',
      },
      {
        label: 'Foundation perk 4',
        defaultKind: 'perk',
        hint: 'Use this for a broad stabilising trait rather than a singular gimmick.',
      },
      {
        label: 'Foundation perk 5',
        defaultKind: 'perk',
        hint: 'The last perk slot in the broader baseline.',
      },
      {
        label: 'Key item 1',
        defaultKind: 'item',
        hint: 'An important tool, possession, or artefact that supports the concept.',
      },
      {
        label: 'Key item 2',
        defaultKind: 'item',
        hint: 'Another item that belongs in the character foundation.',
      },
      {
        label: 'Key item 3',
        defaultKind: 'item',
        hint: 'The last item slot for the stable foundation tier.',
      },
    ],
  },
};

export function isIconicTier(mode: BodymodMode): mode is IconicBodymodMode {
  return iconicBodymodModes.includes(mode as IconicBodymodMode);
}

export function normalizeIconicTier(mode: BodymodMode): IconicBodymodMode {
  if (isIconicTier(mode)) {
    return mode;
  }

  if (mode === 'supplemented') {
    return 'suite';
  }

  return 'baseline';
}

export function createBlankIconicSelection(defaultKind: IconicSelection['kind']): IconicSelection {
  return {
    kind: defaultKind,
    title: '',
    source: '',
    summary: '',
  };
}

export function getSelectionsForTier(tier: IconicBodymodMode, selections: IconicSelection[]) {
  return ICONIC_TIER_CONFIGS[tier].slots.map((slot, index) => {
    const selection = selections[index];

    return {
      kind: selection?.kind ?? slot.defaultKind,
      title: selection?.title ?? '',
      source: selection?.source ?? '',
      summary: selection?.summary ?? '',
    } satisfies IconicSelection;
  });
}

export function countFilledSelections(selections: IconicSelection[]) {
  return selections.filter(
    (selection) =>
      selection.title.trim().length > 0 ||
      selection.source.trim().length > 0 ||
      selection.summary.trim().length > 0,
  ).length;
}

export function getProfileStatusLabel(profile: BodymodProfile | null) {
  if (!profile) {
    return 'no iconic profile yet';
  }

  return ICONIC_TIER_CONFIGS[normalizeIconicTier(profile.mode)].title;
}
