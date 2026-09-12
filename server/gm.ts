import { randomUUID } from 'node:crypto';
import type { NativeChainBundle } from '../src/domain/save';
import { compileContext } from '../src/ai/context';
import { knowledgeRecords, hybridRetriever, indexFingerprint, searchableText, narrationLoreQuery, type RetrievalFilter } from '../src/ai/retrieval';
import { ModelProposalSchema, SummarySchema, stableStringify, type Campaign, type Turn } from '../src/ai/schema';
import { proposalInstructions, validateWorldbookScopes } from '../src/ai/state';
import { planContext, planMessages, messageCandidates, estimateTokens, type ContextCandidate } from '../src/ai/planner';
import { planTransition, summaryEvents } from '../src/ai/transitions';
import { LocalStore } from './store';
import { openAICompatible, parseModelJson, type Message } from './provider';

export class GMService {
  readonly running = new Map<string, AbortController>();
  constructor(readonly store: LocalStore) {}
  assertIdle(id: string) { if (this.running.has(id)) throw new Error('A campaign operation is running. Stop it or wait before editing.'); }
  async exclusive<T>(id: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertIdle(id); const controller = new AbortController(); this.running.set(id,controller);
    try { return await fn(controller.signal); } finally { this.running.delete(id); }
  }
  async retrieve(campaign: Campaign, query: string, filter: RetrievalFilter = {}, signal?: AbortSignal) {
    const config = await this.store.config(); const records = knowledgeRecords(campaign); const diagnostics: string[] = [];
    let index = await this.store.index(campaign.id); let queryVector: number[] | undefined;
    if (config.providers.embeddings) {
      const signature = `${config.providers.embeddings.baseUrl}|${config.providers.embeddings.model}`;
      if (!index || index.fingerprint !== indexFingerprint(records) || index.provider !== signature) { diagnostics.push('Index stale or absent: using BM25. Rebuild in Knowledge.'); index = undefined; }
      else try { [queryVector] = await openAICompatible.embed(config.providers.embeddings,[query],signal); if (Object.values(index.vectors).some(v => v.length !== queryVector!.length)) { diagnostics.push('Embedding dimensions changed: rebuild index. Using BM25.'); index = undefined; } }
      catch (e) { if (signal?.aborted) throw e; diagnostics.push(`Embedding endpoint unavailable: ${(e as Error).message} Using BM25.`); index = undefined; }
    }
    const options = {filter:{jump:campaign.state.scene.stamp.jumpId,before:campaign.state.scene.stamp.elapsedMinutes,...filter},index,queryVector};
    let results = hybridRetriever.search(query,records,{...options,limit:records.length});
    if (config.providers.reranking && results.length) try {
      const scores = await openAICompatible.rerank(config.providers.reranking,query,results.map(r => searchableText(r.record)),signal);
      results = results.map((r,i) => ({...r,score:scores[i],reason:`${r.reason}; reranked`})).sort((a,b) => b.score-a.score);
    } catch (e) { if (signal?.aborted) throw e; diagnostics.push(`Reranker unavailable: ${(e as Error).message} Using fused ranking.`); }
    return {results,diagnostics};
  }
  async rebuild(campaign: Campaign, bundle: NativeChainBundle, signal?: AbortSignal) {
    // Reject worldbooks whose Jump ownership cannot be validated against the supplied tracker
    // bundle before any embedding work begins. Bad ownership must fail loudly, never index silently.
    validateWorldbookScopes(campaign, bundle);
    const config = (await this.store.config()).providers.embeddings;
    if (!config) throw new Error('No embeddings model assigned. Lexical retrieval already works without an index.');
    const records = knowledgeRecords(campaign);
    // Embed the canonical searchable projection (title, entities/aliases, tags, text) — the same
    // representation lexical retrieval scores — so retrieval metadata helps dense ranking too.
    const vectors = await openAICompatible.embed(config,records.map(r => searchableText(r)),signal);
    await this.store.saveIndex(campaign.id,{version:1,fingerprint:indexFingerprint(records),provider:`${config.baseUrl}|${config.model}`,vectors:Object.fromEntries(records.map((r,i) => [r.id,vectors[i]]))});
    return {count:records.length};
  }
  async analyze(campaign: Campaign, bundle: NativeChainBundle, turn: Turn, signal?: AbortSignal) {
    const config = await this.store.config(); const provider = config.providers.extraction ?? config.providers.narrator;
    const records = knowledgeRecords({...campaign,state:turn.before});
    const relevant = hybridRetriever.search(`${turn.action} ${turn.narrative}`, records, {limit:records.length,filter:{jump:turn.before.scene.stamp.jumpId,before:turn.before.scene.stamp.elapsedMinutes}});
    const previousState = {scene:turn.before.scene, npcs:turn.before.npcs.filter(n => turn.before.scene.npcIds.includes(n.id) || turn.before.scene.presentCompanionIds.includes(n.companionId ?? '') || turn.narrative.toLowerCase().includes(n.name.toLowerCase()))};
    const messages: Message[] = [{role:'system',content:proposalInstructions(turn.id,turn.before)+'\nOnly relevant prior memories are included. Omitted history is unknown; never infer that it did not happen.'}, {role:'user',content:stableStringify({previousState,priorMemories:[],exchange:{user:turn.action,gm:turn.narrative}})}];
    const base = messageCandidates(messages);
    const candidates: ContextCandidate[] = relevant.filter(r=>r.record.sourceType==='memory').map(r => {
      const record = turn.before.facts.find(f=>f.id===r.record.sourceId) ?? turn.before.events.find(e=>e.id===r.record.sourceId);
      if (!record) throw new Error(`Retrieved prior memory is missing: ${r.record.sourceId}`);
      const content = stableStringify(record);
      return {id:`memory/${r.record.id}`,name:'Prior memory',content,sourceIds:[r.record.sourceId],estimatedTokens:estimateTokens(content)+1,salience:'relevant',authority:r.record.authority,domain:'world-state',mandatory:false,relevance:r.score,signal:r.reason,sourceClass:'memory',pool:'memory'};
    });
    const plan = planContext([...base,...candidates], provider, {pools:{memory:{count:16}}});
    messages[1].content = stableStringify({...JSON.parse(messages[1].content),priorMemories:plan.selected.filter(c=>c.pool==='memory').map(c=>JSON.parse(c.content))});
    turn.extractionContext = messages;
    turn.extractionPlan = plan;
    const raw = await openAICompatible.generate(provider,messages,() => {},signal,true);
    const proposal = ModelProposalSchema.parse(parseModelJson(raw));
    turn.transitionPlan = planTransition(turn.before,proposal.operations,{origin:'model-proposal',campaign,bundle,sourceTurnId:turn.id},`${turn.id}/proposal`);
    return proposal;
  }
  async generate(id: string, bundle: NativeChainBundle, action: string, expectedRevision: number, emit: (event: unknown) => void, signal?: AbortSignal) {
    const campaign = await this.store.get(id);
    if (campaign.revision !== expectedRevision) throw new Error('Campaign changed in another window. Reload before generating.');
    if (campaign.turns.some(t => t.proposalStatus === 'pending')) throw new Error('Review or reject pending changes before the next turn.');
    // Imported/stale campaign data must not reach retrieval or narration while a persisted
    // worldbook names a Jump outside this branch. Fail loudly with the actionable scope error.
    validateWorldbookScopes(campaign, bundle);
    const config = await this.store.config();
    // Scene-aware lore query: the bare action alone (“I look around.”) carries little retrieval
    // signal; the established location and active threads are stable, causally relevant signals.
    // A precise action is unchanged in effect — its own terms still dominate the query.
    const {results,diagnostics} = await this.retrieve(campaign,narrationLoreQuery(action,campaign.state.scene),{},signal);
    const context = compileContext(bundle,campaign,action,config.providers.narrator,results,diagnostics);
    const turn: Turn = {id:randomUUID(),createdAt:new Date().toISOString(),action,narrative:'',inContinuity:true,status:'generating',error:'',context,proposal:null,proposalStatus:'none',before:structuredClone(campaign.state),baseRevision:campaign.revision,extractionContext:[]};
    await this.store.transaction(id,c => { c.turns.push(turn); });
    emit({type:'context',turnId:turn.id,context});
    try {
      turn.narrative = await openAICompatible.generate(config.providers.narrator,context.messages,token => {turn.narrative += token; emit({type:'token',token});},signal);
      turn.status = 'complete'; emit({type:'phase',phase:'Analyzing proposed state changes'});
      // Persist narration before a potentially slow/failing second model call.
      await this.store.transaction(id,c => {c.turns[c.turns.findIndex(t => t.id === turn.id)] = structuredClone(turn);});
      try { turn.proposal = await this.analyze(campaign,bundle,turn,signal); turn.proposalStatus = 'pending'; }
      catch (e) { turn.error = `State analysis: ${(e as Error).message}`; }
    } catch (e) { turn.status = signal?.aborted ? 'cancelled' : 'failed'; turn.error = (e as Error).message; }
    await this.store.transaction(id,c => {c.turns[c.turns.findIndex(t => t.id === turn.id)] = turn;});
    emit({type:'done',turn});
  }
  async summarize(campaign: Campaign, level: 'scene'|'chapter'|'arc'|'jump'|'chain', eventIds: string[], title: string, signal?: AbortSignal) {
    const events = summaryEvents(campaign.state,eventIds);
    const config = await this.store.config(); const provider = config.providers.summarization ?? config.providers.narrator;
    const messages: Message[] = [{role:'system',content:'Summarize only these reviewed campaign events. Preserve uncertainty, chronology, and NPC belief versus truth. Reference event IDs. This summary is an inferred retrieval aid, not authoritative state.'},{role:'user',content:stableStringify({level,events})}];
    planMessages(messages,provider);
    const text = await openAICompatible.generate(provider,messages,() => {},signal);
    return SummarySchema.omit({id:true}).parse({level,title,text,eventIds,stamp:campaign.state.scene.stamp});
  }
}
