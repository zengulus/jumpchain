import { describe,it,expect } from 'vitest';
import { planTransition, applyTransition, playerEditOperations, type TransitionContext } from '../ai/transitions';
import { commitTransition, reviewProposal, rollbackLatest, proposalInstructions, modelOperationExamples } from '../ai/state';
import { CampaignSchema, ModelOperationSchema, ModelProposalSchema, NpcSchema, FactSchema, EventSchema, SummarySchema, TurnSchema, ProviderSchema, stableStringify, migrateCampaign, type CampaignOperation } from '../ai/schema';
import { compileContext } from '../ai/context';
import { createBlankCompanion, createBlankCompanionParticipation } from '../features/workspace/records';
import { aiFixture } from './aiFixture';
function fixture() {
  const {bundle,campaign}=aiFixture();
  campaign.state.npcs=[NpcSchema.parse({id:'minerva',name:'Minerva',background:'Professor',aliases:['McGonagall'],location:'Hogwarts',relationship:'Acquaintance',beliefs:['The Jumper is a student'],goals:['Protect students'],resources:['Wand'],plans:['Teach'],knowledge:['The gates are locked']})];
  campaign.state.scene.npcIds=['minerva'];
  const model:TransitionContext={origin:'model-proposal',campaign,bundle,sourceTurnId:'turn'};
  const player:TransitionContext={origin:'player-edit',campaign,bundle};
  const summary:TransitionContext={origin:'generated-summary',campaign};
  return {bundle,campaign,model,player,summary};
}
const fact=(handle='fact',text='The gates opened'):CampaignOperation=>({kind:'fact.create',handle,value:{key:'gates',text,authority:'campaign-established',entities:[],tags:[],location:''}});
function preview() {
  const f=fixture();const operations=[fact(),{kind:'npc.list' as const,npc:{id:'minerva'},list:'suspicions' as const,add:['The Jumper opened them'],remove:[]}];
  const turn=TurnSchema.parse({id:'turn',createdAt:'now',status:'complete',action:'Open gates',narrative:'The gates open.',before:f.campaign.state,baseRevision:0,context:compileContext(f.bundle,f.campaign,'Open gates',ProviderSchema.parse({})),proposal:ModelProposalSchema.parse({version:2,rationale:'Observed',operations}),proposalStatus:'pending'});
  f.campaign.turns.push(turn);turn.transitionPlan=planTransition(turn.before,operations,f.model,'preview');
  return {...f,turn,plan:turn.transitionPlan};
}
describe('atomic semantic campaign transitions',()=>{
  it('rejects a late invalid operation without touching original state, tracker, or operations',()=>{
    const {campaign,bundle,model}=fixture();const operations=[{kind:'scene.update',value:{location:'Gate'}},fact(),{kind:'npc.list',npc:{id:'missing'},list:'beliefs',add:['false'],remove:[]}];
    const original=stableStringify({campaign,bundle,operations});expect(()=>planTransition(campaign.state,operations,model,'atomic')).toThrow(/Unknown npc/);
    expect(stableStringify({campaign,bundle,operations})).toBe(original);
  });
  it('adds one suspicion while preserving every unrelated NPC field and objective memory',()=>{
    const {campaign,model}=fixture();const before=structuredClone(campaign.state.npcs[0]);
    const plan=planTransition(campaign.state,[{kind:'npc.list',npc:{id:'minerva'},list:'suspicions',add:['The Jumper can fly']}],model,'narrow');
    expect(plan.after.npcs[0]).toEqual({...before,suspicions:['The Jumper can fly']});expect(plan.after.facts).toEqual([]);expect(campaign.state.npcs[0]).toEqual(before);
  });
  it('removes exact list entries and changes only explicitly supplied scalar fields',()=>{
    const {campaign,model}=fixture();const plan=planTransition(campaign.state,[{kind:'npc.list',npc:{id:'minerva'},list:'beliefs',remove:['The Jumper is a student'],add:['The Jumper is a visitor']},{kind:'npc.update',npc:{id:'minerva'},value:{relationship:'Friend'}}],model,'lists');
    expect(plan.after.npcs[0]).toEqual({...campaign.state.npcs[0],beliefs:['The Jumper is a visitor'],relationship:'Friend'});
  });
  it.each(['scene.correct','npc.correct','fact.correct','event.correct','summary.correct','record.delete','records.order'])('keeps %s player-only',kind=>{
    const {campaign,model}=fixture();const values:Record<string,unknown>={
      'scene.correct':{value:campaign.state.scene},'npc.correct':{value:campaign.state.npcs[0]},
      'fact.correct':{value:FactSchema.parse({id:'f',key:'x',text:'x',authority:'player-established',stamp:campaign.state.scene.stamp})},
      'event.correct':{value:EventSchema.parse({id:'e',summary:'x',authority:'inferred',stamp:campaign.state.scene.stamp})},
      'summary.correct':{value:SummarySchema.parse({id:'s',level:'scene',title:'s',text:'s',stamp:campaign.state.scene.stamp})},
      'record.delete':{target:'npc',id:'minerva'},'records.order':{target:'npc',ids:['minerva']},
    };
    expect(()=>planTransition(campaign.state,[{kind,...values[kind] as object}],model,'forged')).toThrow(/Model capability/);
  });
  it('preserves player corrections, deletion, chronology reset, and exact record ordering',()=>{
    const {campaign,bundle,player}=fixture();const desired=structuredClone(campaign.state);
    const otherJump={...bundle.jumps[0],id:'other-jump',orderIndex:999};bundle.jumps.push(otherJump);
    desired.scene.stamp={jumpId:otherJump.id,elapsedMinutes:0,absoluteDate:'New date'};desired.scene.npcIds=[];
    desired.npcs=[NpcSchema.parse({id:'new',name:'New'}),{...desired.npcs[0],background:'Corrected'}];
    const operations=playerEditOperations(campaign.state,desired);const plan=planTransition(campaign.state,operations,player,'correct');
    expect(plan.after).toEqual(desired);expect(plan.operations.map(o=>o.kind)).toEqual(['scene.correct','npc.correct','npc.correct','records.order']);
    const deleted=structuredClone(desired);deleted.npcs=[];
    expect(planTransition(desired,playerEditOperations(desired,deleted),player,'delete').after).toEqual(deleted);
  });
  it('lowers one player edit without rewriting other records, and rejects duplicate desired IDs',()=>{
    const {campaign,player}=fixture();const desired=structuredClone(campaign.state);desired.npcs[0].beliefs.push('A correction');
    const ops=playerEditOperations(campaign.state,desired);expect(ops).toHaveLength(1);expect(ops[0].kind).toBe('npc.correct');
    expect(planTransition(campaign.state,ops,player,'lower').after).toEqual(desired);expect(playerEditOperations(campaign.state,campaign.state)).toEqual([]);
    desired.npcs.push(desired.npcs[0]);expect(()=>playerEditOperations(campaign.state,desired)).toThrow(/Duplicate/);
  });
  it('rejects tracker operations, arbitrary paths, whole-object model echoes, and unknown fields',()=>{
    const {campaign,bundle,model}=fixture();const original=stableStringify(bundle);
    for(const operation of [{kind:'perk',value:{}},{kind:'patch',path:'scene.location',value:'x'},{kind:'scene',value:campaign.state.scene},{kind:'npc.update',npc:{id:'minerva'},value:{id:'new-id'}}]) expect(()=>planTransition(campaign.state,[operation],model,'bad')).toThrow();
    planTransition(campaign.state,[fact()],model,'valid');expect(stableStringify(bundle)).toBe(original);
  });
  it('prevents model time reversal, Jump changes, wrong tracker alignment, and future memories',()=>{
    const {campaign,bundle,model}=fixture();
    expect(()=>planTransition(campaign.state,[{kind:'scene.advance',minutes:-1}],model,'bad')).toThrow();
    expect(()=>planTransition(campaign.state,[{kind:'scene.update',value:{stamp:{jumpId:'elsewhere',elapsedMinutes:0}}}],model,'bad')).toThrow();
    expect(()=>planTransition(campaign.state,[{...fact(),value:{key:'future',text:'future',authority:'inferred',stamp:{...campaign.state.scene.stamp,elapsedMinutes:9999}}}],model,'future')).toThrow(/future/);
    expect(()=>planTransition(campaign.state,[{...fact(),value:{key:'wrong',text:'wrong',authority:'inferred',stamp:{jumpId:'elsewhere',elapsedMinutes:0}}}],model,'wrong')).toThrow(/different jump/);
    bundle.chain.activeBranchId='other';expect(()=>planTransition(campaign.state,[],model,'branch')).toThrow(/branch/);
  });
  it('rejects companion reassignment by model and allows a valid player correction',()=>{
    const {campaign,bundle,model,player}=fixture();
    expect(()=>planTransition(campaign.state,[{kind:'npc.update',npc:{id:'minerva'},value:{companionId:'other'}}],model,'link')).toThrow(/companionId/);
    const companion=createBlankCompanion(bundle.chain.id,campaign.branchId);bundle.companions.push(companion);
    const desired=structuredClone(campaign.state);desired.npcs[0].companionId=companion.id;
    expect(planTransition(campaign.state,playerEditOperations(campaign.state,desired),player,'player-link').after.npcs[0].companionId).toBe(companion.id);
    const presence=createBlankCompanionParticipation(bundle.chain.id,campaign.branchId,campaign.state.scene.stamp.jumpId,companion.id);presence.status='active';bundle.companionParticipations.push(presence);
    expect(planTransition(campaign.state,[{kind:'scene.presence',companionIds:[companion.id]}],model,'active').after.scene.presentCompanionIds).toEqual([companion.id]);
    expect(()=>planTransition(campaign.state,[{kind:'scene.presence',companionIds:['missing']}],model,'presence')).toThrow(/not active/);
  });
  it('assigns actual exchange provenance and rejects supplied provenance/IDs',()=>{
    const {campaign,model}=fixture();const plan=planTransition(campaign.state,[fact(),{kind:'event.create',handle:'event',value:{summary:'Opened',authority:'inferred'}}],model,'sources');
    expect(plan.after.facts[0].sourceIds).toEqual(['turn']);expect(plan.after.events[0].sourceMessageIds).toEqual(['turn']);
    for(const fields of [{sourceIds:['forged']},{id:'chosen'}]) expect(()=>planTransition(campaign.state,[{kind:'fact.create',handle:'x',value:{key:'x',text:'x',authority:'inferred',...fields}}],model,'forge')).toThrow();
    const forged={...plan,sourceTurnId:'forged'};expect(()=>applyTransition(campaign.state,forged,model)).toThrow(/turn/);
  });
  it.each(['authoritative','player-established','canonical-source'])('rejects model authority %s',authority=>{
    const {campaign,model}=fixture();expect(()=>planTransition(campaign.state,[{kind:'fact.create',handle:'x',value:{key:'x',text:'x',authority}}],model,'authority')).toThrow(/authority/);
  });
  it('keeps old memories immutable while permitting typed supersession',()=>{
    const {campaign,model}=fixture();campaign.state.facts=[FactSchema.parse({id:'old',key:'gates',text:'Closed',authority:'campaign-established',stamp:campaign.state.scene.stamp})];
    const operations=[fact('replacement'),{kind:'memory.supersede',target:'fact',record:{id:'old'},replacement:{local:'replacement'}}];
    const plan=planTransition(campaign.state,operations,model,'supersede');expect(plan.after.facts[0].text).toBe('Closed');expect(plan.after.facts[0].supersededBy).toBe(plan.after.facts[1].id);
    expect(campaign.state.facts[0].supersededBy).toBeNull();
    campaign.state.facts[0].authority='player-established';expect(()=>planTransition(campaign.state,operations,model,'blocked')).toThrow(/player declaration/);
  });
  it('rejects missing, self, stale, cross-type and cyclic supersession atomically',()=>{
    const {campaign,model,player}=fixture();campaign.state.facts=['a','b','c'].map(id=>FactSchema.parse({id,key:id,text:id,authority:'inferred',stamp:campaign.state.scene.stamp}));
    campaign.state.events=[EventSchema.parse({id:'event',summary:'Event',authority:'inferred',stamp:campaign.state.scene.stamp})];
    const supersede=(a:string,b:string)=>({kind:'memory.supersede',target:'fact',record:{id:a},replacement:{id:b}});
    for(const ops of [[supersede('a','missing')],[supersede('a','a')],[supersede('a','event')],[supersede('a','b'),supersede('b','a')],[supersede('a','b'),supersede('c','a')]]) expect(()=>planTransition(campaign.state,ops,model,'invalid')).toThrow();
    const before=stableStringify(campaign.state);const cyclic=campaign.state.facts.slice(0,2).map((f,i)=>({kind:'fact.correct',value:{...f,supersededBy:i?'a':'b'}}));
    expect(()=>planTransition(campaign.state,cyclic,player,'cycle')).toThrow(/Cyclic/);expect(stableStringify(campaign.state)).toBe(before);
  });
  it('resolves earlier local references by type and assigns replay-stable IDs',()=>{
    const {campaign,model}=fixture();const ops=[{kind:'npc.create',handle:'visitor',value:{name:'Visitor'}},{kind:'scene.presence',npcs:[{id:'minerva'},{local:'visitor'}]},{kind:'event.create',handle:'arrival',value:{summary:'Arrival',authority:'inferred'}},{kind:'npc.events',npc:{local:'visitor'},events:[{local:'arrival'}]}];
    const plan=planTransition(campaign.state,ops,model,'identity');expect(plan.after.scene.npcIds[1]).toBe(plan.created[0].id);expect(plan.after.npcs[1].eventIds).toEqual([plan.created[1].id]);
    expect(planTransition(campaign.state,ops,model,'identity')).toEqual(plan);expect(applyTransition(campaign.state,JSON.parse(JSON.stringify(plan)),model)).toEqual(plan);
    expect(()=>planTransition(campaign.state,[ops[1],ops[0]],model,'forward')).toThrow(/Unknown npc/);
    expect(()=>planTransition(campaign.state,[ops[0],ops[0]],model,'duplicate')).toThrow(/handle/);
    expect(()=>planTransition(campaign.state,[ops[2],{kind:'scene.presence',npcs:[{local:'arrival'}]}],model,'wrong-kind')).toThrow(/Unknown npc/);
  });
  it('rejects forged preview consequences or a changed capability at application',()=>{
    const {campaign,model,player}=fixture();const plan=planTransition(campaign.state,[fact()],model,'tamper');
    const forged=structuredClone(plan);forged.after.scene.location='Invented';expect(()=>applyTransition(campaign.state,forged,model)).toThrow(/differs/);
    expect(()=>applyTransition(campaign.state,plan,player)).toThrow(/capability/);
  });
  it('commits exactly the previewed identities, through one audit and review path',()=>{
    const {campaign,bundle,turn,plan}=preview();const created=plan.created[0].id;
    expect(campaign.state.facts).toEqual([]);reviewProposal(campaign,bundle,turn.id,true,'now');
    expect(campaign.state).toEqual(plan.after);expect(campaign.state.facts[0].id).toBe(created);expect(campaign.audit).toHaveLength(1);
    expect(campaign.audit[0]).toMatchObject({id:plan.id,action:'Accepted model proposal',turnId:turn.id,transition:{origin:'model-proposal',operations:plan.operations}});
    expect(()=>reviewProposal(campaign,bundle,turn.id,true,'later')).toThrow(/No pending/);expect(campaign.audit).toHaveLength(1);
  });
  it('rejects review after state/tracker divergence, wrong campaign/turn, or edited operations',()=>{
    for(const mutate of [
      (f:ReturnType<typeof preview>)=>{f.campaign.state.scene.location='Changed';},
      (f:ReturnType<typeof preview>)=>{f.bundle.jumpers[0].name='Changed';},
      (f:ReturnType<typeof preview>)=>{f.plan.campaignId='other';},
      (f:ReturnType<typeof preview>)=>{f.plan.sourceTurnId='other';},
      (f:ReturnType<typeof preview>)=>{if(f.turn.proposal && 'operations' in f.turn.proposal) f.turn.proposal.operations=[];},
    ]) {const f=preview();mutate(f);const before=stableStringify(f.campaign);expect(()=>reviewProposal(f.campaign,f.bundle,'turn',true,'now')).toThrow();expect(stableStringify(f.campaign)).toBe(before);}
  });
  it('gives summary insertion exactly its own capability and validates current event sources',()=>{
    const {campaign,summary,player}=fixture();campaign.state.events=[EventSchema.parse({id:'e',summary:'Arrival',authority:'campaign-established',stamp:campaign.state.scene.stamp})];
    const operation={kind:'summary.create',handle:'summary',value:{level:'scene',title:'Arrival',text:'Arrived',eventIds:['e'],stamp:campaign.state.scene.stamp}};
    const plan=planTransition(campaign.state,[operation],summary,'summary');commitTransition(campaign,plan,summary,'Summarize scene','now');expect(campaign.audit).toHaveLength(1);expect(campaign.state.summaries[0].authority).toBe('inferred');
    expect(()=>planTransition(campaign.state,[{kind:'scene.update',value:{location:'Elsewhere'}}],summary,'bypass')).toThrow(/only permits/);
    expect(()=>planTransition(campaign.state,[operation],player,'wrong-cap')).toThrow(/narrow capability/);
    for(const eventIds of [[],['missing'],['e','e']])expect(()=>planTransition(campaign.state,[{...operation,value:{...operation.value,eventIds}}],summary,'bad-sources')).toThrow(/current events/);
    campaign.state.events[0].supersededBy='replacement';expect(()=>planTransition(campaign.state,[operation],summary,'stale')).toThrow(/current events/);
  });
  it('preserves rollback snapshots and invalidates subsequent continuity once',()=>{
    const {campaign,bundle,turn,plan}=preview();const initial=structuredClone(campaign.state);reviewProposal(campaign,bundle,'turn',true,'now');
    campaign.turns.push(TurnSchema.parse({...turn,id:'later',before:campaign.state,proposalStatus:'pending'}));
    rollbackLatest(campaign);expect(campaign.state).toEqual(initial);expect(campaign.audit[0].after).toEqual(plan.after);expect(campaign.audit[0].rolledBack).toBe(true);
    expect(campaign.turns.every(t=>!t.inContinuity && t.proposalStatus==='rejected')).toBe(true);
    const before=stableStringify(campaign);expect(()=>rollbackLatest(campaign)).toThrow(/No state change/);expect(stableStringify(campaign)).toBe(before);
  });
  it('rejects rollback divergence and rejects pending proposals without committing state',()=>{
    const a=preview();reviewProposal(a.campaign,a.bundle,'turn',true,'now');a.campaign.state.scene.location='Changed';expect(()=>rollbackLatest(a.campaign)).toThrow(/diverged/);
    const b=preview();const before=stableStringify(b.campaign.state);reviewProposal(b.campaign,b.bundle,'turn',false,'now');expect(b.turn.proposalStatus).toBe('rejected');expect(stableStringify(b.campaign.state)).toBe(before);expect(b.campaign.audit).toEqual([]);
  });
  it('loads historical legacy proposals and explicitly invalidates only pending legacy review',()=>{
    const {campaign}=fixture();campaign.turns=['pending','accepted','rejected'].map((status,i)=>TurnSchema.parse({id:`old${i}`,createdAt:'then',status:'complete',action:'Go',narrative:'Went',before:campaign.state,baseRevision:0,proposalStatus:status,proposal:{rationale:'Old',changes:[{kind:'scene',value:campaign.state.scene}]}}));
    const loaded=migrateCampaign(JSON.parse(JSON.stringify(campaign)));expect(loaded.turns.map(t=>t.proposalStatus)).toEqual(['rejected','accepted','rejected']);expect(loaded.turns[0].error).toMatch(/Legacy.*Retry/);expect(loaded.turns[1].proposal).toEqual(campaign.turns[1].proposal);
    expect(migrateCampaign(loaded)).toEqual(loaded);expect(CampaignSchema.parse(loaded).state).toEqual(campaign.state);
    const modern=preview().campaign;expect(migrateCampaign(modern)).toEqual(modern);
  });
  it('keeps the model prompt vocabulary coupled to validated operations and fields',()=>{
    const {campaign}=fixture();const prompt=proposalInstructions('actual-turn',campaign.state);
    for(const schema of ModelOperationSchema.options) {expect(prompt).toContain(schema.shape.kind.value);expect(schema.description).toBeTruthy();expect(()=>schema.parse(modelOperationExamples[schema.shape.kind.value])).not.toThrow();expect(prompt).toContain(stableStringify(modelOperationExamples[schema.shape.kind.value]));}
    expect(prompt).not.toContain('scene.correct');expect(prompt).not.toContain('record.delete');expect(prompt).toContain('actual-turn');expect(prompt).not.toContain('complete NPC');
    expect(()=>ModelProposalSchema.parse({version:2,rationale:'',operations:[{kind:'npc.list',npc:{id:'minerva'},list:'objectiveTruth',add:['x']}]})).toThrow();
  });
});
