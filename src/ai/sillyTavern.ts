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

// Conventional SillyTavern entry fields used to recognize lorebook entries without overfitting
// to one SillyTavern version. Unknown/extension fields are still preserved via metadata.
const ST_RECOGNIZED_FIELDS = new Set(['uid', 'key', 'keysecondary', 'comment', 'constant', 'selective', 'order', 'position', 'disable', 'probability', 'useProbability', 'depth', 'vectorized']);

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

function dedupe(values: string[]): string[] { return [...new Set(values)]; }

// Object keys become part of native entry IDs; keep only ID-safe characters so generated IDs stay
// clean. The original, unmodified key is always preserved separately in interop metadata.
function sanitizeEntryKey(key: string): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe || 'entry';
}

/**
 * True when the JSON has a recognizable SillyTavern World Info shape: a top-level `entries`
 * object of entry objects, where each non-empty entry carries usable ST-like fields
 * (`content` as a string, or at least one conventional ST field). Unrelated JSON such as
 * `{"entries": {"tax": {"amount": 5}}}` is not classified as SillyTavern.
 */
export function isSillyTavernWorldInfo(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const entries = (raw as Record<string, unknown>).entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  return Object.values(entries as Record<string, unknown>).every(e => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
    const entry = e as Record<string, unknown>;
    if (typeof entry.content === 'string') return true;
    return Object.keys(entry).some(k => ST_RECOGNIZED_FIELDS.has(k));
  });
}

/** Convert a SillyTavern World Info JSON object into a native Jumpchain Worldbook. */
export function parseSillyTavernWorldInfo(raw: unknown, filename: string, id: string, setting = ''): Worldbook {
  const source = `Imported from SillyTavern World Info: ${filename}`;
  const obj = raw as Record<string, unknown>;
  const rawEntries = (obj.entries ?? {}) as Record<string, unknown>;
  const usedIds = new Set<string>();
  const entries = Object.entries(rawEntries).map(([entryKey, value]) => {
    const e = value as Record<string, unknown>;
    const content = typeof e.content === 'string' ? e.content : '';
    if (!content.trim()) throw new Error(`SillyTavern entry "${entryKey}" has no usable content.`);
    const uid = typeof e.uid === 'number' || typeof e.uid === 'string' ? e.uid : undefined;
    const keys = dedupe(asStringArray(e.key));
    const comment = typeof e.comment === 'string' ? e.comment.trim() : '';
    const title = comment || keys[0] || `Entry ${entryKey}`;
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) if (!NATIVELY_CAPTURED.has(k)) metadata[k] = v;
    // Deterministic/stable internal ID derives from the source `entries` object key (the stable
    // source identity), never from the ST uid, which may repeat across object keys in malformed
    // third-party lorebooks. The original key is preserved in interop metadata. Sanitization can
    // collapse distinct keys, so a deterministic suffix keeps native IDs unique.
    const baseId = `${id}_st_${sanitizeEntryKey(entryKey)}`;
    let nativeId = baseId;
    for (let suffix = 2; usedIds.has(nativeId); suffix++) nativeId = `${baseId}_${suffix}`;
    usedIds.add(nativeId);
    return {
      id: nativeId,
      title,
      text: content,
      aliases: keys,
      enabled: e.disable !== true,
      source,
      authority: 'canonical-source' as const,
      interop: {
        sillyTavern: {
          uid,
          entryKey,
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
  const usedKeys = new Set<string>();
  for (const entry of book.entries) {
    const st = entry.interop?.sillyTavern;
    // Prefer the preserved original object key; fall back to uid (legacy interop), then to the
    // native entry ID for entries created natively without SillyTavern metadata.
    const preferredKey = st?.entryKey && st.entryKey.length ? st.entryKey : String(st?.uid ?? entry.id);
    // Never silently overwrite one exported entry with another; deterministic suffix fallback
    // preserves every entry.
    let key = preferredKey;
    for (let suffix = 2; usedKeys.has(key); suffix++) key = `${preferredKey}_${suffix}`;
    usedKeys.add(key);
    const preserved = st?.metadata ? { ...st.metadata } : {};
    const aliases = dedupe([...entry.aliases]);
    entries[key] = {
      // Restore preserved ST fields first so unknown/extension metadata survives; current
      // Jumpchain values below then win for everything natively represented.
      ...preserved,
      uid: st?.uid ?? preferredKey,
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