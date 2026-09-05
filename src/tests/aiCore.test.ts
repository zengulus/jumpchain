import { describe,it,expect } from 'vitest';
import { compileContext, mechanicalRecords, trackerFingerprint } from '../ai/context';
import { ContextSchema, FactSchema, NpcSchema, ProviderSchema, ProposalSchema, TurnSchema, WorldbookSchema, stableStringify, migrateCampaign } from '../ai/schema';
import { eligibleRecords, hybridRetriever, indexFingerprint, knowledgeRecords } from '../ai/retrieval';
import { applyProposal, auditChange, rollbackLatest, validateState } from '../ai/state';
import { extractedJumpDoc, importWorldbook, validateExtraction } from '../ai/documents';
import { createBlankJumpDoc } from '../features/workspace/records';
import { normalizeParticipationSelections } from '../domain/jump/selection';
import { aiFixture } from './aiFixture';

describe('AI context and mechanical authority',()=>{
  it('compiles current rules at the default budget with no worldbooks or index',()=>{
    const {bundle,campaign}=aiFixture();const context=compileContext(bundle,campaign,'Look around Hogwarts.',ProviderSchema.parse({}));
    expect(context.estimatedTokens).toBeLessThanOrEqual(context.inputBudget);expect(context.messages.at(-1)).toEqual({role:'user',content:'Look around Hogwarts.'});
    expect(context.layers.some(l=>l.name==='Authoritative rules')).toBe(true);
  });
  it('selects an exact rare ability from thousands without editing its text or including future acquisitions',()=>{
    const {bundle,campaign}=aiFixture();
    bundle.participations[0].purchases=normalizeParticipationSelections(Array.from({length:1200},(_,i)=>({id:`power${i}`,title:i===1199?'Kaleidoscope':'Ordinary '+i,description:i===1199?'Travel to any parallel world. Exact immunity text.':'Run slightly faster.',value:100})),'purchase');
    const previous=stableStringify(bundle);
    const context=compileContext(bundle,campaign,'Use Kaleidoscope to travel.',ProviderSchema.parse({}));
    expect(context.layers.some(l=>l.content.includes('Travel to any parallel world. Exact immunity text.'))).toBe(true);
    expect(context.omittedIds.length).toBeGreaterThan(1000);expect(stableStringify(bundle)).toBe(previous);
    const future={...bundle.jumps[0],id:'future-jump',orderIndex:999,status:'planned' as const};bundle.jumps.push(future);
    bundle.participations.push({...bundle.participations[0],id:'future',jumpId:future.id,purchases:normalizeParticipationSelections([{title:'Future omnipotence',description:'Not acquired'}],'purchase')});
    expect(mechanicalRecords(bundle,campaign).some(r=>r.text.includes('Future omnipotence'))).toBe(false);
  });
  it('pins drawbacks and refuses to silently drop oversized required restrictions',()=>{
    const {bundle,campaign}=aiFixture();bundle.participations[0].drawbacks=normalizeParticipationSelections([{title:'Blind',description:'You cannot see.'}],'drawback');
    const context=compileContext(bundle,campaign,'Read the sign',ProviderSchema.parse({}));expect(context.layers.some(l=>l.content.includes('You cannot see.'))).toBe(true);
    campaign.settings.gmPrompt='x'.repeat(30000);expect(()=>compileContext(bundle,campaign,'hello',ProviderSchema.parse({}))).toThrow(/Context exceeded budget/);
  });
  it('rejects a different tracker branch and jump rather than selecting a fallback',()=>{
    const {bundle,campaign}=aiFixture();campaign.branchId='other';expect(()=>compileContext(bundle,campaign,'go',ProviderSchema.parse({}))).toThrow(/different tracker/);
    campaign.branchId=bundle.chain.activeBranchId;campaign.state.scene.stamp.jumpId='other';expect(()=>compileContext(bundle,campaign,'go',ProviderSchema.parse({}))).toThrow(/current jump differ/);
  });
  it('preserves NPC beliefs as a separate context layer',()=>{
    const {bundle,campaign}=aiFixture();campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',beliefs:['The Jumper cannot fly.'],knowledge:['The gates are locked.']})];campaign.state.scene.npcIds=['npc'];
    campaign.state.facts=[FactSchema.parse({id:'true',key:'flight',text:'The Jumper flew yesterday.',authority:'campaign-established',stamp:campaign.state.scene.stamp})];
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}));
    expect(context.layers.find(l=>l.name.startsWith('NPC beliefs'))?.content).toContain('The Jumper cannot fly.');
    expect(campaign.state.facts[0].text).toBe('The Jumper flew yesterday.');
  });
  it('uses deterministic serialization independent of object key insertion order',()=>{
    expect(stableStringify({b:2,a:{y:2,x:1}})).toBe(stableStringify({a:{x:1,y:2},b:2}));
    const {bundle}=aiFixture();expect(trackerFingerprint(bundle)).toBe(trackerFingerprint(JSON.parse(stableStringify(bundle))));
  });
});
describe('context layer authority, salience, domain, and mandatory metadata',()=>{
  it('marks active drawback layers as required salience, authoritative mechanics, and mandatory',()=>{
    const {bundle,campaign}=aiFixture();bundle.participations[0].drawbacks=normalizeParticipationSelections([{title:'Blind',description:'You cannot see.'}],'drawback');
    const context=compileContext(bundle,campaign,'Read the sign',ProviderSchema.parse({}));
    const layer=context.layers.find(l=>l.name.startsWith('Authoritative')&&l.content.includes('You cannot see.'));
    expect(layer?.salience).toBe('required');expect(layer?.authority).toBe('authoritative');expect(layer?.domain).toBe('mechanics');expect(layer?.mandatory).toBe(true);
  });
  it('marks an optional selected ability as relevant, authoritative mechanics, and non-mandatory',()=>{
    const {bundle,campaign}=aiFixture();bundle.participations[0].purchases=normalizeParticipationSelections([{title:'Flight',description:'Fly anywhere.'}],'purchase');
    const context=compileContext(bundle,campaign,'Fly away',ProviderSchema.parse({}));
    const layer=context.layers.find(l=>l.name.startsWith('Authoritative')&&l.content.includes('Fly anywhere.'));
    expect(layer?.salience).toBe('relevant');expect(layer?.authority).toBe('authoritative');expect(layer?.domain).toBe('mechanics');expect(layer?.mandatory).toBe(false);
  });
  it('never labels NPC belief layers as authoritative objective truth',()=>{
    const {bundle,campaign}=aiFixture();campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',beliefs:['The Jumper cannot fly.'],knowledge:['The gates are locked.']})];campaign.state.scene.npcIds=['npc'];
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}));
    const layer=context.layers.find(l=>l.name.startsWith('NPC beliefs'));
    expect(layer?.salience).toBe('required');expect(layer?.authority).not.toBe('authoritative');expect(layer?.authority).toBe('campaign-established');expect(layer?.domain).toBe('npc-epistemic');
  });
  it('separates NPC epistemic claims from objective world state',()=>{
    const {bundle,campaign}=aiFixture();
    campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',beliefs:['The Jumper cannot fly.']})];campaign.state.scene.npcIds=['npc'];
    campaign.state.facts=[FactSchema.parse({id:'flew',key:'flight',text:'The Jumper flew yesterday.',authority:'campaign-established',stamp:campaign.state.scene.stamp})];
    const memory=knowledgeRecords(campaign).find(r=>r.id==='flew');if(!memory)throw new Error('missing fact record');
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}),[{record:memory,score:1,reason:'test'}]);
    const npc=context.layers.find(l=>l.name.startsWith('NPC beliefs'));
    expect(npc?.authority).toBe('campaign-established');expect(npc?.domain).toBe('npc-epistemic');
    expect(npc?.authority).not.toBe('authoritative');expect(npc?.domain).not.toBe('world-state');
    const fact=context.layers.find(l=>l.name==='Retrieved campaign memories');
    expect(fact?.domain).toBe('world-state');expect(fact?.authority).toBe('campaign-established');
  });
  it('distinguishes directives and user actions from factual authority',()=>{
    const {bundle,campaign}=aiFixture();const context=compileContext(bundle,campaign,'Attack the troll',ProviderSchema.parse({}));
    for(const name of ['GM system rules','Campaign style and rules']){
      const layer=context.layers.find(l=>l.name===name);
      expect(layer?.salience).toBe('directive');expect(layer?.authority).toBeNull();expect(layer?.domain).toBe('directive');expect(layer?.mandatory).toBe(true);
    }
    const action=context.layers.find(l=>l.name==='Current user action');
    expect(action?.salience).toBe('directive');expect(action?.authority).toBeNull();expect(action?.domain).toBe('player-action');expect(action?.mandatory).toBe(true);
    const scene=context.layers.find(l=>l.name==='Current scene facts');
    expect(scene?.salience).toBe('required');expect(scene?.authority).toBe('campaign-established');expect(scene?.domain).toBe('world-state');expect(scene?.mandatory).toBe(true);
  });
  it('classifies recent conversation as non-mandatory narrative history',()=>{
    const {bundle,campaign}=aiFixture();
    campaign.turns.push(TurnSchema.parse({id:'t1',createdAt:'now',action:'enter the hall',narrative:'You enter the hall.',status:'complete',before:campaign.state,baseRevision:0}));
    const context=compileContext(bundle,campaign,'Look around',ProviderSchema.parse({}));
    const layer=context.layers.find(l=>l.name==='Recent conversation');
    expect(layer?.salience).toBe('background');expect(layer?.authority).toBeNull();expect(layer?.domain).toBe('narrative-history');expect(layer?.mandatory).toBe(false);
  });
  it('serializes and parses layers with the new metadata, defaulting legacy layers',()=>{
    const {bundle,campaign}=aiFixture();const context=compileContext(bundle,campaign,'Look around Hogwarts.',ProviderSchema.parse({}));
    const parsed=ContextSchema.parse(JSON.parse(stableStringify(context)));
    expect(parsed.layers).toEqual(context.layers);
    expect(parsed.layers.every(l=>['directive','focused','required','relevant','background'].includes(l.salience))).toBe(true);
    expect(parsed.layers.every(l=>l.authority===null||['authoritative','canonical-source','campaign-established','player-established','inferred','speculative'].includes(l.authority))).toBe(true);
    expect(parsed.layers.every(l=>['directive','player-action','mechanics','world-state','npc-epistemic','narrative-history'].includes(l.domain))).toBe(true);
    expect(parsed.layers.every(l=>typeof l.mandatory==='boolean')).toBe(true);
    const legacy=ContextSchema.parse({...context,layers:[{name:'Legacy layer',content:'old',sourceIds:[],estimatedTokens:5}]});
    expect(legacy.layers[0].salience).toBe('background');expect(legacy.layers[0].authority).toBeNull();expect(legacy.layers[0].domain).toBe('narrative-history');expect(legacy.layers[0].mandatory).toBe(false);
  });
});
describe('hybrid retrieval, chronology, provenance, and disposable indices',()=>{
  function fixture(){const {campaign}=aiFixture();campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Canon',entries:[{id:'canon',title:'Snape',factKey:'snape-belief',text:'Snape believes Harry is a spy. spy spy spy',entities:['Snape']}]})];campaign.state.facts=[FactSchema.parse({id:'learned',key:'snape-belief',text:'Snape learned Harry is innocent.',authority:'campaign-established',stamp:campaign.state.scene.stamp,entities:['Snape']})];return campaign;}
  it('resolves established campaign divergence before keyword scoring',()=>{const records=knowledgeRecords(fixture());const result=hybridRetriever.search('Snape spy',records,{limit:10});expect(result.map(r=>r.record.sourceId)).toContain('learned');expect(result.some(r=>r.record.sourceId==='canon')).toBe(false);});
  it('does not promote speculation over a source and filters entities, tags, authority, and location',()=>{const c=fixture();c.state.facts[0].authority='speculative';const records=knowledgeRecords(c);expect(hybridRetriever.search('Snape',records,{limit:10})[0].record.sourceId).toBe('canon');expect(eligibleRecords(records,{entity:'Unknown'})).toEqual([]);expect(eligibleRecords(records,{tags:['missing']})).toEqual([]);expect(eligibleRecords(records,{location:'Mars'})).toEqual([]);});
  it('surfaces historical facts before their superseding event and excludes future facts',()=>{const c=fixture();c.state.facts[0].supersededBy='new';c.state.facts.push(FactSchema.parse({...c.state.facts[0],id:'new',supersededBy:null,text:'Snape changed his mind.',stamp:{...c.state.scene.stamp,elapsedMinutes:200}}));const records=knowledgeRecords(c);expect(eligibleRecords(records,{jump:c.state.scene.stamp.jumpId,before:150}).map(r=>r.id)).toContain('learned');expect(eligibleRecords(records,{jump:c.state.scene.stamp.jumpId,before:250}).map(r=>r.id)).not.toContain('learned');});
  it('fuses dense and lexical candidates and rebuild fingerprints change only with source changes',()=>{const c=fixture();const records=knowledgeRecords(c);const fp=indexFingerprint(records);const index={version:1 as const,fingerprint:fp,provider:'test',vectors:Object.fromEntries(records.map(r=>[r.id,[1,0]]))};expect(hybridRetriever.search('unrelated query',records,{limit:2,index,queryVector:[1,0]}).length).toBeGreaterThan(0);expect(indexFingerprint(records.slice().reverse())).toBe(fp);delete index.vectors.learned;expect(c.state.facts).toHaveLength(1);c.state.facts[0].text='Changed';expect(indexFingerprint(knowledgeRecords(c))).not.toBe(fp);});
});
describe('proposals, validation, audit, and rollback',()=>{
  it('rejects mechanical operations, forged provenance, reverse time, and unknown companions',()=>{
    const {bundle,campaign}=aiFixture();expect(()=>ProposalSchema.parse({rationale:'',changes:[{kind:'perk',value:{}}]})).toThrow();
    const fact=FactSchema.parse({id:'new',key:'fact',text:'x',authority:'authoritative',stamp:campaign.state.scene.stamp,sourceIds:['turn']});
    expect(()=>applyProposal(campaign.state,{rationale:'',changes:[{kind:'fact',value:fact}]},bundle,campaign,['turn'])).toThrow(/authority/);
    fact.authority='inferred';fact.sourceIds=['invented'];expect(()=>applyProposal(campaign.state,{rationale:'',changes:[{kind:'fact',value:fact}]},bundle,campaign,['turn'])).toThrow(/provenance/);
    const scene=structuredClone(campaign.state.scene);scene.stamp.elapsedMinutes=0;expect(()=>applyProposal(campaign.state,{rationale:'',changes:[{kind:'scene',value:scene}]},bundle,campaign,[])).toThrow(/reverse/);
    scene.stamp.elapsedMinutes=110;scene.presentCompanionIds=['fake'];expect(()=>applyProposal(campaign.state,{rationale:'',changes:[{kind:'scene',value:scene}]},bundle,campaign,[])).toThrow(/not active/);
  });
  it('audits accepted state, rolls back, and excludes rolled-back narrative from future context',()=>{
    const {bundle,campaign}=aiFixture();const before=stableStringify(bundle);const scene={...campaign.state.scene,location:'Great Hall'};
    const turn=TurnSchema.parse({id:'turn',createdAt:'now',action:'enter',narrative:'The troll dies.',status:'complete',before:campaign.state,baseRevision:0});campaign.turns.push(turn);
    const next=applyProposal(campaign.state,{rationale:'The player entered',changes:[{kind:'scene',value:scene}]},bundle,campaign,['turn']);
    expect(campaign.state.scene.location).toBe('Hogwarts');auditChange(campaign,next,'Accepted','turn','audit');expect(campaign.state.scene.location).toBe('Great Hall');
    rollbackLatest(campaign);expect(campaign.state.scene.location).toBe('Hogwarts');expect(campaign.audit[0].rolledBack).toBe(true);expect(stableStringify(bundle)).toBe(before);
    expect(compileContext(bundle,campaign,'Look around',ProviderSchema.parse({})).messages.some(m=>m.content==='The troll dies.')).toBe(false);
  });
  it('round trips versioned campaign saves and rejects future versions/cyclic supersession',()=>{
    const {campaign}=aiFixture();expect(migrateCampaign(JSON.parse(stableStringify(campaign)))).toEqual(campaign);expect(()=>migrateCampaign({...campaign,schemaVersion:999})).toThrow();
    const fact=FactSchema.parse({id:'a',key:'x',text:'A',authority:'inferred',stamp:campaign.state.scene.stamp,supersededBy:'b'});campaign.state.facts=[fact,{...fact,id:'b',supersededBy:'a'}];expect(()=>validateState(campaign.state)).toThrow(/Cyclic/);
  });
});
describe('reviewed ingestion',()=>{
  it('imports markdown with separate sections and validates JSON formats',()=>{expect(importWorldbook('# Places\nHogwarts\n# People\nSnape','lore.md','book').entries).toHaveLength(2);expect(()=>importWorldbook('{broken','lore.json','book')).toThrow();expect(()=>importWorldbook('','empty.txt','book')).toThrow();});
  it('preserves costs, options, source bounds, and warns about ungrounded extraction',()=>{
    const section={id:'s1',title:'Perks',text:'Fly anywhere.',page:3,bounds:[{page:3,x:.1,y:.2,width:.6,height:.3}]};
    const raw={title:'Flight',entries:[{kind:'perk',title:'Flying',description:'Fly anywhere.',sectionId:'s1',costs:[{amount:100,currencyKey:'0'}],temporary:true,discounts:'Free for birds'}]};
    const doc=extractedJumpDoc(createBlankJumpDoc('chain','branch'),raw,[section]);expect(doc.purchases[0].bounds).toEqual(section.bounds);expect(doc.purchases[0].temporary).toBe(true);expect(doc.purchases[0].costs[0].amount).toBe(100);
    raw.entries[0].description='Invented immunity.';expect(validateExtraction(raw,[section]).warnings[0]).toContain('differs');raw.entries[0].sectionId='missing';expect(()=>validateExtraction(raw,[section])).toThrow(/unknown source/);
  });
});
