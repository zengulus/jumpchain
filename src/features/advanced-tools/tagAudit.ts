import type { BranchWorkspace } from '../../domain/chain/selectors';
import { readTagList, tagListIncludesAny } from '../../utils/tags';
import { withSearchParams } from '../search/searchUtils';

export interface TagAuditEntry {
  id: string;
  kind: 'selection' | 'note';
  kindLabel: string;
  title: string;
  subtitle: string;
  tags: string[];
  to: string;
}

interface PurchaseSubtypeDefinition {
  name: string;
  type: number | null;
}

interface PurchaseClassification {
  perkSubtypeKeys: Set<string>;
  itemSubtypeKeys: Set<string>;
  subsystemSubtypeKeys: Set<string>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function getOptionalIdentifier(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function getOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function getSelectionTitle(value: unknown) {
  const record = asRecord(value);

  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    return record.name;
  }

  if (typeof record.summary === 'string' && record.summary.trim().length > 0) {
    return record.summary;
  }

  if (typeof record.label === 'string' && record.label.trim().length > 0) {
    return record.label;
  }

  if (typeof record.sourcePurchaseId === 'number') {
    return `Selection ${record.sourcePurchaseId}`;
  }

  return 'Untitled Selection';
}

function getSelectionKindTitle(record: Record<string, unknown>) {
  switch (record.selectionKind) {
    case 'drawback':
      return 'Drawback';
    case 'retained-drawback':
      return 'Retained drawback';
    default:
      return 'Purchase';
  }
}

function getSelectionSubtypeKey(value: unknown) {
  const record = asRecord(value);
  return getOptionalIdentifier(record.subtype) ?? getOptionalIdentifier(record.subtypeKey);
}

function getSelectionPurchaseType(value: unknown) {
  const record = asRecord(value);
  return getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);
}

function getPurchaseSubtypeDefinitions(value: unknown): Record<string, PurchaseSubtypeDefinition> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, definition]) => {
      const record = asRecord(definition);

      return [
        key,
        {
          name:
            typeof record.name === 'string' && record.name.trim().length > 0
              ? record.name
              : key === '0'
                ? 'Perk'
                : key === '1'
                  ? 'Item'
                  : key === '10'
                    ? 'Subsystem'
                    : `Subtype ${key}`,
          type: getOptionalNumber(record.type),
        },
      ];
    }),
  );
}

function ensurePurchaseSubtypeDefinitions(
  definitions: Record<string, PurchaseSubtypeDefinition>,
  subtypeKeys: string[],
) {
  const nextDefinitions: Record<string, PurchaseSubtypeDefinition> = {
    '0': { name: 'Perk', type: 0 },
    '1': { name: 'Item', type: 1 },
    '10': { name: 'Subsystem', type: 2 },
    ...definitions,
  };

  for (const subtypeKey of subtypeKeys) {
    if (!(subtypeKey in nextDefinitions)) {
      nextDefinitions[subtypeKey] = {
        name: `Subtype ${subtypeKey}`,
        type: subtypeKey === '1' ? 1 : subtypeKey === '10' ? 2 : null,
      };
    }
  }

  return nextDefinitions;
}

function getPurchaseClassification(
  subtypeDefinitions: Record<string, PurchaseSubtypeDefinition>,
): PurchaseClassification {
  const perkSubtypeKeys = new Set(
    Object.entries(subtypeDefinitions)
      .filter(([key, definition]) => {
        const lowerName = definition.name.toLowerCase();
        return definition.type === 0 && (key === '0' || lowerName.includes('perk'));
      })
      .map(([key]) => key),
  );
  const itemSubtypeKeys = new Set(
    Object.entries(subtypeDefinitions)
      .filter(([, definition]) => definition.type === 1)
      .map(([key]) => key),
  );
  const subsystemSubtypeKeys = new Set(
    Object.keys(subtypeDefinitions).filter(
      (key) => !perkSubtypeKeys.has(key) && !itemSubtypeKeys.has(key),
    ),
  );

  return {
    perkSubtypeKeys,
    itemSubtypeKeys,
    subsystemSubtypeKeys,
  };
}

function getSelectionTab(
  value: unknown,
  classification: PurchaseClassification,
): 'perks' | 'subsystems' | 'items' | 'other' | 'drawbacks' {
  const record = asRecord(value);

  if (record.selectionKind === 'drawback' || record.selectionKind === 'retained-drawback') {
    return 'drawbacks';
  }

  const purchaseType = getSelectionPurchaseType(value);
  const subtypeKey = getSelectionSubtypeKey(value);

  if (purchaseType === 1 || (subtypeKey !== null && classification.itemSubtypeKeys.has(subtypeKey))) {
    return 'items';
  }

  if (purchaseType === 0 && (subtypeKey === null || classification.perkSubtypeKeys.has(subtypeKey))) {
    return 'perks';
  }

  if (purchaseType === 2 || (subtypeKey !== null && classification.subsystemSubtypeKeys.has(subtypeKey))) {
    return 'subsystems';
  }

  return 'other';
}

function getSelectionTabLabel(tab: ReturnType<typeof getSelectionTab>) {
  switch (tab) {
    case 'perks':
      return 'Perks';
    case 'subsystems':
      return 'Subsystems';
    case 'items':
      return 'Items';
    case 'drawbacks':
      return 'Drawbacks';
    default:
      return 'Other purchases';
  }
}

export function buildTagAuditEntries(input: {
  chainId: string;
  workspace: BranchWorkspace;
}) {
  const jumpById = new Map(input.workspace.jumps.map((jump) => [jump.id, jump]));
  const participantById = new Map([
    ...input.workspace.jumpers.map((jumper) => [jumper.id, jumper.name] as const),
    ...input.workspace.companions.map((companion) => [companion.id, companion.name] as const),
  ]);
  const noteEntries: TagAuditEntry[] = input.workspace.notes.map((note) => ({
    id: note.id,
    kind: 'note',
    kindLabel: 'Note',
    title: cleanLabel(note.title, 'Untitled Note'),
    subtitle: `Note | ${note.noteType}`,
    tags: readTagList(note.tags),
    to: withSearchParams(`/chains/${input.chainId}/notes`, {
      note: note.id,
    }),
  }));
  const selectionEntries: TagAuditEntry[] = input.workspace.participations.flatMap((participation) => {
    const jump = jumpById.get(participation.jumpId);
    const participantName = participantById.get(participation.participantId) ?? 'Participant';
    const rawSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(participation.importSourceMetadata).purchaseSubtypes);
    const purchaseSubtypeDefinitions = ensurePurchaseSubtypeDefinitions(
      rawSubtypeDefinitions,
      participation.purchases
        .map((purchase) => getSelectionSubtypeKey(purchase))
        .filter((subtypeKey): subtypeKey is string => Boolean(subtypeKey)),
    );
    const purchaseClassification = getPurchaseClassification(purchaseSubtypeDefinitions);

    return [...participation.purchases, ...participation.drawbacks, ...participation.retainedDrawbacks].map((entry, index) => {
      const record = asRecord(entry);
      const tab = getSelectionTab(entry, purchaseClassification);

      return {
        id: `${participation.id}-${tab}-${index}`,
        kind: 'selection' as const,
        kindLabel: getSelectionKindTitle(record),
        title: cleanLabel(getSelectionTitle(entry), 'Untitled Selection'),
        subtitle: `${getSelectionTabLabel(tab)} | ${participantName} @ ${cleanLabel(jump?.title, 'Jump')}`,
        tags: readTagList(record.tags),
        to: withSearchParams(`/chains/${input.chainId}/jumps/${participation.jumpId}`, {
          participant: participation.participantId,
          panel: 'participation',
          participationTab: tab,
        }),
      };
    });
  });

  return [...selectionEntries, ...noteEntries].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.subtitle.localeCompare(right.subtitle) ||
      left.title.localeCompare(right.title),
  );
}

export function filterUntaggedEntries(entries: TagAuditEntry[], targetTags: string[]) {
  if (targetTags.length === 0) {
    return entries.filter((entry) => entry.tags.length === 0);
  }

  return entries.filter((entry) => !tagListIncludesAny(entry.tags, targetTags));
}
