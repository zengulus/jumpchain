export function normalizeTag(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeTagKey(value: string | null | undefined) {
  return normalizeTag(value).toLocaleLowerCase();
}

export function normalizeTagList(tags: Iterable<string>) {
  const nextTags: string[] = [];
  const seenKeys = new Set<string>();

  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);

    if (normalizedTag.length === 0) {
      continue;
    }

    const normalizedKey = normalizeTagKey(normalizedTag);

    if (seenKeys.has(normalizedKey)) {
      continue;
    }

    seenKeys.add(normalizedKey);
    nextTags.push(normalizedTag);
  }

  return nextTags;
}

export function sortTagList(tags: Iterable<string>) {
  return normalizeTagList(tags).sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: 'base',
    }),
  );
}

export function readTagList(value: unknown) {
  return Array.isArray(value)
    ? normalizeTagList(value.filter((entry): entry is string => typeof entry === 'string'))
    : [];
}

export function parseTagInput(value: string) {
  return normalizeTagList(value.split(/[,;\n]+/));
}

export function formatTagList(tags: Iterable<string>) {
  return normalizeTagList(tags).join(', ');
}

export function tagListIncludesAny(tags: Iterable<string>, targetTags: Iterable<string>) {
  const tagKeys = new Set(normalizeTagList(tags).map((tag) => normalizeTagKey(tag)));

  return normalizeTagList(targetTags).some((tag) => tagKeys.has(normalizeTagKey(tag)));
}

export function getTagSuggestions(input: {
  suggestions: Iterable<string>;
  selectedTags: Iterable<string>;
  query?: string;
}) {
  const selectedKeys = new Set(normalizeTagList(input.selectedTags).map((tag) => normalizeTagKey(tag)));
  const normalizedQuery = normalizeTagKey(input.query);

  return sortTagList(input.suggestions).filter((tag) => {
    if (selectedKeys.has(normalizeTagKey(tag))) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    return normalizeTagKey(tag).includes(normalizedQuery);
  });
}

function readRecordTags(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? readTagList((value as Record<string, unknown>).tags)
    : [];
}

export function collectWorkspaceTags(input: {
  notes?: Array<{ tags: unknown }>;
  participations?: Array<{
    purchases?: unknown[];
    drawbacks?: unknown[];
    retainedDrawbacks?: unknown[];
  }>;
}) {
  return sortTagList([
    ...(input.notes ?? []).flatMap((note) => readTagList(note.tags)),
    ...(input.participations ?? []).flatMap((participation) => [
      ...(participation.purchases ?? []).flatMap((entry) => readRecordTags(entry)),
      ...(participation.drawbacks ?? []).flatMap((entry) => readRecordTags(entry)),
      ...(participation.retainedDrawbacks ?? []).flatMap((entry) => readRecordTags(entry)),
    ]),
  ]);
}
