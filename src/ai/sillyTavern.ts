import { WorldbookSchema, type Worldbook } from './schema';

// SillyTavern World Info / lorebook interchange.
//
// Jumpchain never emulates SillyTavern's activation/insertion engine. ST metadata (constant,
// order, position, probability, vectorized, selective, depth, ...) describes how SillyTavern
// activates an entry; Jumpchain has its own hybrid retrieval/context engine. This module only
// converts between the two file formats and preserves ST-specific metadata for round trips.

// Fields captured natively on a WorldEntry; they are stripped from preserved metadata so export
// always lets current Jumpchain values (text, title, aliases, enabled) win over stale imports.
const NATIVELY_CAPTURED = new Set(['uid', 'key', 'keysecondary', 'comment', 'content', 'disable']);

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function dedupe(values: string[]): string[] { return [...new Set(values)]; }

/** True when the JSON has the recognizable SillyTavern World Info shape: a top-level `entries` object of entry objects. */
export function isSillyTavernWorldInfo(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const entries = (raw as Record<string, unknown>).entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  return Object.values(entries as Record<string, unknown>).every(e => e !== null && typeof e === 'object' && !Array.isArray(e));
}

/** Convert a SillyTavern World Info JSON object into a native Jumpchain Worldbook. */
export function parseSillyTavernWorldInfo(raw: unknown, filename: string, id: string, setting = ''): Worldbook {
  const source = `Imported from SillyTavern World Info: ${filename}`;
  const obj = raw as Record<string, unknown>;
  const rawEntries = (obj.entries ?? {}) as Record<string, unknown>;
  const entries = Object.entries(rawEntries).map(([key, value]) => {
    const e = value as Record<string, unknown>;
    const uid = e.uid ?? key;
    const keys = dedupe(asStringArray(e.key));
    const comment = typeof e.comment === 'string' ? e.comment.trim() : '';
    const title = comment || keys[0] || `Entry ${key}`;
    const content = typeof e.content === 'string' ? e.content : '';
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) if (!NATIVELY_CAPTURED.has(k)) metadata[k] = v;
    return {
      // Deterministic/stable internal ID: imported worldbook ID + original ST UID. The ST UID is
      // preserved separately in interop metadata and is not relied upon as the sole identity.
      id: `${id}_st_${String(uid)}`,
      title,
      text: content,
      aliases: keys,
      enabled: e.disable !== true,
      source,
      authority: 'canonical-source' as const,
      interop: {
        sillyTavern: {
          uid: uid as number | string,
          secondaryKeys: dedupe(asStringArray(e.keysecondary)),
          metadata: Object.keys(metadata).length ? metadata : undefined,
        },
      },
    };
  });
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : filename;
  const bookMetadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (k !== 'entries' && k !== 'name') bookMetadata[k] = v;
  return WorldbookSchema.parse({
    id, title: name, setting, entries,
    interop: { sillyTavern: { metadata: Object.keys(bookMetadata).length ? bookMetadata : undefined } },
  });
}

/** Export a native Jumpchain Worldbook as a SillyTavern-compatible World Info JSON object. */
export function exportSillyTavernWorldbook(book: Worldbook): unknown {
  const entries: Record<string, unknown> = {};
  for (const entry of book.entries) {
    const st = entry.interop?.sillyTavern;
    const key = String(st?.uid ?? entry.id);
    const preserved = st?.metadata ? { ...st.metadata } : {};
    const aliases = dedupe([...entry.aliases]);
    entries[key] = {
      // Restore preserved ST fields first so unknown/extension metadata survives; current
      // Jumpchain values below then win for everything natively represented.
      ...preserved,
      uid: st?.uid ?? key,
      key: aliases.length ? aliases : [entry.title],
      keysecondary: st?.secondaryKeys?.length ? [...st.secondaryKeys] : [],
      comment: entry.title,
      content: entry.text,
      // Sensible defaults for native entries with no SillyTavern metadata; preserved values win
      // for imported entries because `preserved` was spread above.
      constant: preserved.constant ?? false,
      selective: preserved.selective ?? false,
      order: preserved.order ?? 100,
      position: preserved.position ?? 0,
      disable: !entry.enabled,
      probability: preserved.probability ?? 100,
      useProbability: preserved.useProbability ?? true,
      excludeRecursion: preserved.excludeRecursion ?? false,
      depth: preserved.depth ?? 4,
      vectorized: preserved.vectorized ?? false,
    };
  }
  const result: Record<string, unknown> = { entries, name: book.title };
  const bookMetadata = book.interop?.sillyTavern?.metadata;
  if (bookMetadata) for (const [k, v] of Object.entries(bookMetadata)) if (!(k in result)) result[k] = v;
  return result;
}