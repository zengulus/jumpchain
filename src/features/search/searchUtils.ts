import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import type { ChainOverview } from '../../db/persistence';
import { cosmicBackpackOptionCatalog } from '../cosmic-backpack/catalog';
import { readCosmicBackpackState } from '../cosmic-backpack/model';
import { readAltFormNoteFields } from '../participation/altFormNotes';

export type UniversalSearchResultKind =
  | 'chain'
  | 'branch'
  | 'jumper'
  | 'companion'
  | 'jump'
  | 'participation'
  | 'selection'
  | 'alt-form'
  | 'effect'
  | 'note'
  | 'snapshot'
  | 'cosmic-backpack';

export interface UniversalSearchResult {
  id: string;
  kind: UniversalSearchResultKind;
  kindLabel: string;
  chainId: string;
  chainTitle: string;
  title: string;
  subtitle: string;
  snippet: string;
  to: string;
  tags: string[];
  score: number;
}

export type UniversalSearchCategory =
  | 'all'
  | 'chains'
  | 'characters'
  | 'jumps'
  | 'purchases'
  | 'rules'
  | 'notes'
  | 'backups';

const kindLabels: Record<UniversalSearchResultKind, string> = {
  chain: 'Chain',
  branch: 'Branch',
  jumper: 'Jumper',
  companion: 'Companion',
  jump: 'Jump',
  participation: 'Participation & Purchases',
  selection: 'Selection',
  'alt-form': 'Alt Form',
  effect: 'Effect',
  note: 'Note',
  snapshot: 'Snapshot',
  'cosmic-backpack': 'Cosmic Backpack',
};

const kindPriority: Record<UniversalSearchResultKind, number> = {
  chain: 12,
  branch: 10,
  jumper: 26,
  companion: 24,
  jump: 25,
  participation: 20,
  selection: 23,
  'alt-form': 19,
  effect: 22,
  note: 21,
  snapshot: 18,
  'cosmic-backpack': 16,
};

export const universalSearchCategoryOptions: Array<{
  id: UniversalSearchCategory;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'chains', label: 'Chains' },
  { id: 'characters', label: 'Characters' },
  { id: 'jumps', label: 'Jumps' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'rules', label: 'Rules' },
  { id: 'notes', label: 'Notes' },
  { id: 'backups', label: 'Backups' },
];

const universalSearchCategoryKinds: Record<Exclude<UniversalSearchCategory, 'all'>, UniversalSearchResultKind[]> = {
  chains: ['chain'],
  characters: ['jumper', 'companion'],
  jumps: ['jump'],
  purchases: ['participation', 'selection', 'alt-form'],
  rules: ['effect', 'cosmic-backpack'],
  notes: ['note'],
  backups: ['branch', 'snapshot'],
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function cleanTagList(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );
}

export function normalizeSearchQuery(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function readUniversalSearchCategory(value: string | null | undefined): UniversalSearchCategory {
  return universalSearchCategoryOptions.some((option) => option.id === value)
    ? (value as UniversalSearchCategory)
    : 'all';
}

export function extractSearchTerms(query: string) {
  return normalizeSearchQuery(query)
    .split(' ')
    .map((term) => term.trim())
    .filter(Boolean);
}

export function valueToSearchText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => valueToSearchText(entry)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value).map((entry) => valueToSearchText(entry)).join(' ');
  }

  return '';
}

export function matchesSearchQuery(query: string, ...values: unknown[]) {
  const terms = extractSearchTerms(query);

  if (terms.length === 0) {
    return true;
  }

  const haystack = normalizeSearchQuery(values.map((value) => valueToSearchText(value)).join(' '));
  return terms.every((term) => haystack.includes(term));
}

export function buildSearchSnippet(query: string, ...values: unknown[]) {
  const text = values
    .map((value) => valueToSearchText(value))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length === 0) {
    return '';
  }

  const normalizedText = normalizeSearchQuery(text);
  const terms = extractSearchTerms(query);
  const firstIndex = terms
    .map((term) => normalizedText.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (firstIndex === undefined) {
    return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
  }

  const start = Math.max(0, firstIndex - 46);
  const end = Math.min(text.length, firstIndex + 114);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function highlightPatternForQuery(query: string) {
  const terms = extractSearchTerms(query).sort((left, right) => right.length - left.length);

  if (terms.length === 0) {
    return null;
  }

  return new RegExp(`(${terms.map((term) => escapeRegExp(term)).join('|')})`, 'gi');
}

export function withSearchParams(pathname: string, params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim().length > 0) {
      searchParams.set(key, value);
    }
  }

  const search = searchParams.toString();
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

function withQueryForSearchResult(to: string, kind: UniversalSearchResultKind, query: string) {
  const [pathname, rawSearch = ''] = to.split('?');
  const existingParams = Object.fromEntries(new URLSearchParams(rawSearch).entries());

  if (kind === 'cosmic-backpack') {
    return withSearchParams(pathname, {
      ...existingParams,
      highlight: query,
    });
  }

  return withSearchParams(pathname, {
    ...existingParams,
    search: query,
  });
}

interface SearchResultSeed {
  kind: UniversalSearchResultKind;
  chainId: string;
  chainTitle: string;
  title: string;
  subtitle: string;
  snippet: string;
  to: string;
  tags?: string[];
  extraText?: unknown[];
  preferredChainOnly?: boolean;
}

export interface UniversalSearchIndexEntry {
  id: string;
  kind: UniversalSearchResultKind;
  kindLabel: string;
  chainId: string;
  chainTitle: string;
  title: string;
  subtitle: string;
  snippet: string;
  to: string;
  tags: string[];
  searchableText: string;
  normalizedTitle: string;
  normalizedSubtitle: string;
  normalizedSnippet: string;
  preferredChainOnly: boolean;
}

function buildSearchableText(seed: SearchResultSeed) {
  return normalizeSearchQuery(
    [seed.title, seed.subtitle, seed.snippet, seed.tags ?? [], ...(seed.extraText ?? [])]
      .map((value) => valueToSearchText(value))
      .join(' '),
  );
}

function buildSearchIndexEntry(seed: SearchResultSeed): UniversalSearchIndexEntry {
  return {
    id: `${seed.kind}:${seed.chainId}:${seed.to}`,
    kind: seed.kind,
    kindLabel: kindLabels[seed.kind],
    chainId: seed.chainId,
    chainTitle: seed.chainTitle,
    title: seed.title,
    subtitle: seed.subtitle,
    snippet: seed.snippet,
    to: seed.to,
    tags: cleanTagList(seed.tags ?? []),
    searchableText: buildSearchableText(seed),
    normalizedTitle: normalizeSearchQuery(seed.title),
    normalizedSubtitle: normalizeSearchQuery(seed.subtitle),
    normalizedSnippet: normalizeSearchQuery(seed.snippet),
    preferredChainOnly: seed.preferredChainOnly === true,
  };
}

function pushSearchIndexEntry(
  results: UniversalSearchIndexEntry[],
  seed: SearchResultSeed,
) {
  results.push(buildSearchIndexEntry(seed));
}

function matchesSearchTerms(terms: string[], haystack: string) {
  return terms.every((term) => haystack.includes(term));
}

export function queryUniversalSearchResults(input: {
  query: string;
  index: UniversalSearchIndexEntry[];
  preferredChainId?: string;
}) {
  const query = input.query.trim();
  const normalizedQuery = normalizeSearchQuery(query);
  const terms = extractSearchTerms(query);

  if (terms.length === 0) {
    return [] as UniversalSearchResult[];
  }

  return input.index
    .filter((entry) => (!entry.preferredChainOnly || entry.chainId === input.preferredChainId) && matchesSearchTerms(terms, entry.searchableText))
    .map<UniversalSearchResult>((entry) => ({
      id: entry.id,
      kind: entry.kind,
      kindLabel: entry.kindLabel,
      chainId: entry.chainId,
      chainTitle: entry.chainTitle,
      title: entry.title,
      subtitle: entry.subtitle,
      snippet: entry.snippet,
      to: withQueryForSearchResult(entry.to, entry.kind, query),
      tags: entry.tags,
      score: (() => {
        let score = kindPriority[entry.kind];

        if (input.preferredChainId && input.preferredChainId === entry.chainId) {
          score += 40;
        }

        if (entry.normalizedTitle === normalizedQuery) {
          score += 180;
        } else if (entry.normalizedTitle.startsWith(normalizedQuery)) {
          score += 140;
        } else if (entry.normalizedTitle.includes(normalizedQuery)) {
          score += 100;
        }

        if (entry.normalizedSubtitle.includes(normalizedQuery)) {
          score += 28;
        }

        if (entry.normalizedSnippet.includes(normalizedQuery)) {
          score += 18;
        }

        score += terms.filter((term) => entry.normalizedTitle.includes(term)).length * 12;

        return score;
      })(),
    }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 120);
}

export function filterUniversalSearchResults(input: {
  results: UniversalSearchResult[];
  preferredChainId?: string;
  currentChainOnly?: boolean;
  category?: UniversalSearchCategory;
}) {
  const category = input.category ?? 'all';
  const allowedKinds = category === 'all' ? null : universalSearchCategoryKinds[category];

  return input.results.filter((result) => {
    if (input.currentChainOnly && (!input.preferredChainId || result.chainId !== input.preferredChainId)) {
      return false;
    }

    if (allowedKinds && !allowedKinds.includes(result.kind)) {
      return false;
    }

    return true;
  });
}

interface SearchPurchaseSubtypeDefinition {
  name: string;
  type: number | null;
}

interface SearchPurchaseClassification {
  perkSubtypeKeys: Set<string>;
  itemSubtypeKeys: Set<string>;
  subsystemSubtypeKeys: Set<string>;
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

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
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

function getSelectionTags(value: unknown) {
  return cleanTagList(getStringList(asRecord(value).tags));
}

function getSelectionSubtypeKey(value: unknown) {
  const record = asRecord(value);
  return getOptionalIdentifier(record.subtype) ?? getOptionalIdentifier(record.subtypeKey);
}

function getSelectionPurchaseType(value: unknown) {
  const record = asRecord(value);
  return getOptionalNumber(record.purchaseType) ?? getOptionalNumber(record._type);
}

function getPurchaseSubtypeDefinitions(value: unknown): Record<string, SearchPurchaseSubtypeDefinition> {
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
  definitions: Record<string, SearchPurchaseSubtypeDefinition>,
  subtypeKeys: string[],
) {
  const nextDefinitions: Record<string, SearchPurchaseSubtypeDefinition> = {
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

function getPurchaseSubtypeSection(
  subtypeKey: string,
  definition: SearchPurchaseSubtypeDefinition,
): 'perks' | 'subsystems' | 'items' | 'other' {
  const lowerName = definition.name.toLowerCase();

  if (definition.type === 1) {
    return 'items';
  }

  if (definition.type === 2) {
    return 'subsystems';
  }

  if (definition.type === 3) {
    return 'other';
  }

  if (definition.type === 0 && (subtypeKey === '0' || lowerName.includes('perk'))) {
    return 'perks';
  }

  return 'subsystems';
}

function getPurchaseClassification(
  subtypeDefinitions: Record<string, SearchPurchaseSubtypeDefinition>,
): SearchPurchaseClassification {
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

function getPurchaseTabForSelection(
  value: unknown,
  classification: SearchPurchaseClassification,
): 'perks' | 'subsystems' | 'items' | 'other' {
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

function buildSelectionRoute(
  chainId: string,
  jumpId: string,
  participantId: string,
  tab: 'perks' | 'subsystems' | 'items' | 'other' | 'drawbacks' | 'alt-forms',
) {
  return withSearchParams(`/chains/${chainId}/jumps/${jumpId}`, {
    participant: participantId,
    panel: 'participation',
    participationTab: tab,
  });
}

export function buildUniversalSearchIndex(input: {
  overviews: ChainOverview[];
  bundles: NativeChainBundle[];
}) {
  const results: UniversalSearchIndexEntry[] = [];
  const overviewByChainId = new Map(input.overviews.map((overview) => [overview.chainId, overview]));

  for (const bundle of input.bundles) {
    const workspace = buildBranchWorkspace(bundle, bundle.chain.activeBranchId);
    const overview = overviewByChainId.get(bundle.chain.id);
    const chainTitle = cleanLabel(bundle.chain.title, 'Untitled Chain');
    const branchTitle = cleanLabel(workspace.activeBranch?.title, 'Active Branch');
    const jumpById = new Map(workspace.jumps.map((jump) => [jump.id, jump]));
    const jumperById = new Map(workspace.jumpers.map((jumper) => [jumper.id, jumper]));
    const companionById = new Map(workspace.companions.map((companion) => [companion.id, companion]));
    const snapshotById = new Map(workspace.snapshots.map((snapshot) => [snapshot.id, snapshot]));

    pushSearchIndexEntry(results, {
      kind: 'chain',
      chainId: bundle.chain.id,
      chainTitle,
      title: chainTitle,
      subtitle: `Chain | ${branchTitle}`,
      snippet: `${overview?.jumperCount ?? workspace.jumpers.length} jumpers, ${overview?.jumpCount ?? workspace.jumps.length} jumps, active branch ${branchTitle}.`,
      to: withSearchParams(`/chains/${bundle.chain.id}/overview`, { search: '' }),
      extraText: [bundle.chain.importSourceMetadata, branchTitle],
    });

    for (const branch of bundle.branches) {
      pushSearchIndexEntry(results, {
        kind: 'branch',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(branch.title, 'Untitled Branch'),
        subtitle: `Branch | ${chainTitle}`,
        snippet: buildSearchSnippet('', branch.notes, branch.sourceMetadata, branch.forkedFromJumpId ? 'forked from jump' : ''),
        to: withSearchParams(`/chains/${bundle.chain.id}/backups`, {}),
        extraText: [branch.notes, branch.sourceMetadata],
      });
    }

    for (const jumper of workspace.jumpers) {
      pushSearchIndexEntry(results, {
        kind: 'jumper',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(jumper.name, 'Untitled Jumper'),
        subtitle: `Jumper | ${chainTitle}`,
        snippet: buildSearchSnippet(
          '',
          jumper.notes,
          jumper.gender,
          jumper.background.summary,
          jumper.background.description,
          jumper.personality,
        ),
        to: withSearchParams(`/chains/${bundle.chain.id}/jumpers`, {
          jumper: jumper.id,
        }),
        extraText: [jumper.gender, jumper.notes, jumper.personality, jumper.background, jumper.importSourceMetadata],
      });
    }

    for (const companion of workspace.companions) {
      const parentName = companion.parentJumperId ? jumperById.get(companion.parentJumperId)?.name ?? '' : '';

      pushSearchIndexEntry(results, {
        kind: 'companion',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(companion.name, 'Untitled Companion'),
        subtitle: `Companion | ${chainTitle}`,
        snippet: buildSearchSnippet('', companion.role, companion.status, parentName, companion.importSourceMetadata),
        to: withSearchParams(`/chains/${bundle.chain.id}/companions`, {
          companion: companion.id,
        }),
        extraText: [companion.role, companion.status, parentName, companion.importSourceMetadata],
      });
    }

    for (const jump of workspace.jumps) {
      pushSearchIndexEntry(results, {
        kind: 'jump',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(jump.title, `Jump ${jump.orderIndex + 1}`),
        subtitle: `Jump | ${jump.status} | ${jump.jumpType} | ${chainTitle}`,
        snippet: buildSearchSnippet('', jump.duration, jump.importSourceMetadata),
        to: withSearchParams(`/chains/${bundle.chain.id}/jumps/${jump.id}`, {}),
        extraText: [jump.status, jump.jumpType, jump.duration, jump.importSourceMetadata],
      });
    }

    for (const participation of workspace.participations) {
      const jump = jumpById.get(participation.jumpId);
      const participant =
        jumperById.get(participation.participantId) ??
        companionById.get(participation.participantId) ??
        null;
      const rawSubtypeDefinitions = getPurchaseSubtypeDefinitions(asRecord(participation.importSourceMetadata).purchaseSubtypes);
      const purchaseSubtypeDefinitions = ensurePurchaseSubtypeDefinitions(
        rawSubtypeDefinitions,
        participation.purchases
          .map((purchase) => getSelectionSubtypeKey(purchase))
          .filter((subtypeKey): subtypeKey is string => Boolean(subtypeKey)),
      );
      const purchaseClassification = getPurchaseClassification(purchaseSubtypeDefinitions);

      pushSearchIndexEntry(results, {
        kind: 'participation',
        chainId: bundle.chain.id,
        chainTitle,
        title: `${cleanLabel(participant?.name, 'Participant')} @ ${cleanLabel(jump?.title, 'Jump')}`,
        subtitle: `Participation & Purchases | ${chainTitle}`,
        snippet: buildSearchSnippet(
          '',
          participation.notes,
          participation.purchases,
          participation.drawbacks,
          participation.retainedDrawbacks,
          participation.altForms,
          participation.narratives,
          participation.origins,
          participation.importSourceMetadata,
        ),
        to: withSearchParams(`/chains/${bundle.chain.id}/jumps/${participation.jumpId}`, {
          participant: participation.participantId,
          panel: 'participation',
        }),
        extraText: [
          participant?.name,
          jump?.title,
          participation.notes,
          participation.purchases,
          participation.drawbacks,
          participation.retainedDrawbacks,
          participation.altForms,
          participation.narratives,
          participation.origins,
          participation.importSourceMetadata,
        ],
      });

      for (const purchase of participation.purchases) {
        const record = asRecord(purchase);
        const title = cleanLabel(getSelectionTitle(purchase), 'Untitled Purchase');
        const tags = getSelectionTags(purchase);

        pushSearchIndexEntry(results, {
          kind: 'selection',
          chainId: bundle.chain.id,
          chainTitle,
          title,
          subtitle: `${getSelectionKindTitle(record)} | ${cleanLabel(participant?.name, 'Participant')} @ ${cleanLabel(jump?.title, 'Jump')} | ${chainTitle}`,
          snippet: buildSearchSnippet('', record.description, record.summary, tags),
          to: buildSelectionRoute(
            bundle.chain.id,
            participation.jumpId,
            participation.participantId,
            getPurchaseTabForSelection(purchase, purchaseClassification),
          ),
          tags,
          extraText: [record.description, record.summary, record.source, tags],
        });
      }

      for (const drawback of [...participation.drawbacks, ...participation.retainedDrawbacks]) {
        const record = asRecord(drawback);
        const title = cleanLabel(getSelectionTitle(drawback), 'Untitled Drawback');
        const tags = getSelectionTags(drawback);

        pushSearchIndexEntry(results, {
          kind: 'selection',
          chainId: bundle.chain.id,
          chainTitle,
          title,
          subtitle: `${getSelectionKindTitle(record)} | ${cleanLabel(participant?.name, 'Participant')} @ ${cleanLabel(jump?.title, 'Jump')} | ${chainTitle}`,
          snippet: buildSearchSnippet('', record.description, record.summary, tags),
          to: buildSelectionRoute(bundle.chain.id, participation.jumpId, participation.participantId, 'drawbacks'),
          tags,
          extraText: [record.description, record.summary, record.source, tags],
        });
      }

      for (const altForm of participation.altForms) {
        const fields = readAltFormNoteFields(altForm);

        pushSearchIndexEntry(results, {
          kind: 'alt-form',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(fields.name, 'Alt form note'),
          subtitle: `Alt form | ${cleanLabel(participant?.name, 'Participant')} @ ${cleanLabel(jump?.title, 'Jump')} | ${chainTitle}`,
          snippet: buildSearchSnippet('', fields.notes, fields.source),
          to: buildSelectionRoute(bundle.chain.id, participation.jumpId, participation.participantId, 'alt-forms'),
          extraText: [fields.source, fields.notes],
        });
      }
    }

    for (const effect of workspace.effects) {
      const ownerLabel =
        effect.ownerEntityType === 'chain'
          ? chainTitle
          : effect.ownerEntityType === 'jumper'
            ? cleanLabel(jumperById.get(effect.ownerEntityId)?.name, effect.ownerEntityType)
            : effect.ownerEntityType === 'companion'
              ? cleanLabel(companionById.get(effect.ownerEntityId)?.name, effect.ownerEntityType)
              : effect.ownerEntityType === 'jump'
                ? cleanLabel(jumpById.get(effect.ownerEntityId)?.title, effect.ownerEntityType)
                : effect.ownerEntityType === 'snapshot'
                  ? cleanLabel(snapshotById.get(effect.ownerEntityId)?.title, effect.ownerEntityType)
                  : effect.ownerEntityType;

      pushSearchIndexEntry(results, {
        kind: 'effect',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(effect.title, 'Untitled Effect'),
        subtitle: `Effect | ${effect.category} | ${effect.state} | ${chainTitle}`,
        snippet: buildSearchSnippet('', effect.description, ownerLabel, effect.importSourceMetadata),
        to: withSearchParams(`/chains/${bundle.chain.id}/effects`, {
          effect: effect.id,
        }),
        extraText: [effect.description, effect.category, effect.state, ownerLabel, effect.importSourceMetadata],
      });
    }

    for (const note of workspace.notes) {
      const ownerLabel =
        note.ownerEntityType === 'chain'
          ? chainTitle
          : note.ownerEntityType === 'jumper'
            ? cleanLabel(jumperById.get(note.ownerEntityId)?.name, note.ownerEntityType)
            : note.ownerEntityType === 'companion'
              ? cleanLabel(companionById.get(note.ownerEntityId)?.name, note.ownerEntityType)
              : note.ownerEntityType === 'jump'
                ? cleanLabel(jumpById.get(note.ownerEntityId)?.title, note.ownerEntityType)
                : note.ownerEntityType === 'snapshot'
                  ? cleanLabel(snapshotById.get(note.ownerEntityId)?.title, note.ownerEntityType)
                  : note.ownerEntityType;

      pushSearchIndexEntry(results, {
        kind: 'note',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(note.title, 'Untitled Note'),
        subtitle: `Note | ${note.noteType} | ${chainTitle}`,
        snippet: buildSearchSnippet('', note.content, note.tags, ownerLabel),
        to: withSearchParams(`/chains/${bundle.chain.id}/notes`, {
          note: note.id,
        }),
        tags: cleanTagList(note.tags),
        extraText: [note.noteType, note.content, note.tags, ownerLabel],
      });
    }

    for (const snapshot of workspace.snapshots) {
      pushSearchIndexEntry(results, {
        kind: 'snapshot',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(snapshot.title, 'Untitled Snapshot'),
        subtitle: `Snapshot | ${chainTitle}`,
        snippet: buildSearchSnippet('', snapshot.description, snapshot.summary),
        to: withSearchParams(`/chains/${bundle.chain.id}/backups`, {
          snapshot: snapshot.id,
        }),
        extraText: [snapshot.description, snapshot.summary],
      });
    }

    const cosmicBackpackState = readCosmicBackpackState(bundle.chain);

    pushSearchIndexEntry(results, {
      kind: 'cosmic-backpack',
      chainId: bundle.chain.id,
      chainTitle,
      title: 'Cosmic Backpack plan notes',
      subtitle: `Cosmic Backpack | ${chainTitle}`,
      snippet: buildSearchSnippet(
        '',
        cosmicBackpackState.notes,
        cosmicBackpackState.appearanceNotes,
        cosmicBackpackState.containerForm,
        cosmicBackpackState.customUpgrades,
      ),
      to: withSearchParams(`/chains/${bundle.chain.id}/cosmic-backpack`, {}),
      extraText: [
        cosmicBackpackState.notes,
        cosmicBackpackState.appearanceNotes,
        cosmicBackpackState.containerForm,
        cosmicBackpackState.customUpgrades,
      ],
    });

    for (const option of cosmicBackpackOptionCatalog) {
      pushSearchIndexEntry(results, {
        kind: 'cosmic-backpack',
        chainId: bundle.chain.id,
        chainTitle,
        title: option.title,
        subtitle: `Cosmic Backpack | ${chainTitle}`,
        snippet: buildSearchSnippet('', option.description, option.note, option.costBp === 0 ? 'Free' : `${option.costBp} BP`),
        to: withSearchParams(`/chains/${bundle.chain.id}/cosmic-backpack`, {}),
        extraText: [option.description, option.note, option.costBp],
        preferredChainOnly: true,
      });
    }

    for (const customUpgrade of cosmicBackpackState.customUpgrades) {
      pushSearchIndexEntry(results, {
        kind: 'cosmic-backpack',
        chainId: bundle.chain.id,
        chainTitle,
        title: cleanLabel(customUpgrade.title, 'Custom Cosmic Backpack upgrade'),
        subtitle: `Cosmic Backpack | Custom upgrade | ${chainTitle}`,
        snippet: buildSearchSnippet(
          '',
          customUpgrade.notes,
          customUpgrade.costBp === 0 ? 'Free' : `${customUpgrade.costBp} BP`,
          customUpgrade.addedVolumeFt3 > 0 ? `${customUpgrade.addedVolumeFt3} ft^3 added` : '',
          customUpgrade.volumeMultiplier !== 1 ? `x${customUpgrade.volumeMultiplier} volume scale` : '',
        ),
        to: withSearchParams(`/chains/${bundle.chain.id}/cosmic-backpack`, {}),
        extraText: [
          customUpgrade.notes,
          customUpgrade.costBp,
          customUpgrade.addedVolumeFt3,
          customUpgrade.volumeMultiplier,
        ],
        preferredChainOnly: true,
      });
    }
  }

  return results;
}

export function buildUniversalSearchResults(input: {
  query: string;
  overviews: ChainOverview[];
  bundles: NativeChainBundle[];
  preferredChainId?: string;
}) {
  const index = buildUniversalSearchIndex({
    overviews: input.overviews,
    bundles: input.bundles,
  });

  return queryUniversalSearchResults({
    query: input.query,
    index,
    preferredChainId: input.preferredChainId,
  });
}

export function readRouteSearchValue(search: string) {
  const searchParams = new URLSearchParams(search);

  return (
    searchParams.get('q') ??
    searchParams.get('search') ??
    searchParams.get('highlight') ??
    ''
  );
}
