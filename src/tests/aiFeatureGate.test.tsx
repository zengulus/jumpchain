// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, type Server } from 'node:http';
import { LocalStore } from '../../server/store';
import { createApp } from '../../server/http';
import { createMockModel } from '../../server/mock';
import { CampaignSchema, ProviderSchema, WorldbookSchema, stableStringify, ServiceConfigSchema, type Campaign } from '../ai/schema';
import { aiFixture } from './aiFixture';

// Covers the backend-authoritative experimentalNarrativeAI gate. Low-level subsystems
// (retrieval/planner/transitions) are exercised gate-free in their own suites by design.

async function listen(server:Server){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
async function call(base:string,path:string,data:unknown){const res=await fetch(base+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:res.status,body:await res.json() as any};}

let root:string,store:LocalStore,service:ReturnType<typeof createApp>,base:string,model:ReturnType<typeof createMockModel>,modelUrl:string;
let bundle:any,campaign:Campaign;

beforeAll(async()=>{
  root=await mkdtemp(join(tmpdir(),'jumpchain-gate-test-'));
  store=new LocalStore(root);await store.init();
  model=createMockModel();modelUrl=await listen(model.server);
  // Deliberately no saveConfig here: the service must be usable with the flag absent.
  service=createApp(store);base=await listen(service.server);
  const fixture=aiFixture();bundle=fixture.bundle;campaign=fixture.campaign;
  campaign.worldbooks=[WorldbookSchema.parse({id:'wb',title:'Canon',jumpId:campaign.state.scene.stamp.jumpId,entries:[{id:'e1',title:'Hogwarts',text:'Hogwarts castle lore.'}]})];
});

afterAll(async()=>{if(service)await close(service.server);if(model)await close(model.server);if(store)await store.close();if(root)await rm(root,{recursive:true,force:true});});

describe('experimentalNarrativeAI gate',()=>{
  it('defaults to disabled: absent flag on fresh and legacy-shaped configs parses to false',()=>{
    expect(ServiceConfigSchema.parse({providers:{narrator:ProviderSchema.parse({})}}).experimentalNarrativeAI).toBe(false);
    expect(ServiceConfigSchema.parse({schemaVersion:1,providers:{narrator:ProviderSchema.parse({})}}).experimentalNarrativeAI).toBe(false);
  });

  it('rejects experimental service operations while off, before any model or index work',async()=>{
    await store.save(structuredClone(campaign));
    const before=model.requests.length;
    // Campaign namespace, worldbook write, memory diagnostics, extract, model discovery.
    expect((await call(base,`/campaigns/${campaign.id}/turn`,{bundle,revision:0,action:'Enter Hogwarts'})).body.error).toMatch(/Experimental narrative AI is disabled/);
    expect((await call(base,`/campaigns/${campaign.id}/worldbooks`,{bundle,revision:0,worldbooks:campaign.worldbooks})).body.error).toMatch(/Experimental narrative AI is disabled/);
    expect((await call(base,`/campaigns/${campaign.id}/query`,{query:'Hogwarts'})).body.error).toMatch(/Experimental narrative AI is disabled/);
    expect((await call(base,'/extract',{sections:[{id:'s',title:'Perks',text:'Fly freely.',page:1,bounds:[{page:1,x:0,y:0,width:1,height:1}]}]})).body.error).toMatch(/Experimental narrative AI is disabled/);
    expect((await call(base,'/models',{role:'narrator'})).body.error).toMatch(/Experimental narrative AI is disabled/);
    expect(model.requests).toHaveLength(before);
  });

  it('keeps health and service config reachable while off, with the flag reported',async()=>{
    const health=await fetch(base+'/api/v1/health');expect(health.ok).toBe(true);
    const config=await fetch(base+'/api/v1/config');const body=await config.json();
    expect(body.experimentalNarrativeAI).toBe(false);
    const updated=await call(base,'/config',{schemaVersion:1,experimentalNarrativeAI:true,providers:{narrator:ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'})}});
    expect(updated.status).toBe(200);
  });

  it('enabling the flag restores the existing behavior: model call, narration, persisted turn',async()=>{
    const gm=new (await import('../../server/gm')).GMService(store);
    const before=model.requests.length;
    await gm.generate(campaign.id,bundle,'Enter Hogwarts',0,()=>{});
    expect(model.requests.length).toBeGreaterThan(before);
    const saved=await store.get(campaign.id);
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0].status).toBe('complete');
    expect(saved.turns[0].narrative).toContain('Hogwarts');
  });

  it('preserves worldbook and AI campaign state across OFF -> save -> load -> OFF -> ON',async()=>{
    const saved=await store.get(campaign.id);
    const rawBefore=await readFile(store.path(campaign.id),'utf8');
    await store.saveConfig({schemaVersion:1,experimentalNarrativeAI:false,providers:{narrator:ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'})}});
    // Reload from disk while off (fresh service reads), then re-enable.
    const reloaded=JSON.parse(await readFile(store.path(campaign.id),'utf8'));
    expect(reloaded.worldbooks).toHaveLength(1);
    expect(reloaded.turns).toHaveLength(1);
    expect(rawBefore).toContain('Hogwarts');
    await store.saveConfig({schemaVersion:1,experimentalNarrativeAI:true,providers:{narrator:ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'})}});
    const after=await store.get(campaign.id);
    expect(after.worldbooks).toHaveLength(1);
    expect(after.turns).toHaveLength(1);
    expect(stableStringify(after.worldbooks)).toBe(stableStringify(saved.worldbooks));
  });

  it('exported/imported campaign JSON keeps experimental subsystem data regardless of gate state',async()=>{
    // Export is the tracker save flow; the gate must never strip worldbooks/AI data.
    await store.saveConfig({schemaVersion:1,experimentalNarrativeAI:false,providers:{narrator:ProviderSchema.parse({baseUrl:modelUrl+'/v1',model:'mock-gm'})}});
    const exported=JSON.parse(await readFile(store.path(campaign.id),'utf8'));
    expect(exported.worldbooks).toHaveLength(1);
    expect(exported.turns.length).toBeGreaterThan(0);
    // Import (POST /api/v1/import) is the documented restore path and remains available
    // with the gate off: it preserves the user's experimental data without activating AI.
    const importPayload={...exported,id:'imported-gate',revision:0};
    const result=await call(base,'/import',importPayload);
    expect(result.status).toBe(201);
    const imported=await store.get(result.body.id);
    // Import mints a new campaign identity and records the file's original id as parent.
    expect(imported.id).not.toBe('imported-gate');
    expect(imported.parentCampaignId).toBe('imported-gate');
    expect(imported.worldbooks).toHaveLength(1);
    expect(imported.turns.length).toBeGreaterThan(0);
  });
});
