import { buildBranchWorkspace } from '../../domain/chain/selectors';
import type { NativeChainBundle } from '../../domain/save';
import type { ChainOverview } from '../../db/persistence';
import { personalRealityOptionCatalog, personalRealityPages } from '../personal-reality/catalog';
import { readPersonalRealityState } from '../personal-reality/model';

export type UniversalSearchResultKind =
  | 'chain'
  | 'branch'
  | 'jumper'
  | 'companion'
  | 'jump'
  | 'participation'
  | 'effect'
  | 'note'
  | 'snapshot'
  | 'personal-reality';

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
  score: number;
}

const kindLabels: Record<UniversalSearchResultKind, string> = {
  chain: 'Chain',
  branch: 'Branch',
  jumper: 'Jumper',
  companion: 'Companion',
  jump: 'Jump',
  participation: 'Participation & Purchases',
  effect: 'Effect',
  note: 'Note',
  snapshot: 'Snapshot',
  'personal-reality': 'Personal Reality',
};

const kindPriority: Record<UniversalSearchResultKind, number> = {
  chain: 12,
  branch: 10,
  jumper: 26,
  companion: 24,
  jump: 25,
  participation: 20,
  effect: 22,
  note: 21,
  snapshot: 18,
  'personal-reality': 16,
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeSearchQuery(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
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

function buildResultScore(
  kind: UniversalSearchResultKind,
  title: string,
  subtitle: string,
  snippet: string,
  query: string,
  chainId: string,
  preferredChainId?: string,
) {
  const normalizedQuery = normalizeSearchQuery(query);
  const normalizedTitle = normalizeSearchQuery(title);
  const normalizedSubtitle = normalizeSearchQuery(subtitle);
  const normalizedSnippet = normalizeSearchQuery(snippet);

  let score = kindPriority[kind];

  if (preferredChainId && preferredChainId === chainId) {
    score += 40;
  }

  if (normalizedTitle === normalizedQuery) {
    score += 180;
  } else if (normalizedTitle.startsWith(normalizedQuery)) {
    score += 140;
  } else if (normalizedTitle.includes(normalizedQuery)) {
    score += 100;
  }

  if (normalizedSubtitle.includes(normalizedQuery)) {
    score += 28;
  }

  if (normalizedSnippet.includes(normalizedQuery)) {
    score += 18;
  }

  const terms = extractSearchTerms(query);
  score += terms.filter((term) => normalizedTitle.includes(term)).length * 12;

  return score;
}

interface SearchResultSeed {
  kind: UniversalSearchResultKind;
  chainId: string;
  chainTitle: string;
  title: string;
  subtitle: string;
  snippet: string;
  to: string;
  extraText?: unknown[];
}

function pushResult(
  results: UniversalSearchResult[],
  seed: SearchResultSeed,
  query: string,
  preferredChainId?: string,
) {
  if (!matchesSearchQuery(query, seed.title, seed.subtitle, seed.snippet, ...(seed.extraText ?? []))) {
    return;
  }

  results.push({
    id: `${seed.kind}:${seed.chainId}:${seed.to}`,
    kind: seed.kind,
    kindLabel: kindLabels[seed.kind],
    chainId: seed.chainId,
    chainTitle: seed.chainTitle,
    title: seed.title,
    subtitle: seed.subtitle,
    snippet: seed.snippet,
    to: seed.to,
    score: buildResultScore(seed.kind, seed.title, seed.subtitle, seed.snippet, query, seed.chainId, preferredChainId),
  });
}

export function buildUniversalSearchResults(input: {
  query: string;
  overviews: ChainOverview[];
  bundles: NativeChainBundle[];
  preferredChainId?: string;
}) {
  const query = input.query.trim();

  if (extractSearchTerms(query).length === 0) {
    return [] as UniversalSearchResult[];
  }

  const results: UniversalSearchResult[] = [];
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

    pushResult(
      results,
      {
        kind: 'chain',
        chainId: bundle.chain.id,
        chainTitle,
        title: chainTitle,
        subtitle: `Chain | ${branchTitle}`,
        snippet: `${overview?.jumperCount ?? workspace.jumpers.length} jumpers, ${overview?.jumpCount ?? workspace.jumps.length} jumps, active branch ${branchTitle}.`,
        to: withSearchParams(`/chains/${bundle.chain.id}/overview`, { search: query }),
        extraText: [bundle.chain.importSourceMetadata, branchTitle],
      },
      query,
      input.preferredChainId,
    );

    for (const branch of bundle.branches) {
      pushResult(
        results,
        {
          kind: 'branch',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(branch.title, 'Untitled Branch'),
          subtitle: `Branch | ${chainTitle}`,
          snippet: buildSearchSnippet(query, branch.notes, branch.sourceMetadata, branch.forkedFromJumpId ? 'forked from jump' : ''),
          to: withSearchParams(`/chains/${bundle.chain.id}/backups`, { search: query }),
          extraText: [branch.notes, branch.sourceMetadata],
        },
        query,
        input.preferredChainId,
      );
    }

    for (const jumper of workspace.jumpers) {
      pushResult(
        results,
        {
          kind: 'jumper',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(jumper.name, 'Untitled Jumper'),
          subtitle: `Jumper | ${chainTitle}`,
          snippet: buildSearchSnippet(
            query,
            jumper.notes,
            jumper.gender,
            jumper.background.summary,
            jumper.background.description,
            jumper.personality,
          ),
          to: withSearchParams(`/chains/${bundle.chain.id}/jumpers`, {
            jumper: jumper.id,
            search: query,
          }),
          extraText: [jumper.gender, jumper.notes, jumper.personality, jumper.background, jumper.importSourceMetadata],
        },
        query,
        input.preferredChainId,
      );
    }

    for (const companion of workspace.companions) {
      const parentName = companion.parentJumperId ? jumperById.get(companion.parentJumperId)?.name ?? '' : '';

      pushResult(
        results,
        {
          kind: 'companion',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(companion.name, 'Untitled Companion'),
          subtitle: `Companion | ${chainTitle}`,
          snippet: buildSearchSnippet(query, companion.role, companion.status, parentName, companion.importSourceMetadata),
          to: withSearchParams(`/chains/${bundle.chain.id}/companions`, {
            companion: companion.id,
            search: query,
          }),
          extraText: [companion.role, companion.status, parentName, companion.importSourceMetadata],
        },
        query,
        input.preferredChainId,
      );
    }

    for (const jump of workspace.jumps) {
      pushResult(
        results,
        {
          kind: 'jump',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(jump.title, `Jump ${jump.orderIndex + 1}`),
          subtitle: `Jump | ${jump.status} | ${jump.jumpType} | ${chainTitle}`,
          snippet: buildSearchSnippet(query, jump.duration, jump.importSourceMetadata),
          to: withSearchParams(`/chains/${bundle.chain.id}/jumps/${jump.id}`, { search: query }),
          extraText: [jump.status, jump.jumpType, jump.duration, jump.importSourceMetadata],
        },
        query,
        input.preferredChainId,
      );
    }

    for (const participation of workspace.participations) {
      const jump = jumpById.get(participation.jumpId);
      const jumper = jumperById.get(participation.jumperId);

      pushResult(
        results,
        {
          kind: 'participation',
          chainId: bundle.chain.id,
          chainTitle,
          title: `${cleanLabel(jumper?.name, 'Jumper')} @ ${cleanLabel(jump?.title, 'Jump')}`,
          subtitle: `Participation & Purchases | ${chainTitle}`,
          snippet: buildSearchSnippet(
            query,
            participation.notes,
            participation.narratives,
            participation.origins,
            participation.importSourceMetadata,
          ),
          to: withSearchParams(`/chains/${bundle.chain.id}/jumps/${participation.jumpId}`, {
            jumper: participation.jumperId,
            search: query,
            panel: 'participation',
          }),
          extraText: [
            jumper?.name,
            jump?.title,
            participation.notes,
            participation.narratives,
            participation.origins,
            participation.importSourceMetadata,
          ],
        },
        query,
        input.preferredChainId,
      );
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

      pushResult(
        results,
        {
          kind: 'effect',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(effect.title, 'Untitled Effect'),
          subtitle: `Effect | ${effect.category} | ${effect.state} | ${chainTitle}`,
          snippet: buildSearchSnippet(query, effect.description, ownerLabel, effect.importSourceMetadata),
          to: withSearchParams(`/chains/${bundle.chain.id}/effects`, {
            effect: effect.id,
            search: query,
          }),
          extraText: [effect.description, effect.category, effect.state, ownerLabel, effect.importSourceMetadata],
        },
        query,
        input.preferredChainId,
      );
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

      pushResult(
        results,
        {
          kind: 'note',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(note.title, 'Untitled Note'),
          subtitle: `Note | ${note.noteType} | ${chainTitle}`,
          snippet: buildSearchSnippet(query, note.content, note.tags, ownerLabel),
          to: withSearchParams(`/chains/${bundle.chain.id}/notes`, {
            note: note.id,
            search: query,
          }),
          extraText: [note.noteType, note.content, note.tags, ownerLabel],
        },
        query,
        input.preferredChainId,
      );
    }

    for (const snapshot of workspace.snapshots) {
      pushResult(
        results,
        {
          kind: 'snapshot',
          chainId: bundle.chain.id,
          chainTitle,
          title: cleanLabel(snapshot.title, 'Untitled Snapshot'),
          subtitle: `Snapshot | ${chainTitle}`,
          snippet: buildSearchSnippet(query, snapshot.description, snapshot.summary),
          to: withSearchParams(`/chains/${bundle.chain.id}/backups`, {
            snapshot: snapshot.id,
            search: query,
          }),
          extraText: [snapshot.description, snapshot.summary],
        },
        query,
        input.preferredChainId,
      );
    }

    const personalRealityState = readPersonalRealityState(bundle.chain);

    pushResult(
      results,
      {
        kind: 'personal-reality',
        chainId: bundle.chain.id,
        chainTitle,
        title: 'Personal Reality build notes',
        subtitle: `Personal Reality | ${chainTitle}`,
        snippet: buildSearchSnippet(query, personalRealityState.notes),
        to: withSearchParams(`/chains/${bundle.chain.id}/personal-reality`, {
          page: '2',
          highlight: query,
        }),
        extraText: [personalRealityState.notes],
      },
      query,
      input.preferredChainId,
    );

    for (const [pageNumber, pageNote] of Object.entries(personalRealityState.pageNotes)) {
      if (!pageNote || pageNote.trim().length === 0) {
        continue;
      }

      const page = personalRealityPages.find((entry) => String(entry.number) === pageNumber);

      pushResult(
        results,
        {
          kind: 'personal-reality',
          chainId: bundle.chain.id,
          chainTitle,
          title: page ? `Personal Reality Page ${page.number}: ${page.title}` : `Personal Reality Page ${pageNumber}`,
          subtitle: `Personal Reality notes | ${chainTitle}`,
          snippet: buildSearchSnippet(query, pageNote),
          to: withSearchParams(`/chains/${bundle.chain.id}/personal-reality`, {
            page: pageNumber,
            highlight: query,
          }),
          extraText: [pageNote],
        },
        query,
        input.preferredChainId,
      );
    }

    if (input.preferredChainId === bundle.chain.id) {
      for (const option of personalRealityOptionCatalog) {
        pushResult(
          results,
          {
            kind: 'personal-reality',
            chainId: bundle.chain.id,
            chainTitle,
            title: option.title,
            subtitle: `Personal Reality | Page ${option.page} | ${chainTitle}`,
            snippet: buildSearchSnippet(query, option.description, option.costText, option.requirementsText),
            to: withSearchParams(`/chains/${bundle.chain.id}/personal-reality`, {
              page: String(option.page),
              highlight: query,
            }),
            extraText: [option.description, option.costText, option.requirementsText],
          },
          query,
          input.preferredChainId,
        );
      }
    }
  }

  return results
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 120);
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
