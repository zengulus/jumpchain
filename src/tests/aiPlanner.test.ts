import { describe, it, expect } from 'vitest';
import { planContext, planMessages, estimateTokens, type ContextCandidate } from '../ai/planner';
import { compileContext } from '../ai/context';
import { ContextSchema, FactSchema, ProviderSchema, TurnSchema, WorldbookSchema } from '../ai/schema';
import { eligibleRecords, hybridRetriever, knowledgeRecords } from '../ai/retrieval';
import { normalizeParticipationSelections } from '../domain/jump/selection';
import { aiFixture } from './aiFixture';
const candidate = (id:string, overrides:Partial<ContextCandidate>={}):ContextCandidate => ({id,name:id,content:id,sourceIds:[id],estimatedTokens:10,salience:'relevant',authority:'speculative',domain:'world-state',mandatory:false,relevance:1,signal:'test relevance',sourceClass:'test',...overrides});
const windowFor = (budget:number) => ({contextWindow:budget+640,maxOutput:128});

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
    const permutations=(xs:ContextCandidate[]):ContextCandidate[][]=>xs.length ? xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(rest=>[x,...rest])) : [[]];
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
});
