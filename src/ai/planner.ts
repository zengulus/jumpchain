import type { ContextLayer, ProviderConfig } from './schema';
import { estimateTokens, inputBudget } from './budget';
export { estimateTokens, inputBudget } from './budget';

export interface ContextCandidate extends ContextLayer {
  id: string;
  relevance: number;
  signal: string;
  sourceClass: string;
  pool?: string;
  /** Logical source identity for diversity caps (e.g. one worldbook entry and all its chunks).
   * Records that are one-to-one with their source (facts, events, summaries) omit it. */
  groupKey?: string;
  /** Rendering section; affects presentation only, never admission. */
  section?: string;
  /** Within a tail pool, larger sequence values are newer. */
  sequence?: number;
}
export interface ContextPolicy {
  sections?: string[];
  pools?: Record<string, { tokens?: number; count?: number; groupCount?: number; groupMarginal?: { diminishing: boolean }; tail?: boolean }>;
}
export interface ContextDecision {
  candidate: ContextCandidate;
  included: boolean;
  reason: 'mandatory' | 'selected' | 'input-budget' | 'pool-tokens' | 'pool-count' | 'pool-group' | 'history-tail';
  budget?: string;
}
export interface ContextPlan {
  policy: ContextPolicy;
  selected: ContextCandidate[];
  decisions: ContextDecision[];
  inputBudget: number;
  estimatedTokens: number;
}
const salience = { directive: 0, focused: 1, required: 2, relevant: 3, background: 4 };
const key = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** Authority/domain are labels, never admission scores. Eligibility/conflicts belong upstream. */
export function planContext(candidates: ContextCandidate[], provider: Pick<ProviderConfig, 'contextWindow' | 'maxOutput'>, policy: ContextPolicy = {}): ContextPlan {
  const budget = inputBudget(provider);
  if (!Number.isFinite(budget) || budget < 0) throw new Error('Context exceeded budget: invalid input/output reserve.');
  const ids = new Set<string>();
  for (const c of candidates) {
    if (ids.has(c.id)) throw new Error(`Duplicate context candidate: ${c.id}`);
    ids.add(c.id);
    if (!Number.isFinite(c.relevance) || !Number.isInteger(c.estimatedTokens) || c.estimatedTokens < 0) throw new Error(`Invalid context cost/relevance: ${c.id}`);
  }
  for (const [pool, cap] of Object.entries(policy.pools ?? {})) {
    for (const value of [cap.tokens,cap.count,cap.groupCount]) if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`Invalid context pool cap: ${pool}`);
    const members = candidates.filter(c=>c.pool===pool);
    if (cap.tail && (members.some(c=>c.mandatory || !Number.isFinite(c.sequence)) || new Set(members.map(c=>c.salience)).size > 1 || new Set(members.map(c=>c.section)).size > 1)) throw new Error(`Tail pool requires optional candidates with one salience/section and explicit chronology: ${pool}`);
    if (cap.groupMarginal !== undefined && cap.groupCount !== undefined) throw new Error(`Pool ${pool} cannot combine groupCount and groupMarginal policies.`);
    if (cap.groupMarginal !== undefined && cap.groupMarginal.diminishing !== true) throw new Error(`Pool ${pool} groupMarginal requires diminishing admission.`);
  }
  const compare = (a: ContextCandidate, b: ContextCandidate) => {
    const aTail = !!(a.pool && policy.pools?.[a.pool]?.tail);
    const bTail = !!(b.pool && policy.pools?.[b.pool]?.tail);
    const eff = (c: ContextCandidate) => c.pool && policy.pools?.[c.pool]?.groupMarginal ? effRank.get(c.id) : undefined;
    const aEff = eff(a), bEff = eff(b);
    return salience[a.salience] - salience[b.salience]
      || Number(aTail)-Number(bTail)
      || (aTail && bTail ? key(a.pool!,b.pool!) || (b.sequence ?? 0)-(a.sequence ?? 0) : 0)
      || (a.pool === b.pool && aEff !== undefined && bEff !== undefined ? aEff - bEff || (ordinal.get(a.id)! - ordinal.get(b.id)!) : 0)
      || b.relevance-a.relevance || key(a.id,b.id);
  };
  // Soft source diversity for groupMarginal pools: rank the pool's optional candidates by raw
  // relevance (1 = best; fusion, reranker and overlap scores are incomparable in magnitude, so
  // only order is used) and demote each further chunk of one logical source by a fifth of a rank:
  // effective value 5·rank + (k−1) for the k-th chunk of its group. Admission then follows this
  // effective order and ordinary caps do the excluding — fresh relevant sources usually precede
  // redundant repeats, a strong repeat still beats a weak fresh source, unused capacity fills
  // from one source, and no candidate is ever vetoed for repetition alone.
  const ordinal = new Map<string, number>();
  const effRank = new Map<string, number>();
  for (const [pool, cap] of Object.entries(policy.pools ?? {})) if (cap.groupMarginal) {
    let rank = 0;
    const groupSeq = new Map<string, number>();
    for (const c of candidates.filter(c => c.pool === pool && !c.mandatory).sort(compare)) {
      ordinal.set(c.id, ++rank);
      const k = c.groupKey ? (groupSeq.get(c.groupKey) ?? 0) + 1 : 1;
      if (c.groupKey) groupSeq.set(c.groupKey, k);
      effRank.set(c.id, 5*rank + (k - 1));
    }
  }
  const ordered = [...candidates].sort((a,b) => Number(b.mandatory)-Number(a.mandatory) || compare(a,b));
  const usage = new Map<string, {tokens:number;count:number;closed:boolean;groups:Map<string,number>}>();
  const decisions: ContextDecision[] = []; const selected: ContextCandidate[] = []; let total = 0;
  for (const candidate of ordered) {
    const pool = candidate.pool; const cap = pool ? policy.pools?.[pool] : undefined;
    const used = usage.get(pool ?? '') ?? {tokens:0,count:0,closed:false,groups:new Map<string,number>()};
    let reason: ContextDecision['reason'] = candidate.mandatory ? 'mandatory' : 'selected';
    let affected: string | undefined;
    if (!candidate.mandatory && used.closed) { reason = 'history-tail'; affected = pool; }
    else if (total + candidate.estimatedTokens > budget) { reason = 'input-budget'; affected = 'input'; }
    else if (cap?.tokens !== undefined && used.tokens + candidate.estimatedTokens > cap.tokens) { reason = 'pool-tokens'; affected = pool; }
    else if (cap?.count !== undefined && used.count + 1 > cap.count) { reason = 'pool-count'; affected = pool; }
    // Source diversity as admission policy, never a rank rewrite. groupCount is a hard per-source
    // quota (skipped candidates do not consume pool slots). groupMarginal is soft: repetition only
    // demotes a candidate's admission order (see effRank above), so ordinary caps exclude it and
    // unused capacity can still be filled by further chunks of the same source.
    else if (!candidate.mandatory && cap?.groupCount !== undefined && candidate.groupKey && (used.groups.get(candidate.groupKey) ?? 0) + 1 > cap.groupCount) { reason = 'pool-group'; affected = pool; }
    const included = reason === 'mandatory' || reason === 'selected';
    if (!included && candidate.mandatory) throw new Error(`Context exceeded budget in ${candidate.name} (${affected}, ${reason}). Required restrictions are never silently dropped.`);
    decisions.push({candidate, included, reason, ...(affected ? {budget:affected} : {})});
    if (included) { selected.push(candidate); total += candidate.estimatedTokens; used.tokens += candidate.estimatedTokens; used.count++; if (pool && candidate.groupKey) used.groups.set(candidate.groupKey,(used.groups.get(candidate.groupKey) ?? 0)+1); }
    else if (cap?.tail) used.closed = true;
    if (pool) usage.set(pool, used);
  }
  // Use the same total order for presentation, reversing only each contiguous tail group.
  const sectionOrder = (c: ContextCandidate) => {
    const index = policy.sections?.indexOf(c.section ?? '') ?? -1;
    return index < 0 ? (policy.sections?.length ?? 0) : index;
  };
  selected.sort((a,b)=>sectionOrder(a)-sectionOrder(b) || compare(a,b));
  for (const pool of Object.keys(policy.pools ?? {}).sort()) if (policy.pools![pool].tail) {
    const positions = selected.flatMap((c,i)=>c.pool===pool ? [i] : []);
    const history = positions.map(i=>selected[i]).sort((a,b)=>(a.sequence ?? 0)-(b.sequence ?? 0) || key(a.id,b.id));
    positions.forEach((position,i)=>{selected[position]=history[i];});
  }
  return {selected, decisions, policy:structuredClone(policy), inputBudget:budget, estimatedTokens:total};
}

/** Candidate construction only: callers may add task-specific optional sources. */
export function messageCandidates(messages: {role:'system'|'user'|'assistant';content:string}[]): ContextCandidate[] {
  return messages.map((m,i) => ({id:`message/${String(i).padStart(12,'0')}`,name:m.role,content:m.content,sourceIds:[],estimatedTokens:estimateTokens(m.content)+32,
    salience:'required',authority:null,domain:'narrative-history',mandatory:true,relevance:0,signal:'complete structured input',sourceClass:'structured'}));
}
/** Structured prompts use the same planner; complete source documents are mandatory. */
export function planMessages(messages: {role:'system'|'user'|'assistant';content:string}[], provider: ProviderConfig): ContextPlan {
  return planContext(messageCandidates(messages), provider);
}
