// @vitest-environment node
import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { LocalStore } from '../../server/store';
import { createApp } from '../../server/http';
import { createMockModel } from '../../server/mock';
import { openAICompatible,parseModelJson,sseData } from '../../server/provider';
import { CampaignSchema, ProviderSchema, WorldbookSchema, stableStringify, type Campaign } from '../ai/schema';
import { aiFixture } from './aiFixture';

async function listen(server:Server){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
let root:string,store:LocalStore,service:ReturnType<typeof createApp>,base:string,model:ReturnType<typeof createMockModel>,modelUrl:string;
async function post(path:string,data:unknown){const res=await fetch(base+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:res.status,body:await res.json()};}
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'jumpchain-ai-test-'));store=new LocalStore(root);await store.init();model=createMockModel();modelUrl=await listen(model.server);await store.saveConfig({providers:{narrator:ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'})}});service=createApp(store);base=await listen(service.server);});
afterAll(async()=>{if(service)await close(service.server);if(model)await close(model.server);if(store)await store.close();if(root)await rm(root,{recursive:true,force:true});});
describe('local API and mock model orchestration',()=>{
  it('streams narrative, separately validates proposals, rejects stale sheet changes, applies and rolls back',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='vertical';await store.save(campaign);const original=stableStringify(bundle);
    const res=await fetch(`${base}/api/v1/campaigns/vertical/turn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle,revision:0,action:'Enter Hogwarts'})});
    const events=(await res.text()).trim().split('\n').map(l=>JSON.parse(l));expect(events.some(e=>e.type==='token')).toBe(true);expect(events[0].type).toBe('context');expect(events.at(-1).type).toBe('done');
    let saved=await store.get('vertical');expect(saved.turns[0].status).toBe('complete');expect(saved.turns[0].proposalStatus).toBe('pending');expect(saved.state.scene.location).toBe('Hogwarts');expect(saved.turns[0].extractionContext).toHaveLength(2);
    const stale=structuredClone(bundle);stale.jumpers[0].name='Changed';
    expect((await post('/campaigns/vertical/review',{bundle:stale,revision:saved.revision,turnId:saved.turns[0].id,accept:true})).body.error).toMatch(/Tracker changed/);
    const accepted=await post('/campaigns/vertical/review',{bundle,revision:saved.revision,turnId:saved.turns[0].id,accept:true});expect(accepted.status).toBe(200);saved=accepted.body;expect(saved.state.scene.location).toBe('Great Hall');
    expect((await post('/campaigns/vertical/review',{bundle,revision:saved.revision,turnId:saved.turns[0].id,accept:true})).body.error).toMatch(/No pending proposal/);
    const rolled=await post('/campaigns/vertical/rollback',{revision:saved.revision});expect(rolled.body.state.scene.location).toBe('Hogwarts');expect(rolled.body.turns[0].inContinuity).toBe(false);expect(stableStringify(bundle)).toBe(original);
  });
  it('saves narrative when extraction JSON is malformed and supports a later analysis retry',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='malformed';await store.save(campaign);model.setMode('malformed');
    const res=await fetch(`${base}/api/v1/campaigns/malformed/turn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle,revision:0,action:'Enter'})});await res.text();
    let saved=await store.get('malformed');expect(saved.turns[0].status).toBe('complete');expect(saved.turns[0].proposal).toBeNull();expect(saved.turns[0].error).toMatch(/malformed/);expect(saved.state).toEqual(campaign.state);
    model.setMode('normal');const retried=await post('/campaigns/malformed/analyze',{bundle,revision:saved.revision,turnId:saved.turns[0].id});expect(retried.body.turns[0].proposalStatus).toBe('pending');
  });
  it('regenerates into an isolated branch before the chosen turn and preserves its parent',async()=>{
    const parent=await store.get('vertical');const res=await post('/campaigns/vertical/fork',{revision:parent.revision,turnId:parent.turns[0].id,title:'Alternate'});expect(res.status).toBe(201);expect(res.body.turns).toHaveLength(0);expect(res.body.state).toEqual(parent.turns[0].before);expect((await store.get('vertical')).turns).toHaveLength(1);
  });
  it('rebuilds and deletes disposable indexes without deleting world knowledge',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='index';campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Hogwarts',jumpId:campaign.state.scene.stamp.jumpId,entries:[{id:'entry',title:'Hogwarts',text:'Hogwarts castle has moving stairs.'}]})];await store.save(campaign);
    const config=await store.config();config.providers.embeddings=ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-embedding'});await store.saveConfig(config);
    expect((await post('/campaigns/index/rebuild-index',{bundle})).body.count).toBe(1);expect((await store.index('index'))?.vectors).toBeDefined();
    const query=await post('/campaigns/index/query',{query:'Hogwarts'});expect(query.body.results[0].reason).toContain('dense');
    await post('/campaigns/index/delete-index',{});expect(await store.index('index')).toBeUndefined();expect((await store.get('index')).worldbooks).toHaveLength(1);
    expect((await post('/campaigns/index/query',{query:'Hogwarts'})).body.diagnostics[0]).toMatch(/Index stale or absent/);
    delete config.providers.embeddings;await store.saveConfig(config);
  });
  it('E: rejects saving worldbooks whose Jump scope is outside the campaign branch, leaving persisted books untouched',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='wb-save';await store.save(campaign);
    const bad=WorldbookSchema.parse({id:'bad-book',title:'Fate Lore',jumpId:'banana',entries:[{id:'e',title:'T',text:'X'}]});
    const result=await post('/campaigns/wb-save/worldbooks',{bundle,revision:0,worldbooks:[...campaign.worldbooks,bad]});
    expect(result.body.error).toMatch(/Fate Lore/);expect(result.body.error).toMatch(/banana/);
    expect((await store.get('wb-save')).worldbooks).toEqual(campaign.worldbooks);
  });
  it('F: generation fails before narration when a persisted worldbook has an invalid Jump scope',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='stale-scope';
    campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Fate Lore',jumpId:'banana',entries:[{id:'e',title:'T',text:'X'}]})];await store.save(campaign);
    const res=await fetch(`${base}/api/v1/campaigns/stale-scope/turn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle,revision:0,action:'Enter the hall'})});
    const events=(await res.text()).trim().split('\n').map(l=>JSON.parse(l));
    const error=events.find(e=>e.type==='error')?.error ?? '';
    expect(error).toMatch(/Fate Lore/);expect(error).toMatch(/banana/);expect(error).toMatch(/campaign branch/);
    expect(events.some(e=>e.type==='token')).toBe(false);expect(events.some(e=>e.type==='done')).toBe(false);
  });
  it('G: rejects embedding rebuilds when worldbook ownership cannot be validated, before embedding work',async()=>{
    const {bundle,campaign}=aiFixture();campaign.id='bad-index';
    campaign.worldbooks=[WorldbookSchema.parse({id:'book',title:'Fate Lore',jumpId:'banana',entries:[{id:'e',title:'T',text:'X'}]})];await store.save(campaign);
    // No embeddings model is assigned; the scope error must surface instead of an embeddings error.
    const result=await post('/campaigns/bad-index/rebuild-index',{bundle});
    expect(result.body.error).toMatch(/Fate Lore/);expect(result.body.error).toMatch(/banana/);
    expect(await store.index('bad-index')).toBeUndefined();
  });
  it('rejects stale revisions and hostile browser origins/Host headers',async()=>{
    const c=await store.get('vertical');expect((await post('/campaigns/vertical/settings',{revision:-1,settings:c.settings})).body.error).toMatch(/another window/);
    const origin=await fetch(base+'/api/v1/config',{headers:{Origin:'https://malicious.example'}});expect(origin.status).toBe(403);
    const host=await fetch(base+'/api/v1/health',{headers:{Host:'malicious.example'}});expect(host.status).toBe(403);
  });
  it('reports missing/unreachable endpoints and truncated streams without mutations',async()=>{
    const unavailable=ProviderSchema.parse({baseUrl:'http://127.0.0.1:1/v1',model:'missing',timeoutMs:1000});await expect(openAICompatible.models(unavailable)).rejects.toThrow(/unreachable/);
    model.setMode('truncated');await expect(openAICompatible.generate(ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'}),[{role:'user',content:'hello'}],()=>{})).rejects.toThrow(/prematurely/);model.setMode('normal');
    expect(()=>parseModelJson('not JSON')).toThrow(/malformed/);
  });
  it('supports non-streaming endpoints, role model discovery, timeouts, and cancellation',async()=>{
    const config=ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm',streaming:false});expect(await openAICompatible.models(config)).toContain('mock-gm');expect(await openAICompatible.generate(config,[{role:'user',content:'hello'}],()=>{})).toContain('Hogwarts');
    model.setMode('slow');await expect(openAICompatible.generate({...config,timeoutMs:1000},[{role:'user',content:'hello'}],()=>{})).rejects.toThrow(/timed out/);
    const controller=new AbortController();controller.abort();await expect(openAICompatible.models(config,controller.signal)).rejects.toThrow(/cancelled/);model.setMode('normal');
  });
  it('recovers interrupted saves on service restart and preserves earlier generations',async()=>{
    const c=await store.get('vertical');c.id='interrupted';c.turns[0].status='generating';await store.save(c);await store.close();await store.init();expect((await store.get('interrupted')).turns[0].status).toBe('failed');expect((await store.get('vertical')).turns[0].narrative).toContain('Hogwarts');
  });
  it('imports a validated campaign under a new ID, keeping caches and keys out of the save',async()=>{
    const c=await store.get('vertical');const imported=await post('/import',c);expect(imported.body.id).not.toBe(c.id);expect(imported.body.state).toEqual(c.state);expect(Object.keys(imported.body)).not.toContain('vectors');expect(Object.keys(imported.body)).not.toContain('providers');
    expect((await post('/import',{...c,schemaVersion:999})).status).toBe(400);
  });
  it('rejects malformed PDF sections and returns reviewed structured extraction with exact sent context',async()=>{
    expect((await post('/extract',{sections:[{text:'bad'}]})).status).toBe(400);
    const result=await post('/extract',{sections:[{id:'s',title:'Perks',text:'Fly freely.',page:1,bounds:[{page:1,x:0,y:0,width:1,height:1}]}]});expect(result.status).toBe(200);expect(result.body.draft.entries[0].sectionId).toBe('s');expect(result.body.context).toHaveLength(2);
  });
});
