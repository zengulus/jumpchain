import { describe,it,expect } from 'vitest';
import { compileContext, mechanicalRecords, trackerFingerprint } from '../ai/context';
import { ContextSchema, FactSchema, NpcSchema, ProviderSchema, ProposalSchema, TurnSchema, WorldbookSchema, stableStringify, migrateCampaign, type Worldbook } from '../ai/schema';
import { eligibleRecords, hybridRetriever, indexFingerprint, knowledgeRecords, narrationLoreQuery, searchableText, tokens } from '../ai/retrieval';
import { reviewProposal, rollbackLatest, validateState, validateWorldbookScopes } from '../ai/state';
import { exportSillyTavernWorldbook, isSillyTavernWorldInfo } from '../ai/sillyTavern';
import { extractedJumpDoc, importWorldbook, validateExtraction } from '../ai/documents';
import { createBlankJumpDoc } from '../features/workspace/records';
import { normalizeParticipationSelections } from '../domain/jump/selection';
import { planTransition } from '../ai/transitions';
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
  it('compiles reviewed NPC objective state as campaign-established world-state',()=>{
    const {bundle,campaign}=aiFixture();
    campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',location:'Hogwarts',beliefs:['The Jumper cannot fly.']})];campaign.state.scene.npcIds=['npc'];
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}));
    const objective=context.layers.find(l=>l.name==='NPC campaign state');
    expect(objective?.authority).toBe('campaign-established');expect(objective?.domain).toBe('world-state');
    expect(objective?.salience).toBe('required');expect(objective?.mandatory).toBe(true);expect(objective?.content).toContain('Hogwarts');
    const epistemic=context.layers.find(l=>l.name.startsWith('NPC beliefs'));
    expect(epistemic?.authority).toBe('campaign-established');expect(epistemic?.domain).toBe('npc-epistemic');
    expect(epistemic?.content).not.toContain('Hogwarts');
  });
  it('keeps NPC goals and plans in the objective campaign-state layer, not the epistemic layer',()=>{
    const {bundle,campaign}=aiFixture();
    campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',goals:['Keep Hogwarts safe.'],plans:['Investigate the jumper.']})];campaign.state.scene.npcIds=['npc'];
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}));
    const objective=context.layers.find(l=>l.name==='NPC campaign state');
    expect(objective?.domain).toBe('world-state');expect(objective?.content).toContain('Keep Hogwarts safe.');expect(objective?.content).toContain('Investigate the jumper.');
    expect(context.layers.some(l=>l.name.startsWith('NPC beliefs'))).toBe(false);
  });
  it('omits empty NPC epistemic layers while keeping the objective layer',()=>{
    const {bundle,campaign}=aiFixture();
    campaign.state.npcs=[NpcSchema.parse({id:'npc',name:'Minerva',location:'Hogwarts'})];campaign.state.scene.npcIds=['npc'];
    const context=compileContext(bundle,campaign,'Talk to Minerva',ProviderSchema.parse({}));
    expect(context.layers.some(l=>l.name.startsWith('NPC beliefs'))).toBe(false);
    expect(context.layers.some(l=>l.name==='NPC campaign state')).toBe(true);
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
  function fixture(){const {campaign}=aiFixture();campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Canon',jumpId:'jump-a',entries:[{id:'canon',title:'Snape',factKey:'snape-belief',text:'Snape believes Harry is a spy. spy spy spy',entities:['Snape']}]})];campaign.state.facts=[FactSchema.parse({id:'learned',key:'snape-belief',text:'Snape learned Harry is innocent.',authority:'campaign-established',stamp:campaign.state.scene.stamp,entities:['Snape']})];return campaign;}
  it('resolves established campaign divergence before keyword scoring',()=>{const records=knowledgeRecords(fixture());const result=hybridRetriever.search('Snape spy',records,{limit:10});expect(result.map(r=>r.record.sourceId)).toContain('learned');expect(result.some(r=>r.record.sourceId==='canon')).toBe(false);});
  it('does not promote speculation over a source and filters entities, tags, authority, and location',()=>{const c=fixture();c.state.facts[0].authority='speculative';const records=knowledgeRecords(c);expect(hybridRetriever.search('Snape',records,{limit:10})[0].record.sourceId).toBe('canon');expect(eligibleRecords(records,{entity:'Unknown'})).toEqual([]);expect(eligibleRecords(records,{tags:['missing']})).toEqual([]);expect(eligibleRecords(records,{location:'Mars'})).toEqual([]);});
  it('surfaces historical facts before their superseding event and excludes future facts',()=>{const c=fixture();c.state.facts[0].supersededBy='new';c.state.facts.push(FactSchema.parse({...c.state.facts[0],id:'new',supersededBy:null,text:'Snape changed his mind.',stamp:{...c.state.scene.stamp,elapsedMinutes:200}}));const records=knowledgeRecords(c);expect(eligibleRecords(records,{jump:c.state.scene.stamp.jumpId,before:150}).map(r=>r.id)).toContain('learned');expect(eligibleRecords(records,{jump:c.state.scene.stamp.jumpId,before:250}).map(r=>r.id)).not.toContain('learned');});
  it('fuses dense and lexical candidates and rebuild fingerprints change only with source changes',()=>{const c=fixture();const records=knowledgeRecords(c);const fp=indexFingerprint(records);const index={version:1 as const,fingerprint:fp,provider:'test',vectors:Object.fromEntries(records.map(r=>[r.id,[1,0]]))};expect(hybridRetriever.search('unrelated query',records,{limit:2,index,queryVector:[1,0]}).length).toBeGreaterThan(0);expect(indexFingerprint(records.slice().reverse())).toBe(fp);delete index.vectors.learned;expect(c.state.facts).toHaveLength(1);c.state.facts[0].text='Changed';expect(indexFingerprint(knowledgeRecords(c))).not.toBe(fp);});
});
describe('canonical search projection and scene-aware lore queries',()=>{
  function loreCampaign(entries: Record<string,unknown>[]) {
    const {campaign}=aiFixture();
    campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Canon',jumpId:campaign.state.scene.stamp.jumpId,entries})];
    return campaign;
  }
  it('builds the narration lore query from the action plus scene location and threads only',()=>{
    expect(narrationLoreQuery('I look around.',{location:'Great Hall',threads:['The feast is about to begin.','Investigate the owlery']})).toBe('I look around. Great Hall The feast is about to begin. Investigate the owlery');
    // Threads are bounded scene signal: action and location always survive, verbose threads fill a
    // deterministic character budget in scene order, later threads are dropped entirely.
    expect(narrationLoreQuery('I look around.',{threads:['x'.repeat(600),'second thread never fits']})).toBe(`I look around. ${'x'.repeat(600)}`);
    expect(narrationLoreQuery('I look around.',{threads:['a'.repeat(300),'b'.repeat(300),'c'.repeat(300)]})).toBe(`I look around. ${'a'.repeat(300)} ${'b'.repeat(300)}`);
    expect(narrationLoreQuery('Act',{threads:['a','b']})).toBe('Act a b');
    expect(narrationLoreQuery('Act',{location:'  '})).toBe('Act');
    expect(narrationLoreQuery('Act')).toBe('Act');
    expect(narrationLoreQuery('  Act  ',{location:' Hall '})).toBe('Act Hall');
  });
  it('projects retrieval metadata into one canonical searchable text used by every retrieval surface',()=>{
    const campaign=loreCampaign([{id:'e1',title:'Great Hall',aliases:["Mage's Association"],tags:['defense'],entities:['Ron'],text:'Hall text body.'}]);
    const record=knowledgeRecords(campaign)[0];
    const projection=searchableText(record);
    expect(projection).toContain('Great Hall');
    expect(projection).toContain("Mage's Association");
    expect(projection).toContain('defense');
    expect(projection).toContain('Hall text body.');
    expect(projection.split('Ron').length-1).toBe(1);
    // The index fingerprint covers the exact projection, so metadata edits invalidate dense indexes.
    const before=indexFingerprint(knowledgeRecords(campaign));
    campaign.worldbooks[0].entries[0].aliases=["Mage's Association",'Order of the Phoenix'];
    expect(indexFingerprint(knowledgeRecords(campaign))).not.toBe(before);
    campaign.worldbooks[0].entries[0].tags=['defense','transfiguration'];
    expect(indexFingerprint(knowledgeRecords(campaign))).not.toBe(before);
  });
  it('retrieves a named scene location from a vague action, where the bare action retrieves nothing',()=>{
    const campaign=loreCampaign([
      {id:'great-hall',title:'Great Hall',text:'Enchanted ceiling above four long tables.'},
      {id:'library',title:'Library',text:'Restricted tomes wait behind a rope.'},
      {id:'pitch',title:'Quidditch pitch',text:'Rings stand at the edge of the grounds.'}]);
    campaign.state.scene.location='Great Hall';
    const records=knowledgeRecords(campaign);
    const results=hybridRetriever.search(narrationLoreQuery('I look around.',campaign.state.scene),records,{limit:3});
    expect(results[0].record.sourceId).toBe('great-hall');
    expect(hybridRetriever.search('I look around.',records,{limit:3})).toEqual([]);
  });
  it('lets active scene threads contribute retrieval signal without changing eligibility',()=>{
    const campaign=loreCampaign([
      {id:'great-hall',title:'Great Hall',text:'Enchanted ceiling above four long tables.'},
      {id:'kitchens',title:'Kitchens',text:'House elves prepare the feast in the undercroft.'}]);
    campaign.state.scene.location='Great Hall';
    campaign.state.scene.threads=['The feast is about to begin.'];
    const records=knowledgeRecords(campaign);
    const withThreads=hybridRetriever.search(narrationLoreQuery('I look around.',campaign.state.scene),records,{limit:4}).map(r=>r.record.sourceId);
    expect(withThreads).toContain('kitchens');
    const withoutThreads=hybridRetriever.search(narrationLoreQuery('I look around.',{location:'Great Hall'}),records,{limit:4}).map(r=>r.record.sourceId);
    expect(withoutThreads).not.toContain('kitchens');
  });
  it('keeps a precise action stronger than scene location for action-relevant lore elsewhere',()=>{
    const campaign=loreCampaign([
      {id:'great-hall',title:'Great Hall',text:'Enchanted ceiling above four long tables.'},
      {id:'library',title:'Library',text:'Restricted tomes wait behind a rope in the library.'}]);
    campaign.state.scene.location='Great Hall';
    const results=hybridRetriever.search(narrationLoreQuery('I ask the librarian about the restricted tomes.',campaign.state.scene),knowledgeRecords(campaign),{limit:2});
    expect(results[0].record.sourceId).toBe('library');
  });
  it('treats scene location as a signal, never a hard location filter',()=>{
    const campaign=loreCampaign([
      {id:'great-hall',title:'Great Hall',text:'Enchanted ceiling above four long tables.'},
      {id:'dungeon',title:'Dungeons',location:'Dungeons',text:'Potions class simmers in the dungeons.'}]);
    campaign.state.scene.location='Great Hall';
    const records=knowledgeRecords(campaign);
    const results=hybridRetriever.search(narrationLoreQuery('I head to potions class.',campaign.state.scene),records,{limit:2});
    // The action-relevant entry is retrieved alongside the location match — location is a ranking
    // signal, never an eligibility filter.
    expect(results.map(r=>r.record.sourceId).sort()).toEqual(['dungeon','great-hall']);
    expect(eligibleRecords(records).map(r=>r.sourceId)).toEqual(['great-hall','dungeon']);
    // Contrast: without the action terms, the location signal alone still retrieves only hall lore.
    expect(hybridRetriever.search(narrationLoreQuery('I look around.',campaign.state.scene),records,{limit:2}).every(r=>r.record.sourceId==='great-hall')).toBe(true);
  });
  it('keeps authority a label: flipping lore authority does not move relevance scores',()=>{
    const campaign=loreCampaign([
      {id:'a',title:'Moon',text:'Silver light lore.'},
      {id:'b',title:'Sun',text:'Golden light lore.'}]);
    const records=knowledgeRecords(campaign);
    const base=hybridRetriever.search('light',records,{limit:10}).map(r=>[r.record.id,r.score]);
    const flipped=records.map(r=>({...r,authority:r.authority==='canonical-source'?'speculative' as const:'canonical-source' as const}));
    expect(base).toEqual(hybridRetriever.search('light',flipped,{limit:10}).map(r=>[r.record.id,r.score]));
  });
  it('gives SillyTavern activation metadata zero retrieval effect',()=>{
    const campaign=loreCampaign([{id:'e1',title:'Kirei',text:'Kirei is a priest at the church.',aliases:['Kirei','Kotomine']}]);
    const plain=campaign.worldbooks[0];
    const decorated=WorldbookSchema.parse({...plain,id:'b2',entries:[{...plain.entries[0],interop:{sillyTavern:{uid:7,entryKey:'7',secondaryKeys:['Church'],metadata:{constant:true,order:9999,position:6,probability:5,vectorized:true,selective:true,depth:12}}}}]}) as Worldbook;
    const rank=(book:Worldbook)=>hybridRetriever.search('priest at the church',knowledgeRecords({...campaign,worldbooks:[book]}),{limit:5}).map(r=>[r.record.sourceId,r.score]);
    expect(rank(decorated)).toEqual(rank(plain));
    expect(rank(decorated)[0][0]).toBe('e1');
    const projection=searchableText(knowledgeRecords({...campaign,worldbooks:[decorated]})[0]);
    expect(projection).not.toContain('9999');
    expect(projection).not.toContain('constant');
  });
  it('ranks projection-built dense vectors by alias signal even without lexical text overlap elsewhere',()=>{
    const campaign=loreCampaign([
      {id:'alias-only',title:'The Keeper',aliases:['Kirei'],text:'He tends the temple altar.'},
      {id:'plain',title:'Villager',text:'He tends the temple altar altar.'}]);
    const records=knowledgeRecords(campaign);
    const embed=(text:string)=>[tokens(text).includes('kirei')?1:0, tokens(text).includes('altar')?1:0];
    const index={version:1 as const,fingerprint:indexFingerprint(records),provider:'test',vectors:Object.fromEntries(records.map(r=>[r.id,embed(searchableText(r))]))};
    const results=hybridRetriever.search('Kirei',records,{limit:2,index,queryVector:embed('Kirei')});
    expect(results[0].record.sourceId).toBe('alias-only');
    expect(results[0].reason).toContain('dense');
  });
});
describe('lore source diversity for long chunked entries',()=>{
  // One long entry produces four near-duplicate chunks; four independent entries are also
  // relevant. Search must stay rank-neutral; diversity is enforced only at lore admission.
  // A small loreDepth (4) keeps the groupCount quota (2) below the long entry's chunk count,
  // so the pre-fix behavior (3-4 services chunks admitted) is directly observable.
  function crowdingCampaign(){const {bundle,campaign}=aiFixture();const filler=Array.from({length:60},(_,i)=>`Center paragraph ${i}: healing machines hum while trainers wait for their pokemon to recover.`).join('\n\n');
    campaign.settings.loreDepth=4;
    campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Canon',jumpId:campaign.state.scene.stamp.jumpId,entries:[
      {id:'services',title:'Pokemon Center services',text:`Services opening.\n\n${filler}\n\nServices closing.`},
      {id:'medical',title:'Trainer medical practice',text:'Trainer medical practice treats people hurt in battle.'},
      {id:'fainting',title:'Injury and fainting',text:'Injury and fainting rules for pokemon hurt in battle.'},
      {id:'norms',title:'Battle norms',text:'Battle norms govern fair fights between trainers.'},
      {id:'regulations',title:'Local regulations',text:'Local regulations for battle venues and trainers.'},
    ]})];return {bundle,campaign};}
  it('returns all matching chunks in rank order without reordering retrieval',()=>{
    const {campaign}=crowdingCampaign();const results=hybridRetriever.search(narrationLoreQuery('battle healing',campaign.state.scene),knowledgeRecords(campaign),{limit:100});
    const service=results.filter(r=>r.record.sourceId==='services');
    // Retrieval is untouched: all four chunks are retrieved, the top of the ranking is
    // dominated by them, and interleaving with other sources is allowed and never reordered.
    expect(service).toHaveLength(4);
    expect(results.slice(0,4).filter(r=>r.record.sourceId==='services').length).toBeGreaterThanOrEqual(3);
  });
  it('admits other independent sources before redundant chunks of one long entry',()=>{
    const {bundle,campaign}=crowdingCampaign();
    const context=compileContext(bundle,campaign,'battle healing',ProviderSchema.parse({}),hybridRetriever.search(narrationLoreQuery('battle healing',campaign.state.scene),knowledgeRecords(campaign),{limit:100}));
    const selected=context.plan?.selected.filter(c=>c.pool==='lore').map(c=>c.groupKey) ?? [];
    // Pre-fix behavior would admit all four near-duplicate services chunks; the quota leaves
    // room for three of the four independent sources within the same small lore budget.
    expect(selected).toHaveLength(4);
    expect(selected.filter(g=>g==='book/services')).toHaveLength(2);
    expect(selected.filter(g=>g!=='book/services')).toHaveLength(2);
    // Chunks 1 and 2 rank at the top; chunk 0 (and 3) fall to the quota even though chunk 0
    // outranks two of the independent sources that take the remaining slots.
    expect(context.plan?.decisions.filter(d=>d.reason==='pool-group').map(d=>d.candidate.sourceIds[0]).sort()).toEqual(['book/services/0','book/services/3']);
  });
  it('qualifies group keys by owning book so identical entry ids never merge',()=>{
    const {bundle,campaign}=crowdingCampaign();
    campaign.worldbooks.push(WorldbookSchema.parse({id:'book2',title:'Other',jumpId:campaign.state.scene.stamp.jumpId,entries:[{id:'services',title:'Battle healing services',text:'Battle healing services: battle healing battle healing.'}]}));
    const context=compileContext(bundle,campaign,'battle healing',ProviderSchema.parse({}),hybridRetriever.search(narrationLoreQuery('battle healing',campaign.state.scene),knowledgeRecords(campaign),{limit:100}));
    const lore=context.plan?.decisions.filter(d=>d.candidate.pool==='lore').map(d=>[d.candidate.groupKey,d.included]) ?? [];
    // The same entry id in two books stays two logical sources, each counted against its own
    // quota: two book/services chunks and the book2 chunk are all admitted together.
    expect(lore.filter(([g])=>g==='book/services')).toHaveLength(4);
    expect(lore.filter(([g])=>g==='book2/services')).toHaveLength(1);
    expect(lore.filter(([g,included])=>g==='book/services'&&included)).toHaveLength(2);
    expect(lore.filter(([g,included])=>g==='book2/services'&&included)).toHaveLength(1);
  });
  it('fingerprints exactly the embedding inputs, not unrelated record metadata',()=>{
    const {campaign}=crowdingCampaign();const records=knowledgeRecords(campaign);const before=indexFingerprint(records);
    const authorityFlip=records.map(r=>({...r,authority:r.authority==='canonical-source'?'speculative' as const:'canonical-source' as const}));
    expect(indexFingerprint(authorityFlip)).toBe(before);
    const relabeled=records.map(r=>({...r,id:`x${r.id}`}));
    expect(indexFingerprint(relabeled)).not.toBe(before);
    expect(indexFingerprint(records.map(r=>({...r,text:`${r.text} changed`})))).not.toBe(before);
  });
});
describe('proposals, validation, audit, and rollback',()=>{
  it('rejects mechanical operations, forged provenance, reverse time, and unknown companions',()=>{
    const {bundle,campaign}=aiFixture();expect(()=>ProposalSchema.parse({rationale:'',changes:[{kind:'perk',value:{}}]})).toThrow();
    const context={origin:'model-proposal' as const,campaign,bundle,sourceTurnId:'turn'};
    expect(()=>planTransition(campaign.state,[{kind:'fact.create',handle:'fact',value:{key:'fact',text:'x',authority:'authoritative'}}],context,'t')).toThrow(/authority/);
    expect(()=>planTransition(campaign.state,[{kind:'fact.create',handle:'fact',value:{key:'fact',text:'x',authority:'inferred',sourceIds:['forged']}}],context,'t')).toThrow(/sourceIds/);
    expect(()=>planTransition(campaign.state,[{kind:'scene.advance',minutes:-1}],context,'t')).toThrow();
    expect(()=>planTransition(campaign.state,[{kind:'scene.presence',companionIds:['fake']}],context,'t')).toThrow(/not active/);
  });
  it('audits accepted state, rolls back, and excludes rolled-back narrative from future context',()=>{
    const {bundle,campaign}=aiFixture();const before=stableStringify(bundle);const scene={...campaign.state.scene,location:'Great Hall'};
    const operations=[{kind:'scene.update' as const,value:{location:scene.location}}];
    const turn=TurnSchema.parse({id:'turn',createdAt:'now',action:'enter',narrative:'The troll dies.',status:'complete',before:campaign.state,baseRevision:0,context:compileContext(bundle,campaign,'enter',ProviderSchema.parse({})),proposal:{version:2,rationale:'Entered',operations},proposalStatus:'pending'});campaign.turns.push(turn);
    turn.transitionPlan=planTransition(campaign.state,operations,{origin:'model-proposal',campaign,bundle,sourceTurnId:turn.id},'audit');
    expect(campaign.state.scene.location).toBe('Hogwarts');reviewProposal(campaign,bundle,turn.id,true,'now');expect(campaign.state.scene.location).toBe('Great Hall');
    rollbackLatest(campaign);expect(campaign.state.scene.location).toBe('Hogwarts');expect(campaign.audit[0].rolledBack).toBe(true);expect(stableStringify(bundle)).toBe(before);
    expect(compileContext(bundle,campaign,'Look around',ProviderSchema.parse({})).messages.some(m=>m.content==='The troll dies.')).toBe(false);
  });
  it('round trips versioned campaign saves and rejects future versions/cyclic supersession',()=>{
    const {campaign}=aiFixture();expect(migrateCampaign(JSON.parse(stableStringify(campaign)))).toEqual(campaign);expect(()=>migrateCampaign({...campaign,schemaVersion:999})).toThrow();
    const fact=FactSchema.parse({id:'a',key:'x',text:'A',authority:'inferred',stamp:campaign.state.scene.stamp,supersededBy:'b'});campaign.state.facts=[fact,{...fact,id:'b',supersededBy:'a'}];expect(()=>validateState(campaign.state)).toThrow(/Cyclic/);
  });
});
describe('SillyTavern World Info interoperability',()=>{
  const stSample={entries:{'42':{uid:42,key:['Kirei','Kotomine'],keysecondary:['Church'],comment:'Kirei Kotomine',content:'Kirei is a priest.',constant:false,order:250,position:0,disable:false,probability:75,vectorized:true}}};
  it('detects and imports an ST lorebook with preserved interop metadata',()=>{
    expect(isSillyTavernWorldInfo(stSample)).toBe(true);
    const book=importWorldbook(JSON.stringify(stSample),'fate.json','book',{currentJumpId:'jump-a'});
    expect(book.jumpId).toBe('jump-a');
    const entry=book.entries[0];
    expect(entry.title).toBe('Kirei Kotomine');expect(entry.text).toBe('Kirei is a priest.');
    expect(entry.aliases).toContain('Kirei');expect(entry.aliases).toContain('Kotomine');
    expect(entry.enabled).toBe(true);expect(entry.authority).toBe('canonical-source');expect(entry.source).toContain('fate.json');
    const st=entry.interop?.sillyTavern;
    expect(st?.uid).toBe(42);expect(st?.secondaryKeys).toEqual(['Church']);
    expect(st?.metadata?.order).toBe(250);expect(st?.metadata?.position).toBe(0);expect(st?.metadata?.probability).toBe(75);expect(st?.metadata?.vectorized).toBe(true);
    expect(st?.metadata?.content).toBeUndefined();
  });
  it('imports disabled ST entries as disabled and excludes them from retrieval while keeping them persisted',()=>{
    const raw={entries:{'7':{uid:7,key:['Sealed'],comment:'Sealed lore',content:'Hidden.',disable:true},'8':{uid:8,key:['Open'],comment:'Open lore',content:'Visible.',disable:false}}};
    const book=importWorldbook(JSON.stringify(raw),'s.json','book',{currentJumpId:'jump-a'});
    expect(book.entries.find(e=>e.interop?.sillyTavern?.uid===7)?.enabled).toBe(false);
    expect(book.entries.find(e=>e.interop?.sillyTavern?.uid===8)?.enabled).toBe(true);
    const {campaign}=aiFixture();campaign.worldbooks=[book];
    const records=knowledgeRecords(campaign);
    expect(records.some(r=>r.text.includes('Hidden.'))).toBe(false);
    expect(records.some(r=>r.text.includes('Visible.'))).toBe(true);
    expect(campaign.worldbooks[0].entries).toHaveLength(2);
  });
  it('round trips ST import → native edit → ST export',()=>{
    const book=importWorldbook(JSON.stringify(stSample),'fate.json','book',{currentJumpId:'jump-a'});
    book.entries[0].text='Kirei is a priest of the Church.';
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,{uid:number;key:string[];keysecondary:string[];comment:string;content:string;disable:boolean;order:number;probability:number;vectorized:boolean}>};
    const e=out.entries['42'];
    expect(e.content).toBe('Kirei is a priest of the Church.');expect(e.comment).toBe('Kirei Kotomine');
    expect(e.key).toEqual(expect.arrayContaining(['Kirei','Kotomine']));expect(e.keysecondary).toEqual(['Church']);
    expect(e.uid).toBe(42);expect(e.disable).toBe(false);
    expect(e.order).toBe(250);expect(e.probability).toBe(75);expect(e.vectorized).toBe(true);
  });
  it('exports native entries with sensible ST defaults',()=>{
    const book=WorldbookSchema.parse({id:'b',title:'Settings',jumpId:'jump-a',entries:[{id:'e1',title:'Clock Tower',aliases:["Mage's Association",'Clock Tower'],text:'The Clock Tower is the center of magecraft.'}]});
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,Record<string,unknown>>};
    const e=out.entries['e1'];
    expect(e.content).toBe('The Clock Tower is the center of magecraft.');expect(e.comment).toBe('Clock Tower');
    expect(e.key).toContain('Clock Tower');expect(e.disable).toBe(false);
    expect(e.constant).toBe(false);expect(e.selective).toBe(false);expect(e.order).toBe(100);expect(e.position).toBe(0);
    expect(e.probability).toBe(100);expect(e.useProbability).toBe(true);expect(e.excludeRecursion).toBe(false);expect(e.depth).toBe(4);expect(e.vectorized).toBe(false);
  });
  it('preserves unknown ST extension fields across a round trip',()=>{
    const raw={entries:{'x':{uid:'x',key:['Mystery'],comment:'M',content:'C.',customField:{nested:true},another:42}}};
    const book=importWorldbook(JSON.stringify(raw),'u.json','book',{currentJumpId:'jump-a'});
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,Record<string,unknown>>};
    expect(out.entries['x'].customField).toEqual({nested:true});expect(out.entries['x'].another).toBe(42);
    expect(out.entries['x'].content).toBe('C.');
  });
  it('imports native JSON worldbooks and defaults missing enabled/interop fields, scoping legacy books to the caller Jump',()=>{
    const native={id:'n',title:'Native',entries:[{id:'e',title:'T',text:'X'}]};
    const book=importWorldbook(JSON.stringify(native),'native.json','ignored',{currentJumpId:'jump-a'});
    expect(book.jumpId).toBe('jump-a');
    expect(book).toEqual(WorldbookSchema.parse({...native,jumpId:'jump-a'}));
    expect(book.entries[0].enabled).toBe(true);expect(book.entries[0].interop).toBeUndefined();
    expect(isSillyTavernWorldInfo(native)).toBe(false);
  });
  it('rejects unrelated JSON with a clear unsupported-worldbook error',()=>{
    expect(()=>importWorldbook(JSON.stringify({foo:1,bar:[]}),'x.json','b',{currentJumpId:'jump-a'})).toThrow(/neither a Jumpchain native worldbook nor a supported SillyTavern World Info format/);
  });
  it('keeps the ST object key and uid distinct in identity and interop metadata',()=>{
    const raw={entries:{'17':{uid:42,key:['Alice'],content:'Alice.'}}};
    const book=importWorldbook(JSON.stringify(raw),'a.json','book',{currentJumpId:'jump-a'});
    const entry=book.entries[0];
    expect(entry.id).toBe('book_st_17');
    expect(entry.interop?.sillyTavern?.entryKey).toBe('17');
    expect(entry.interop?.sillyTavern?.uid).toBe(42);
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,{uid:number}>};
    expect(out.entries['17'].uid).toBe(42);
  });
  it('does not collapse entries that share a uid but have distinct object keys',()=>{
    const raw={entries:{'17':{uid:4,key:['Alice'],content:'Alice.'},'29':{uid:4,key:['Bob'],content:'Bob.'}}};
    const book=importWorldbook(JSON.stringify(raw),'d.json','book',{currentJumpId:'jump-a'});
    expect(book.entries).toHaveLength(2);
    expect(new Set(book.entries.map(e=>e.id)).size).toBe(2);
    const byText=new Map(book.entries.map(e=>[e.text,e]));
    expect(byText.get('Alice.')?.interop?.sillyTavern?.entryKey).toBe('17');
    expect(byText.get('Bob.')?.interop?.sillyTavern?.entryKey).toBe('29');
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,{content:string;uid:number}>};
    expect(Object.keys(out.entries)).toHaveLength(2);
    expect(out.entries['17'].content).toBe('Alice.');expect(out.entries['17'].uid).toBe(4);
    expect(out.entries['29'].content).toBe('Bob.');expect(out.entries['29'].uid).toBe(4);
  });
  it('rejects unrelated entries-object JSON as unsupported',()=>{
    const raw={entries:{tax:{amount:5,category:'income'}}};
    expect(isSillyTavernWorldInfo(raw)).toBe(false);
    expect(()=>importWorldbook(JSON.stringify(raw),'t.json','b',{currentJumpId:'jump-a'})).toThrow(/neither a Jumpchain native worldbook nor a supported SillyTavern World Info format/);
  });
  it('fails clearly on ST entries with no usable content, naming the offending entry',()=>{
    expect(()=>importWorldbook(JSON.stringify({entries:{'42':{key:['Alice'],content:''}}}),'e.json','b',{currentJumpId:'jump-a'})).toThrow(/SillyTavern entry "42" has no usable content/);
    expect(()=>importWorldbook(JSON.stringify({entries:{'9':{key:['Bob']}}}),'e.json','b',{currentJumpId:'jump-a'})).toThrow(/SillyTavern entry "9" has no usable content/);
  });
  it('parses legacy interop data without entryKey and falls back safely on export',()=>{
    const book=WorldbookSchema.parse({id:'b',title:'Legacy',jumpId:'jump-a',entries:[{id:'e1',title:'T',text:'X',interop:{sillyTavern:{uid:42,secondaryKeys:[],metadata:{order:100}}}}]});
    expect(book.entries[0].interop?.sillyTavern?.entryKey).toBeUndefined();
    const out=exportSillyTavernWorldbook(book) as {entries:Record<string,{uid:number;order:number}>};
    expect(out.entries['42'].uid).toBe(42);expect(out.entries['42'].order).toBe(100);
  });
});
describe('worldbook Jump ownership scope',()=>{
  const stSample={entries:{'42':{uid:42,key:['Kirei'],comment:'Kirei',content:'Kirei is a priest.',constant:false,order:250,position:0,disable:false,probability:75,vectorized:true}}};
  function bookCampaign(bookJumpId:string,entryText:string,entryJumpId=''){const {campaign}=aiFixture();campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Moon lore',jumpId:bookJumpId,entries:[{id:'e1',title:'Moon',text:entryText,jumpId:entryJumpId}]})];return campaign;}
  function legacyCampaign(entryJumps:(string|undefined)[]){const {campaign}=aiFixture();campaign.state.scene.stamp.jumpId='scene-jump';const raw=JSON.parse(stableStringify(campaign)) as Record<string,unknown>;raw.worldbooks=[{id:'legacy-book',title:'Legacy',entries:entryJumps.map((jumpId,i)=>({id:`e${i}`,title:`T${i}`,text:`X${i}`,...(jumpId?{jumpId}:{})}))}];return migrateCampaign(raw).worldbooks[0];}
  it('A/G: scopes imported, authored, and text worldbooks to the campaign current Jump',()=>{
    const {campaign}=aiFixture();campaign.state.scene.stamp.jumpId='jump-a';
    const imported=importWorldbook(JSON.stringify(stSample),'fate.json','book',{currentJumpId:campaign.state.scene.stamp.jumpId});
    expect(imported.jumpId).toBe('jump-a');
    const out=exportSillyTavernWorldbook(imported) as {entries:Record<string,{content:string;uid:number;key:string[]}>};
    expect(out.entries['42'].content).toBe('Kirei is a priest.');expect(out.entries['42'].uid).toBe(42);expect(out.entries['42'].key).toEqual(['Kirei']);
    expect(importWorldbook('Hogwarts castle lore','lore.txt','text-book',{currentJumpId:'jump-a'}).jumpId).toBe('jump-a');
    expect(WorldbookSchema.parse({id:'a',title:'Authored',jumpId:'jump-a',entries:[{id:'x',title:'X',text:'Y'}]}).jumpId).toBe('jump-a');
  });
  it('B: excludes world lore owned by another Jump even when it is the stronger lexical match',()=>{
    const {campaign}=aiFixture();
    campaign.worldbooks=[WorldbookSchema.parse({id:'a',title:'Book A',jumpId:'jump-a',entries:[{id:'a1',title:'Moon',text:'The moon is made of silver cheese.'}]}),WorldbookSchema.parse({id:'b',title:'Book B',jumpId:'jump-b',entries:[{id:'b1',title:'Moon',text:'The moon is a Reaper construct.'}]})];
    const records=knowledgeRecords(campaign);const query='silver cheese Reaper construct';
    expect(eligibleRecords(records,{jump:'jump-a'}).map(r=>r.sourceId)).toEqual(['a1']);
    expect(hybridRetriever.search(query,records,{limit:10,filter:{jump:'jump-a'}}).map(r=>r.record.sourceId)).toEqual(['a1']);
    expect(eligibleRecords(records,{jump:'jump-b'}).map(r=>r.sourceId)).toEqual(['b1']);
    expect(hybridRetriever.search(query,records,{limit:10,filter:{jump:'jump-b'}}).map(r=>r.record.sourceId)).toEqual(['b1']);
  });
  it('C: a blank entry jumpId cannot leak a book into another Jump',()=>{
    const campaign=bookCampaign('jump-a','The gates of the moon are silver.','');
    const records=knowledgeRecords(campaign);
    expect(records[0].jump).toBe('jump-a');
    expect(eligibleRecords(records,{jump:'jump-b'})).toEqual([]);
  });
  it('D: a conflicting entry jumpId cannot widen the owning book scope',()=>{
    const campaign=bookCampaign('jump-a','The moon is a Reaper construct.','jump-b');
    const records=knowledgeRecords(campaign);
    expect(records[0].jump).toBe('jump-a');
    expect(eligibleRecords(records,{jump:'jump-a'}).map(r=>r.sourceId)).toEqual(['e1']);
    expect(eligibleRecords(records,{jump:'jump-b'})).toEqual([]);
  });
  it('E: migrates legacy worldbooks missing book-level jumpId deterministically',()=>{
    expect(legacyCampaign(['jump-old','jump-old']).jumpId).toBe('jump-old');
    expect(legacyCampaign(['','']).jumpId).toBe('scene-jump');
    expect(legacyCampaign([undefined,undefined]).jumpId).toBe('scene-jump');
    expect(legacyCampaign(['jump-old','jump-new']).jumpId).toBe('scene-jump');
  });
  it("F: reassigning a worldbook to another Jump leaves stored vectors valid — the fingerprint covers exactly the embedding inputs (ID + projection), so scope changes don't force rebuilds",()=>{
    const {campaign}=aiFixture();
    campaign.worldbooks=[WorldbookSchema.parse({id:'b',title:'Book',jumpId:'jump-a',entries:[{id:'e',title:'T',text:'X'}]})];
    const before=indexFingerprint(knowledgeRecords(campaign));
    campaign.worldbooks[0].jumpId='jump-b';
    expect(indexFingerprint(knowledgeRecords(campaign))).toBe(before);
  });
  it('H: native import preserves an explicit jumpId and scopes legacy native JSON to the caller Jump',()=>{
    const withJump={id:'n',title:'Native',jumpId:'explicit-jump',entries:[{id:'e',title:'T',text:'X'}]};
    expect(importWorldbook(JSON.stringify(withJump),'n.json','ignored',{currentJumpId:'jump-a'}).jumpId).toBe('explicit-jump');
    const legacy={id:'n',title:'Native',entries:[{id:'e',title:'T',text:'X'}]};
    expect(importWorldbook(JSON.stringify(legacy),'n.json','ignored',{currentJumpId:'jump-a'}).jumpId).toBe('jump-a');
  });
});
describe('worldbook scope validation against the tracker branch',()=>{
  function validBundle(){const {bundle,campaign}=aiFixture();return {bundle,campaign};}
  it('A: accepts worldbooks scoped to a Jump that exists in the campaign branch',()=>{
    const {bundle,campaign}=validBundle();
    campaign.worldbooks=[WorldbookSchema.parse({id:'w',title:'Canon lore',jumpId:bundle.jumps[0].id,entries:[{id:'e',title:'T',text:'X'}]})];
    expect(()=>validateWorldbookScopes(campaign,bundle)).not.toThrow();
  });
  it('B: fails clearly for a worldbook scoped to an unknown Jump, naming the book and the bad ID',()=>{
    const {bundle,campaign}=validBundle();
    campaign.worldbooks=[WorldbookSchema.parse({id:'w',title:'Fate Lore',jumpId:'banana',entries:[{id:'e',title:'T',text:'X'}]})];
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/Fate Lore/);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/banana/);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/unknown Jump ID/);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/campaign branch/);
  });
  it('C: rejects a Jump that exists in the tracker but belongs to a different branch',()=>{
    const {bundle,campaign}=validBundle();
    const otherBranch={...bundle.branches.find(b=>b.id===campaign.branchId)!,id:'other-branch'};
    const otherJump={...bundle.jumps[0],id:'other-jump',branchId:'other-branch'};
    bundle.branches=[...bundle.branches,otherBranch];bundle.jumps=[...bundle.jumps,otherJump];
    campaign.worldbooks=[WorldbookSchema.parse({id:'w',title:'Cross-branch lore',jumpId:'other-jump',entries:[{id:'e',title:'T',text:'X'}]})];
    expect(bundle.jumps.some(j=>j.id==='other-jump')).toBe(true);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/other-jump/);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/Cross-branch lore/);
  });
  it('D: validates disabled worldbooks too — disabled is not an excuse for broken ownership',()=>{
    const {bundle,campaign}=validBundle();
    campaign.worldbooks=[WorldbookSchema.parse({id:'w',title:'Sealed lore',jumpId:'banana',enabled:false,entries:[{id:'e',title:'T',text:'X'}]})];
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/Sealed lore/);
    expect(()=>validateWorldbookScopes(campaign,bundle)).toThrow(/banana/);
    const valid={...campaign.worldbooks[0],jumpId:bundle.jumps[0].id};
    expect(()=>validateWorldbookScopes(campaign,bundle,[valid])).not.toThrow();
  });
  it('validates an explicit worldbooks argument rather than only persisted books',()=>{
    const {bundle,campaign}=validBundle();
    const good=WorldbookSchema.parse({id:'good',title:'Good',jumpId:bundle.jumps[0].id,entries:[{id:'e',title:'T',text:'X'}]});
    const bad=WorldbookSchema.parse({id:'bad',title:'Bad lore',jumpId:'banana',entries:[{id:'e',title:'T',text:'X'}]});
    expect(()=>validateWorldbookScopes(campaign,bundle,[good])).not.toThrow();
    expect(()=>validateWorldbookScopes(campaign,bundle,[good,bad])).toThrow(/Bad lore/);
  });
});
describe('reviewed ingestion',()=>{
  it('imports markdown with separate sections and validates JSON formats',()=>{expect(importWorldbook('# Places\nHogwarts\n# People\nSnape','lore.md','book',{currentJumpId:'jump-a'}).entries).toHaveLength(2);expect(()=>importWorldbook('{broken','lore.json','book',{currentJumpId:'jump-a'})).toThrow();expect(()=>importWorldbook('','empty.txt','book',{currentJumpId:'jump-a'})).toThrow();});
  it('preserves costs, options, source bounds, and warns about ungrounded extraction',()=>{
    const section={id:'s1',title:'Perks',text:'Fly anywhere.',page:3,bounds:[{page:3,x:.1,y:.2,width:.6,height:.3}]};
    const raw={title:'Flight',entries:[{kind:'perk',title:'Flying',description:'Fly anywhere.',sectionId:'s1',costs:[{amount:100,currencyKey:'0'}],temporary:true,discounts:'Free for birds'}]};
    const doc=extractedJumpDoc(createBlankJumpDoc('chain','branch'),raw,[section]);expect(doc.purchases[0].bounds).toEqual(section.bounds);expect(doc.purchases[0].temporary).toBe(true);expect(doc.purchases[0].costs[0].amount).toBe(100);
    raw.entries[0].description='Invented immunity.';expect(validateExtraction(raw,[section]).warnings[0]).toContain('differs');raw.entries[0].sectionId='missing';expect(()=>validateExtraction(raw,[section])).toThrow(/unknown source/);
  });
});
