import { randomUUID } from 'node:crypto';
import type { NativeChainBundle } from '../src/domain/save';
import { compileContext, estimateTokens } from '../src/ai/context';
import { knowledgeRecords, hybridRetriever, indexFingerprint, type RetrievalFilter, type Retrieved } from '../src/ai/retrieval';
import { ProposalSchema, SummarySchema, stableStringify, type Campaign, type ProviderConfig, type Turn } from '../src/ai/schema';
import { applyProposal, proposalInstructions } from '../src/ai/state';
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
    let results = hybridRetriever.search(query,records,{...options,limit:Math.max(30,campaign.settings.loreDepth+campaign.settings.memoryDepth)});
    if (config.providers.reranking && results.length) try {
      const scores = await openAICompatible.rerank(config.providers.reranking,query,results.map(r => r.record.text),signal);
      results = results.map((r,i) => ({...r,score:scores[i],reason:`${r.reason}; reranked`})).sort((a,b) => b.score-a.score);
    } catch (e) { if (signal?.aborted) throw e; diagnostics.push(`Reranker unavailable: ${(e as Error).message} Using fused ranking.`); }
    const lore = results.filter(r => r.record.sourceType === 'world').slice(0,campaign.settings.loreDepth);
    const memories = results.filter(r => r.record.sourceType !== 'world').slice(0,campaign.settings.memoryDepth);
    return {results:[...memories,...lore],diagnostics};
  }
  async rebuild(campaign: Campaign, signal?: AbortSignal) {
    const config = (await this.store.config()).providers.embeddings;
    if (!config) throw new Error('No embeddings model assigned. Lexical retrieval already works without an index.');
    const records = knowledgeRecords(campaign);
    const vectors = await openAICompatible.embed(config,records.map(r => `${r.title}\n${r.text}`),signal);
    await this.store.saveIndex(campaign.id,{version:1,fingerprint:indexFingerprint(records),provider:`${config.baseUrl}|${config.model}`,vectors:Object.fromEntries(records.map((r,i) => [r.id,vectors[i]]))});
    return {count:records.length};
  }
  async analyze(campaign: Campaign, bundle: NativeChainBundle, turn: Turn, signal?: AbortSignal) {
    const config = await this.store.config(); const provider = config.providers.extraction ?? config.providers.narrator;
    const relevant = hybridRetriever.search(`${turn.action} ${turn.narrative}`, knowledgeRecords({...campaign,state:turn.before}), {limit:16,filter:{jump:turn.before.scene.stamp.jumpId,before:turn.before.scene.stamp.elapsedMinutes}});
    const selectedIds = new Set(relevant.map(r => r.record.sourceId));
    const previousState = {scene:turn.before.scene, npcs:turn.before.npcs.filter(n => turn.before.scene.npcIds.includes(n.id) || turn.before.scene.presentCompanionIds.includes(n.companionId ?? '') || turn.narrative.toLowerCase().includes(n.name.toLowerCase())), facts:turn.before.facts.filter(f => selectedIds.has(f.id)), events:turn.before.events.filter(e => selectedIds.has(e.id))};
    const messages: Message[] = [{role:'system',content:proposalInstructions(turn.id,turn.before)+'\nOnly relevant prior memories are included. Omitted history is unknown; never infer that it did not happen.'}, {role:'user',content:stableStringify({previousState,exchange:{user:turn.action,gm:turn.narrative}})}];
    turn.extractionContext = messages;
    this.checkBudget(provider,messages);
    const raw = await openAICompatible.generate(provider,messages,() => {},signal,true);
    const proposal = ProposalSchema.parse(parseModelJson(raw));
    applyProposal(turn.before,proposal,bundle,campaign,[turn.id]); return proposal;
  }
  checkBudget(provider: ProviderConfig, messages: Message[]) {
    if (messages.reduce((n,m) => n+estimateTokens(m.content)+32,0)+provider.maxOutput+512 > provider.contextWindow) throw new Error('Structured task context exceeded budget. Assign a larger extraction/summary context or select fewer source events.');
  }
  async generate(id: string, bundle: NativeChainBundle, action: string, expectedRevision: number, emit: (event: unknown) => void, signal?: AbortSignal) {
    const campaign = await this.store.get(id);
    if (campaign.revision !== expectedRevision) throw new Error('Campaign changed in another window. Reload before generating.');
    if (campaign.turns.some(t => t.proposalStatus === 'pending')) throw new Error('Review or reject pending changes before the next turn.');
    const config = await this.store.config();
    const {results,diagnostics} = await this.retrieve(campaign,action,{},signal);
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
    const events = campaign.state.events.filter(e => eventIds.includes(e.id) && !e.supersededBy);
    if (!events.length || events.length !== new Set(eventIds).size) throw new Error('Select existing, current events for the summary.');
    const config = await this.store.config(); const provider = config.providers.summarization ?? config.providers.narrator;
    const messages: Message[] = [{role:'system',content:'Summarize only these reviewed campaign events. Preserve uncertainty, chronology, and NPC belief versus truth. Reference event IDs. This summary is an inferred retrieval aid, not authoritative state.'},{role:'user',content:stableStringify({level,events})}];
    this.checkBudget(provider,messages);
    const text = await openAICompatible.generate(provider,messages,() => {},signal);
    return SummarySchema.parse({id:randomUUID(),level,title,text,eventIds,stamp:campaign.state.scene.stamp});
  }
}
