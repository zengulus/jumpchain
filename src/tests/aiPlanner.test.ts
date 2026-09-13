import { describe, it, expect } from 'vitest';
import { planContext, planMessages, estimateTokens, type ContextCandidate } from '../ai/planner';
import { compileContext } from '../ai/context';
import { ContextPlanSchema, ContextSchema, FactSchema, ProviderSchema, TurnSchema, WorldbookSchema } from '../ai/schema';
import { eligibleRecords, hybridRetriever, knowledgeRecords } from '../ai/retrieval';
import { normalizeParticipationSelections } from '../domain/jump/selection';
import { aiFixture } from './aiFixture';
const candidate = (id:string, overrides:Partial<ContextCandidate>={}):ContextCandidate => ({id,name:id,content:id,sourceIds:[id],estimatedTokens:10,salience:'relevant',authority:'speculative',domain:'world-state',mandatory:false,relevance:1,signal:'test relevance',sourceClass:'test',...overrides});
const windowFor = (budget:number) => ({contextWindow:budget+640,maxOutput:128});
const permutations=(xs:ContextCandidate[]):ContextCandidate[][]=>xs.length ? xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(rest=>[x,...rest])) : [[]];

describe('central context planning',()=>{
  it('reserves mandatory restrictions ahead of thousands of focused high-relevance records',()=>{
    const hard=candidate('drawback',{mandatory:true,salience:'required',authority:'authoritative',domain:'mechanics'});
    const plan=planContext([hard,...Array.from({length:3000},(_,i)=>candidate(`lore/${i}`,{salience:'focused',relevance:100000}))],windowFor(20));
    expect(plan.selected.map(c=>c.id)).toContain('drawback');expect(plan.decisions.filter(d=>!d.included)).toHaveLength(2999);
    expect(()=>planContext([hard],windowFor(9))).toThrow(/Required restrictions/);
  });
  it('focus changes admission without changing truth or NPC epistemic domain',()=>{
    const focused=candidate('focus',{salience:'focused',domain:'npc-epistemic'});
    expect(planContext([candidate('truth',{authority:'campaign-established',relevance:999}),focused],windowFor(10)).selected).toEqual([focused]);
    expect(focused.authority).toBe('speculative');expect(focused.domain).toBe('npc-epistemic');
    const before=planContext([candidate('a'),candidate('b')],windowFor(10));
    const after=planContext([candidate('a'),candidate('b',{authority:'authoritative'})],windowFor(10));
    expect(before.selected.map(c=>c.id)).toEqual(after.selected.map(c=>c.id));
  });
  it('implements all five salience levels independently of mandatory reservation',()=>{
    const levels=['background','relevant','required','focused','directive'] as const;
    const plan=planContext(levels.map(s=>candidate(s,{salience:s})),windowFor(50));
    expect(plan.selected.map(c=>c.salience)).toEqual([...levels].reverse());
  });
  it('has stable ties and full permutation invariance including decisions and final ordering',()=>{
    const records=[candidate('c'),candidate('b'),candidate('a'),candidate('h0',{pool:'chat',sequence:0,salience:'background'}),candidate('h1',{pool:'chat',sequence:1,salience:'background'})];
    const policy={pools:{chat:{tail:true,tokens:10}}};const expected=planContext(records,windowFor(40),policy);
    for(const permutation of permutations(records)) expect(planContext(permutation,windowFor(40),policy)).toEqual(expected);
    expect(expected.selected.map(c=>c.id)).toEqual(['a','b','c','h1']);
  });
  it('accounts for exact fit, one over, output reserve and independent pool limits',()=>{
    expect(planContext([candidate('fit')],windowFor(10)).estimatedTokens).toBe(10);
    expect(planContext([candidate('over')],windowFor(9)).decisions[0].reason).toBe('input-budget');
    expect(planContext([candidate('reserve')],{...windowFor(10),maxOutput:129}).selected).toEqual([]);
    const p=planContext([candidate('a',{pool:'tokens'}),candidate('b',{pool:'tokens'}),candidate('c',{pool:'count'}),candidate('d',{pool:'count'})],windowFor(100),{pools:{tokens:{tokens:10},count:{count:1}}});
    expect(p.decisions.map(d=>[d.reason,d.budget])).toEqual([['selected',undefined],['pool-tokens','tokens'],['selected',undefined],['pool-count','count']]);
    expect(planMessages([{role:'user',content:'é'}],{...ProviderSchema.parse({}),...windowFor(34)}).estimatedTokens).toBe(34);
    expect(()=>planMessages([{role:'user',content:'é'}],{...ProviderSchema.parse({}),...windowFor(33)})).toThrow(/budget/);
  });
  it('never fills a history gap with smaller older exchanges and reports every omission',()=>{
    const p=planContext([candidate('old',{pool:'chat',sequence:0,salience:'background',estimatedTokens:1}),candidate('middle',{pool:'chat',sequence:1,salience:'background',estimatedTokens:11}),candidate('new',{pool:'chat',sequence:2,salience:'background'})],windowFor(100),{pools:{chat:{tokens:20,tail:true}}});
    expect(p.selected.map(c=>c.id)).toEqual(['new']);expect(p.decisions.map(d=>d.reason)).toEqual(['selected','pool-tokens','history-tail']);
  });
  it('rejects duplicate identities and invalid costs/caps',()=>{
    expect(()=>planContext([candidate('a'),candidate('a')],windowFor(10))).toThrow(/Duplicate/);
    expect(()=>planContext([candidate('a',{estimatedTokens:-1})],windowFor(10))).toThrow(/Invalid/);
    expect(()=>planContext([],windowFor(10),{pools:{bad:{count:-1}}})).toThrow(/Invalid/);
  });
  it('keeps stale canon and superseded/future memories outside admission, even if focused',()=>{
    const {campaign}=aiFixture();campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Book',jumpId:campaign.state.scene.stamp.jumpId,entries:[{id:'canon',title:'Flight',text:'Flight flight flight',factKey:'flight'}]})];
    campaign.state.facts=[FactSchema.parse({id:'truth',key:'flight',text:'Flight is established.',authority:'campaign-established',stamp:campaign.state.scene.stamp}),FactSchema.parse({id:'old',key:'past',text:'Flight old',authority:'campaign-established',stamp:campaign.state.scene.stamp,supersededBy:'truth'}),FactSchema.parse({id:'future',key:'future',text:'Flight later',authority:'campaign-established',stamp:{...campaign.state.scene.stamp,elapsedMinutes:9999}})];
    const eligible=eligibleRecords(knowledgeRecords(campaign),{jump:campaign.state.scene.stamp.jumpId,before:campaign.state.scene.stamp.elapsedMinutes});
    const plan=planContext(eligible.map(r=>candidate(r.id,{salience:'focused',authority:r.authority})),windowFor(100));
    expect(plan.selected.map(c=>c.id)).toEqual(['truth']);
    const records=eligible.map((r,i)=>({...r,id:String(i),factKey:''}));
    const a=hybridRetriever.search('Flight',records,{limit:100});
    const b=hybridRetriever.search('Flight',records.map(r=>({...r,authority:'speculative'})),{limit:100});
    expect(a.map(r=>[r.record.id,r.score])).toEqual(b.map(r=>[r.record.id,r.score]));
  });
  it('persists thousands of omissions and exact tracker text, with legacy contexts still readable',()=>{
    const {bundle,campaign}=aiFixture();bundle.participations[0].drawbacks=normalizeParticipationSelections([{title:'Blind',description:'You cannot see.'}],'drawback');
    bundle.participations[0].purchases=normalizeParticipationSelections(Array.from({length:2000},(_,i)=>({id:`p${i}`,title:'Flight',description:'Fly exactly as written.'})),'purchase');
    const context=compileContext(bundle,campaign,'Flight',ProviderSchema.parse({}));
    expect(context.layers.some(l=>l.content.includes('You cannot see.'))).toBe(true);
    expect(context.omittedIds.length).toBeGreaterThan(1900);expect(context.diagnostics.join(' ')).toContain('omission does not imply lack');
    expect(ContextSchema.parse(JSON.parse(JSON.stringify(context))).plan).toEqual(context.plan);
    const {plan:_plan,...legacy}=context;expect(ContextSchema.parse(legacy).plan).toBeUndefined();
  });
  it('renders history chronologically and bounds the actual sent message bytes',()=>{
    const {bundle,campaign}=aiFixture();campaign.turns=[0,1,2].map(i=>TurnSchema.parse({id:`t${i}`,createdAt:'now',action:`action${i}`,narrative:`reply${i}`,status:'complete',before:campaign.state,baseRevision:0}));
    const context=compileContext(bundle,campaign,'go',ProviderSchema.parse({}));
    expect(context.plan?.selected.at(-1)?.section).toBe('action');
    expect(context.messages.slice(1,-1).map(m=>m.content)).toEqual(['action0','reply0','action1','reply1','action2','reply2']);
    expect(context.messages.reduce((n,m)=>n+estimateTokens(m.content)+32,0)).toBeLessThanOrEqual(context.estimatedTokens);
  });
  it('lets one source fill all lore slots when no fresh source competes (unused capacity is not wasted)',()=>{
    const candidates=[0,1,2,3,4].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:5-i}));
    const policy={pools:{lore:{count:5,groupMarginal:{rankPenalty:2}}}};
    const plan=planContext(candidates,windowFor(50),policy);
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','chunk/2','chunk/3','chunk/4']);
    expect(planContext([...candidates].reverse(),windowFor(50),policy).selected.map(c=>c.id)).toEqual(plan.selected.map(c=>c.id));
  });
  it('calibrates four contiguous chunks against close fresh sources: repetition loses marginal value at depth 4',()=>{
    const chunks=[0,1,2,3].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const fresh=['b','c','d'].map((g,i)=>candidate(`fresh-${g}`,{pool:'lore',groupKey:g,relevance:96-i}));
    const policy={pools:{lore:{count:4,groupMarginal:{rankPenalty:2}}}};
    // Without diversity the long entry's four chunks (raw ranks 1-4) take the whole budget.
    expect(planContext([...chunks,...fresh],windowFor(70),{pools:{lore:{count:4}}}).selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','chunk/2','chunk/3']);
    // With rankPenalty 2 the chunks sit at effective 1, 4, 7, 10 against fresh 5, 6, 7: the two
    // best chunks keep their slots and the two best fresh sources take the rest. The 3rd chunk
    // (eff 7) ties the last fresh source and loses the less-redundant tie-break. Two chunks for
    // one source is this policy's calibrated outcome for this shape, not a hardcoded quota — a
    // stronger repeat or weaker fresh would shift the split (see the other calibration tests).
    const plan=planContext([...chunks,...fresh],windowFor(70),policy);
    expect(plan.decisions.map(d=>d.candidate.id)).toEqual(['chunk/0','chunk/1','fresh-b','fresh-c','fresh-d','chunk/2','chunk/3']);
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','fresh-b','fresh-c']);
    expect(planContext([...chunks,...fresh].reverse(),windowFor(70),policy).selected.map(c=>c.id)).toEqual(plan.selected.map(c=>c.id));
  });
  it('keeps a strong repeated chunk ahead of a weak fresh source while the penalty stays load-bearing',()=>{
    const strong=[0,1].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const filler=[0,1].map(i=>candidate(`weak/${i}`,{pool:'lore',groupKey:`w${i}`,relevance:98-i}));
    const fresh=candidate('weak-fresh',{pool:'lore',groupKey:'fresh',relevance:96});
    const policy={pools:{lore:{count:4,groupMarginal:{rankPenalty:2}}}};
    // Raw ranks: chunk/0=1, chunk/1=2, weak/0=3, weak/1=4, weak-fresh=5. Effective: 1, 4, 3, 4, 5 —
    // the 2nd repeat (eff 4) keeps its slot ahead of the fresh source three ranks below (eff 5),
    // even though the penalty reorders it behind two fresh candidates. The penalty decides the
    // outcome: at rankPenalty 3 the repeat ties the fresh source (5=5) and loses the less-redundant
    // tie-break, and any larger penalty demotes it outright — so this case fails for one-chunk-per-
    // source diversity or a stronger setting, and passes only because the strength is bounded.
    const plan=planContext([...strong,...filler,fresh],windowFor(50),policy);
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','weak/0','weak/1','chunk/1']);
    expect(plan.decisions.find(d=>d.candidate.id==='weak-fresh')?.reason).toBe('pool-count');
    const stronger=planContext([...strong,...filler,fresh],windowFor(50),{pools:{lore:{count:4,groupMarginal:{rankPenalty:3}}}});
    expect(stronger.selected.map(c=>c.id)).toEqual(['chunk/0','weak/0','weak/1','weak-fresh']);
  });
  it('keeps soft-diversity plans fully permutation-invariant',()=>{
    const strong=[0,1].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const filler=[0,1].map(i=>candidate(`weak/${i}`,{pool:'lore',groupKey:`w${i}`,relevance:98-i}));
    const fresh=candidate('weak-fresh',{pool:'lore',groupKey:'fresh',relevance:96});
    const policy={pools:{lore:{count:4,groupMarginal:{rankPenalty:2}}}};
    const expected=planContext([...strong,...filler,fresh],windowFor(50),policy);
    for(const permutation of permutations([...strong,...filler,fresh])) expect(planContext(permutation,windowFor(50),policy)).toEqual(expected);
  });
  it('lets one source fill the lore count when every fresh source ranks far below its later chunks',()=>{
    const chunks=Array.from({length:10},(_,i)=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const fresh=[0,1,2,3].map(i=>candidate(`far/${i}`,{pool:'lore',groupKey:`far${i}`,relevance:90-i}));
    // Raw ranks 1-10 chunks, 11-14 fresh. The 4th chunk's effective rank (4+6=10) still beats the
    // best fresh source (11), so no slot is left unused and the strong entry fills the budget.
    const plan=planContext([...chunks,...fresh],windowFor(140),{pools:{lore:{count:4,groupMarginal:{rankPenalty:2}}}});
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','chunk/2','chunk/3']);
    expect(plan.decisions.filter(d=>!d.included)).toHaveLength(10);
  });
  it('demotes third and later chunks below a moderately ranked fresh source',()=>{
    const chunks=[0,1,2,3].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const fresh=candidate('fresh',{pool:'lore',groupKey:'b',relevance:96});
    // Raw: chunks 1-4, fresh 5. Effective: 1, 4, 7, 10, 5 — the fresh source one rank below the
    // 3rd chunk beats both the 3rd (7) and 4th (10) repeats for the last slot.
    const plan=planContext([...chunks,fresh],windowFor(50),{pools:{lore:{count:3,groupMarginal:{rankPenalty:2}}}});
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','fresh']);
    expect(plan.decisions.filter(d=>!d.included).map(d=>d.candidate.id)).toEqual(['chunk/2','chunk/3']);
  });
  it('calibrates the same strength at loreDepth 8, where fresh sources earn half the budget',()=>{
    const chunks=[0,1,2,3,4,5].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const fresh=[0,1,2,3].map(i=>candidate(`fresh/${i}`,{pool:'lore',groupKey:`f${i}`,relevance:94-i}));
    const policy={pools:{lore:{count:8,groupMarginal:{rankPenalty:2}}}};
    // Raw ranks 1-6 chunks, 7-10 fresh; effective 1, 4, 7, 10, 13, 16 vs 7, 8, 9, 10. Four fresh
    // sources and the four strongest chunks share the budget; the 5th/6th repeats lose. The same
    // rank-space penalty scales: at depth 4 the split was 2+2, here 4+4, without any per-depth rule.
    const plan=planContext([...chunks,...fresh],windowFor(100),policy);
    expect(plan.selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','fresh/0','chunk/2','fresh/1','fresh/2','fresh/3','chunk/3']);
    // Without diversity the same budget admits six chunks and only two fresh sources.
    expect(planContext([...chunks,...fresh],windowFor(100),{pools:{lore:{count:8}}}).selected.map(c=>c.id)).toEqual(['chunk/0','chunk/1','chunk/2','chunk/3','chunk/4','chunk/5','fresh/0','fresh/1']);
  });
  it('keeps repetition penalties monotonic within one logical source',()=>{
    const candidates=[0,1,2,3,4].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:10-i}));
    const policy={pools:{lore:{count:5,groupMarginal:{rankPenalty:2}}}};
    const ranks=planContext(candidates,windowFor(50),policy).selected.map(c=>candidates.findIndex(c2=>c2.id===c.id));
    expect(ranks).toEqual([...ranks].sort((a,b)=>a-b));
    // A later chunk never outranks an earlier one of the same source unless raw relevance says so.
    const equal=planContext([0,1,2,3].map(i=>candidate(`eq/${i}`,{pool:'lore',groupKey:'entry',relevance:5})),windowFor(50),policy);
    expect(equal.selected.map(c=>c.id)).toEqual(['eq/0','eq/1','eq/2','eq/3']);
  });
  it('still respects count, token and input caps under soft diversity',()=>{
    const chunks=[0,1,2,3,4].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:10-i}));
    expect(planContext(chunks,windowFor(60),{pools:{lore:{count:3,groupMarginal:{rankPenalty:2}}}}).selected).toHaveLength(3);
    const tokened=planContext(chunks,windowFor(60),{pools:{lore:{tokens:25,groupMarginal:{rankPenalty:2}}}});
    expect(tokened.selected).toHaveLength(2);expect(tokened.decisions[2].reason).toBe('pool-tokens');
    expect(planContext(chunks,windowFor(19),{pools:{lore:{groupMarginal:{rankPenalty:2}}}}).selected).toHaveLength(1);
    // Pools without the policy keep raw-relevance admission: groupKey alone changes nothing.
    expect(planContext(chunks,windowFor(60),{pools:{lore:{count:5}}}).selected.map(c=>c.id)).toEqual(chunks.map(c=>c.id));
  });
  it('never penalizes ungrouped candidates, other pools, or mandatory candidates',()=>{
    const chunks=[0,1].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:100-i}));
    const ungrouped=[0,1].map(i=>candidate(`solo/${i}`,{pool:'lore',relevance:98-i}));
    const other=candidate('other',{pool:'lore',groupKey:'b',relevance:96});
    // Raw: chunk/0=1, chunk/1=2, solo/0=3, solo/1=4, other=5. Effective: 1, 4, 3, 4, 5. Ungrouped
    // candidates have no repetition to penalize and win the effective tie against the 2nd repeat;
    // the memory pool has no policy at all, so both same-group facts are admitted in raw order.
    const memory=[0,1].map(i=>candidate(`fact/${i}`,{pool:'memory',groupKey:'fact',relevance:10-i}));
    const plan=planContext([...chunks,...ungrouped,other,...memory],windowFor(70),{pools:{lore:{count:4,groupMarginal:{rankPenalty:2}},memory:{count:2}}});
    expect(plan.decisions.filter(d=>d.candidate.pool==='lore').map(d=>d.candidate.id)).toEqual(['chunk/0','solo/0','solo/1','chunk/1','other']);
    expect(plan.selected.filter(c=>c.pool==='memory').map(c=>c.id)).toEqual(['fact/0','fact/1']);
    expect(planContext([...chunks,...ungrouped,other],windowFor(50),{pools:{lore:{count:4}}}).decisions.map(d=>d.candidate.id)).toEqual(['chunk/0','chunk/1','solo/0','solo/1','other']);
    // Mandatory candidates bypass the effective order entirely.
    const hard=candidate('hard',{pool:'lore',groupKey:'other',mandatory:true,salience:'required',relevance:0});
    const withHard=planContext([hard,...[0,1,2,3,4].map(i=>candidate(`chunk/${i}`,{pool:'lore',groupKey:'entry',relevance:10-i}))],windowFor(60),{pools:{lore:{count:6,groupMarginal:{rankPenalty:2}}}});
    expect(withHard.selected[0].id).toBe('hard');
    expect(withHard.selected).toHaveLength(6);
  });
  it('hard groupCount quotas still work and persist pool-group decisions through the context schema',()=>{
    expect(()=>planContext([candidate('a',{pool:'lore'})],windowFor(10),{pools:{lore:{groupCount:-1}}})).toThrow(/Invalid/);
    expect(()=>planContext([candidate('a',{pool:'lore'})],windowFor(10),{pools:{lore:{groupCount:1,groupMarginal:{rankPenalty:2}}}})).toThrow(/cannot combine/);
    const plan=planContext([candidate('a',{pool:'lore',groupKey:'g'}),candidate('b',{pool:'lore',groupKey:'g'}),candidate('c',{pool:'lore',groupKey:'h'})],windowFor(30),{pools:{lore:{count:2,groupCount:1}}});
    expect(plan.decisions.find(d=>d.candidate.id==='b')?.reason).toBe('pool-group');
    expect(ContextPlanSchema.parse(JSON.parse(JSON.stringify(plan))).decisions.map(d=>d.reason)).toEqual(plan.decisions.map(d=>d.reason));
    const soft=planContext([candidate('a',{pool:'lore',groupKey:'g'}),candidate('b',{pool:'lore',groupKey:'g'})],windowFor(30),{pools:{lore:{count:2,groupMarginal:{rankPenalty:2}}}});
    expect(ContextPlanSchema.parse(JSON.parse(JSON.stringify(soft))).policy).toEqual(soft.policy);
  });
  it('validates the explicit strength and keeps legacy diminishing plans readable but not executable',()=>{
    const single=candidate('a',{pool:'lore',groupKey:'g'});
    for (const bad of [0,-1,Number.NaN,Number.POSITIVE_INFINITY]) expect(()=>planContext([single],windowFor(10),{pools:{lore:{groupMarginal:{rankPenalty:bad}}}})).toThrow(/rankPenalty/);
    expect(()=>planContext([single],windowFor(10),{pools:{lore:{groupMarginal:{} as never}}})).toThrow(/rankPenalty/);
    expect(()=>planContext([single],windowFor(10),{pools:{lore:{groupMarginal:{diminishing:true} as never}}})).toThrow(/not executable/);
    // Half-step penalties are valid and round-trip exactly through the persisted schema.
    const half=planContext([single,candidate('b',{pool:'lore',groupKey:'g'})],windowFor(30),{pools:{lore:{count:2,groupMarginal:{rankPenalty:0.5}}}});
    expect(ContextPlanSchema.parse(JSON.parse(JSON.stringify(half))).policy).toEqual(half.policy);
    // Legacy plans stay inspectable under their historical key, but invalid strengths never parse.
    const legacy={selected:[],decisions:[],policy:{pools:{lore:{count:2,groupMarginal:{diminishing:true}}}},inputBudget:10,estimatedTokens:0};
    expect(ContextPlanSchema.parse(legacy).policy).toEqual(legacy.policy);
    expect(ContextPlanSchema.safeParse({...legacy,policy:{pools:{lore:{groupMarginal:{rankPenalty:0}}}}}).success).toBe(false);
    expect(ContextPlanSchema.safeParse({...legacy,policy:{pools:{lore:{groupMarginal:{rankPenalty:-2}}}}}).success).toBe(false);
  });
});
