import type { Authority, Campaign, Fact } from './schema';
import { fingerprint } from './schema';

export interface KnowledgeRecord {
  id: string; text: string; title: string; authority: Authority; factKey: string;
  sourceType: 'world' | 'memory' | 'summary'; sourceId: string;
  setting: string; jump: string; entities: string[]; character: string[]; location: string; owner: string;
  tags: string[]; time?: number; validTo?: number; superseded: boolean; supersededAt?: number;
}
export interface RetrievalFilter { setting?: string; jump?: string; sourceType?: KnowledgeRecord['sourceType']; entity?: string; character?: string; location?: string; owner?: string; before?: number; authority?: Authority; tags?: string[] }
export interface VectorIndex { version: 1; fingerprint: string; provider: string; vectors: Record<string, number[]> }
export interface Retrieved { record: KnowledgeRecord; score: number; reason: string }
export interface Retriever { search(query: string, records: KnowledgeRecord[], options: { limit: number; filter?: RetrievalFilter; index?: VectorIndex; queryVector?: number[] }): Retrieved[] }
export const authorityRank: Record<Authority, number> = { authoritative: 6, 'campaign-established': 5, 'player-established': 4, 'canonical-source': 3, inferred: 2, speculative: 1 };
export function tokens(text: string): string[] { return text.toLocaleLowerCase().match(/[\p{L}\p{N}_'-]+/gu) ?? []; }
export function chunks(text: string, size = 1800): string[] {
  const result: string[] = []; let buffer = '';
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (buffer.length + paragraph.length > size && buffer) { result.push(buffer); buffer = ''; }
    if (paragraph.length > size) {
      if (buffer) { result.push(buffer); buffer = ''; }
      for (let i = 0; i < paragraph.length; i += size - 160) result.push(paragraph.slice(i, i + size));
    } else buffer += (buffer ? '\n\n' : '') + paragraph;
  }
  if (buffer) result.push(buffer);
  return result;
}
export function knowledgeRecords(campaign: Campaign): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];
  // Disabled entries (e.g. imported SillyTavern entries with disable: true) stay persisted and
  // editable but are never retrieval/index candidates.
  for (const book of campaign.worldbooks.filter(b => b.enabled)) for (const entry of book.entries.filter(e => e.enabled)) {
    // Book-level Worldbook.jumpId is the authoritative Jump scope: the whole book belongs to its
    // owning Jump. entry.jumpId is legacy/finer-grained metadata and must never widen a book
    // into another Jump (a blank entry value in particular must not leak across Jumps).
    const jump = book.jumpId;
    chunks(entry.text + (entry.annotation ? `\nPlayer annotation: ${entry.annotation}` : '')).forEach((text, i) => records.push({
      id: `${book.id}/${entry.id}/${i}`, sourceId: entry.id, text, title: entry.title, authority: entry.authority, factKey: entry.factKey,
      sourceType: 'world', setting: book.setting, jump, entities: [...entry.entities, ...entry.aliases], character: entry.entities,
      location: entry.location, owner: entry.owner, tags: [...book.tags, ...entry.tags], time: entry.validFrom, validTo: entry.validTo, superseded: false,
    }));
  }
  for (const fact of campaign.state.facts) records.push({...factRecord(fact), supersededAt:campaign.state.facts.find(f=>f.id===fact.supersededBy && f.stamp.jumpId===fact.stamp.jumpId)?.stamp.elapsedMinutes});
  for (const event of campaign.state.events) records.push({
    id: event.id, sourceId: event.id, title: event.summary.slice(0, 100), text: JSON.stringify(event), authority: event.authority, factKey: '', sourceType: 'memory', setting: '',
    jump: event.stamp.jumpId, time: event.stamp.elapsedMinutes, entities: event.entities, character: event.participants, location: event.location,
    owner: '', tags: event.tags, superseded: !!event.supersededBy, supersededAt:campaign.state.events.find(e=>e.id===event.supersededBy && e.stamp.jumpId===event.stamp.jumpId)?.stamp.elapsedMinutes,
  });
  for (const summary of campaign.state.summaries) records.push({
    id: summary.id, sourceId: summary.id, title: summary.title, text: JSON.stringify(summary), authority: 'inferred', factKey: '', sourceType: 'summary', setting: '',
    jump: summary.stamp.jumpId, time: summary.stamp.elapsedMinutes, entities: [], character: [], location: '', owner: '', tags: [summary.level], superseded: false,
  });
  return records;
}
function factRecord(fact: Fact): KnowledgeRecord {
  return { id: fact.id, sourceId: fact.id, title: fact.key, text: fact.text, authority: fact.authority, factKey: fact.key, sourceType: 'memory', setting: '', jump: fact.stamp.jumpId, time: fact.stamp.elapsedMinutes, entities: fact.entities, character: fact.entities, location: fact.location, owner: '', tags: fact.tags, superseded: !!fact.supersededBy };
}
export function indexFingerprint(records: KnowledgeRecord[]): string { return fingerprint(records.slice().sort((a,b) => a.id.localeCompare(b.id))); }
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
  return aa && bb ? dot / Math.sqrt(aa*bb) : 0;
}
export function eligibleRecords(records: KnowledgeRecord[], filter: RetrievalFilter = {}): KnowledgeRecord[] {
  // Resolve conflicts BEFORE scoring, so stale canon cannot win just by matching more words.
  const temporal = records.filter(r => (!filter.setting || !r.setting || r.setting === filter.setting) && (!filter.jump || !r.jump || r.jump === filter.jump || r.sourceType !== 'world') && (!r.superseded || (filter.before !== undefined && r.supersededAt !== undefined && filter.before < r.supersededAt)) && !(filter.before !== undefined && (!filter.jump || r.jump === filter.jump) && r.time !== undefined && r.time > filter.before) && !(r.validTo !== undefined && filter.before !== undefined && r.validTo < filter.before));
  const winners = new Map<string, KnowledgeRecord>();
  for (const r of temporal) if (r.factKey) {
    const key = r.factKey.toLocaleLowerCase(); const prev = winners.get(key);
    if (!prev || authorityRank[r.authority] > authorityRank[prev.authority] || (r.authority === prev.authority && (r.time ?? 0) > (prev.time ?? 0))) winners.set(key, r);
  }
  return temporal.filter(r => {
    const winner = r.factKey ? winners.get(r.factKey.toLocaleLowerCase()) : undefined;
    if (winner && winner.sourceId !== r.sourceId) return false;
    if (filter.setting && r.setting && r.setting !== filter.setting) return false;
    if (filter.jump && r.jump && r.jump !== filter.jump && r.sourceType === 'world') return false;
    if (filter.sourceType && r.sourceType !== filter.sourceType) return false;
    if (filter.entity && !r.entities.includes(filter.entity)) return false;
    if (filter.character && !r.character.includes(filter.character)) return false;
    if (filter.location && r.location !== filter.location) return false;
    if (filter.owner && r.owner !== filter.owner) return false;
    if (filter.authority && r.authority !== filter.authority) return false;
    if (filter.tags?.some(tag => !r.tags.includes(tag))) return false;
    return true;
  });
}
export const hybridRetriever: Retriever = {
  search(query, records, { limit, filter = {}, index, queryVector }) {
    const eligible = eligibleRecords(records, filter); const terms = [...new Set(tokens(query))];
    const docs = eligible.map(r => tokens(`${r.title} ${r.title} ${r.entities.join(' ')} ${r.tags.join(' ')} ${r.text}`));
    const avg = docs.reduce((n,d) => n+d.length, 0) / (docs.length || 1) || 1;
    const df = terms.map(t => docs.filter(d => d.includes(t)).length);
    const lexical = eligible.map((record, i) => ({ record, score: terms.reduce((sum, t, j) => {
      const tf = docs[i].filter(w => w === t).length;
      return sum + Math.log(1 + (docs.length - df[j] + .5) / (df[j] + .5)) * tf * 2.2 / (tf + 1.2 * (.25 + .75 * docs[i].length / avg));
    }, 0) })).filter(r => r.score > 0).sort((a,b) => b.score-a.score || a.record.id.localeCompare(b.record.id));
    const dense = queryVector && index ? eligible.map(record => ({ record, score: cosine(queryVector, index.vectors[record.id] ?? []) })).filter(r => r.score > .15).sort((a,b) => b.score-a.score) : [];
    const scores = new Map<string, Retrieved>();
    [lexical, dense].forEach((ranked, source) => ranked.forEach(({record}, i) => {
      const prev = scores.get(record.id) ?? { record, score: 0, reason: '' };
      prev.score += 1 / (60+i+1); prev.reason += source ? ' dense' : ' BM25'; scores.set(record.id, prev);
    }));
    // Empty query is a chronological/history browse, not a failed semantic search.
    if (!terms.length) for (const record of eligible) scores.set(record.id, {record, score: 1/61, reason: 'history'});
    return [...scores.values()].map(r => ({ ...r, score: r.score + authorityRank[r.record.authority]*.0002 + (r.record.jump === filter.jump && r.record.time !== undefined && filter.before !== undefined ? .001/(1+(filter.before-r.record.time)/1440) : 0), reason: `${r.reason.trim()}; ${r.record.authority}; source ${r.record.sourceId}` })).sort((a,b) => b.score-a.score || a.record.id.localeCompare(b.record.id)).slice(0,limit);
  },
};
