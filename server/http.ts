import { planMessages } from '../src/ai/planner';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NativeChainBundleSchema } from '../src/schemas/save';
import { CampaignSchema, SettingsSchema, ServiceConfigSchema, ProviderSchema, RoleSchema, SceneSchema, StateSchema, CampaignOperationSchema, WorldbookSchema, SummarySchema, migrateCampaign, stableStringify, type Campaign } from '../src/ai/schema';
import { commitTransition, reviewProposal, assertTurnCurrent, rollbackLatest, validateState, validateWorldbookScopes } from '../src/ai/state';
import { planTransition, playerEditOperations } from '../src/ai/transitions';
import { PdfSectionSchema, extractionInstructions, validateExtraction } from '../src/ai/documents';
import { LocalStore } from './store';
import { GMService } from './gm';
import { openAICompatible, parseModelJson } from './provider';

const BodySchema = z.object({bundle:NativeChainBundleSchema,revision:z.number().int()});
const id = () => randomUUID();
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Requests must use application/json.');
  const pieces: Buffer[] = []; let size = 0;
  for await (const piece of req) { size += piece.length; if (size > 100*1024*1024) throw new Error('Request exceeds 100 MB. Split large source imports.'); pieces.push(piece); }
  return JSON.parse(Buffer.concat(pieces).toString('utf8') || '{}');
}
function json(res: ServerResponse, data: unknown, status = 200) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function revision(c: Campaign, expected: number) { if (c.revision !== expected) throw new Error('Campaign changed in another window. Reload to avoid overwriting it.'); }
export function createApp(store: LocalStore, options: {port?:number; staticDir?:string; allowedOrigins?:string[]} = {}) {
  const gm = new GMService(store);
  // Single backend-authoritative feature gate for the experimental narrative-AI cluster
  // (campaign AI GM turns/analysis/summaries, worldbooks, retrieval diagnostics, indexing).
  // One check at the API boundary: internal pure subsystems (retrieval, planner, transitions,
  // schema utilities) stay gate-free so they remain individually testable with the feature
  // off. Every model/index request must pass through here, so nothing experimental can run
  // because a hidden button was reached or a request was hand-crafted.
  const assertNarrativeAiEnabled = async () => {
    if (!(await store.config()).experimentalNarrativeAI) throw new Error('Experimental narrative AI is disabled in the service configuration.');
  };
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    let url: URL;
    try {
      const host = req.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) { json(res,{error:'Local Host header required.'},403); return; }
      url = new URL(req.url ?? '/',`http://${host}`);
      const origin = req.headers.origin;
      const allowed = new Set([`http://${host}`,'http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173',...(options.allowedOrigins ?? [])]);
      if (origin && !allowed.has(origin)) { json(res,{error:'Origin not allowed. Run the app from the local launcher.'},403); return; }
      if (origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if (req.method === 'OPTIONS') { res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}); res.end(); return; }
      if (req.method === 'GET' && url.pathname === '/api/v1/health') { json(res,{ok:true,apiVersion:1,service:'Jumpchain AI',running:[...gm.running.keys()]}); return; }
      if (req.method === 'GET' && url.pathname === '/api/v1/config') {
        const config = await store.config();
        // Keys stay in the local service config; a blank/redacted field preserves the saved key on update.
        json(res,{...config,providers:Object.fromEntries(Object.entries(config.providers).map(([role,p]) => [role,{...p,apiKey:p?.apiKey ? '••••••••' : ''}]))}); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/config') {
        const next = ServiceConfigSchema.parse(await body(req)); const old = await store.config();
        for (const role of RoleSchema.options) if (next.providers[role]?.apiKey === '••••••••') next.providers[role]!.apiKey = old.providers[role]?.apiKey ?? '';
        await store.saveConfig(next); json(res,{ok:true}); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/models') {
        // Model discovery is an AI-service operation; keep it behind the same gate.
        await assertNarrativeAiEnabled();
        const input = z.object({role:RoleSchema}).parse(await body(req)); const config = await store.config();
        const provider = config.providers[input.role] ?? config.providers.narrator;
        const models = await openAICompatible.models(provider); json(res,{models,selectedAvailable:models.includes(provider.model)}); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/campaigns') {
        const campaigns = await store.list(); json(res,campaigns.filter(c => (!url.searchParams.get('chainId') || c.chainId === url.searchParams.get('chainId')) && (!url.searchParams.get('branchId') || c.branchId === url.searchParams.get('branchId'))).map(c => ({id:c.id,title:c.title,revision:c.revision,updatedAt:c.updatedAt,scene:c.state.scene,parentCampaignId:c.parentCampaignId}))); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/campaigns') {
        const input = z.object({bundle:NativeChainBundleSchema,title:z.string().min(1),jumpId:z.string()}).parse(await body(req));
        const now = new Date().toISOString();
        const c = CampaignSchema.parse({schemaVersion:1,id:id(),title:input.title,chainId:input.bundle.chain.id,branchId:input.bundle.chain.activeBranchId,revision:0,createdAt:now,updatedAt:now,settings:SettingsSchema.parse({}),state:{scene:SceneSchema.parse({stamp:{jumpId:input.jumpId,elapsedMinutes:0}})}});
        validateState(c.state,input.bundle,c);
        await store.save(c); json(res,c,201); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/import') {
        // migrateCampaign keeps imported legacy saves (worldbooks without book-level Jump
        // ownership) parseable by scoping them deterministically.
        const raw = migrateCampaign(await body(req)); validateState(raw.state);
        const c = {...raw,id:id(),parentCampaignId:raw.id,revision:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        for (const t of c.turns) if (t.status === 'generating') {t.status='failed';t.error='Imported interrupted generation.';}
        // Imported contexts remain historical; proposals must be regenerated against the restored sheet.
        for (const t of c.turns) if (t.proposalStatus === 'pending') t.proposalStatus='rejected';
        await store.save(c); json(res,c,201); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/extract') {
        // Model-backed source extraction is experimental narrative-AI functionality.
        await assertNarrativeAiEnabled();
        const input = z.object({sections:z.array(PdfSectionSchema).min(1).max(20)}).parse(await body(req));
        const config = await store.config(); const provider = config.providers.extraction ?? config.providers.narrator;
        const messages = [{role:'system' as const,content:extractionInstructions},{role:'user' as const,content:stableStringify(input.sections)}];
        planMessages(messages,provider);
        const raw = await openAICompatible.generate(provider,messages,() => {},undefined,true);
        json(res,{draft:validateExtraction(parseModelJson(raw),input.sections),context:messages}); return;
      }
      const match = url.pathname.match(/^\/api\/v1\/campaigns\/([\w-]+)(?:\/([\w-]+))?$/);
      if (match) {
        const [,campaignId,operation] = match;
        // Every campaign-scoped route serves the experimental AI-campaign subsystem
        // (campaigns, turns, worldbooks, memory queries, indexing, analysis, rollback).
        // Gate the whole namespace once, before any body parsing or GM work.
        await assertNarrativeAiEnabled();
        if (req.method === 'GET' && !operation) {json(res,await store.get(campaignId));return;}
        if (req.method !== 'POST') {json(res,{error:'Method not allowed'},405);return;}
        const raw = await body(req);
        if (operation === 'cancel') {gm.running.get(campaignId)?.abort();json(res,{ok:true});return;}
        if (operation === 'turn') {
          const input = BodySchema.extend({action:z.string().trim().min(1).max(100000)}).parse(raw);
          await gm.exclusive(campaignId,async signal => {
            const controller = new AbortController(); const disconnect = () => {if (!res.writableEnded) controller.abort();}; res.on('close',disconnect);
            res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});
            const emit = (event: unknown) => {if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);};
            try {await gm.generate(campaignId,input.bundle,input.action,input.revision,emit,AbortSignal.any([signal,controller.signal]));}
            catch (e) {emit({type:'error',error:(e as Error).message});}
            finally {res.off('close',disconnect);res.end();}
          });return;
        }
        if (operation === 'query') {
          const input = z.object({query:z.string(),filter:z.object({setting:z.string().optional(),jump:z.string().optional(),sourceType:z.enum(['world','memory','summary']).optional(),entity:z.string().optional(),character:z.string().optional(),location:z.string().optional(),owner:z.string().optional(),before:z.number().optional(),authority:z.enum(['authoritative','canonical-source','campaign-established','player-established','inferred','speculative']).optional(),tags:z.array(z.string()).optional()}).optional()}).parse(raw);
          json(res,await gm.retrieve(await store.get(campaignId),input.query,input.filter));return;
        }
        await gm.exclusive(campaignId,async signal => {
          const c = await store.get(campaignId);
          if (operation === 'rebuild-index') {
            const input = z.object({bundle:NativeChainBundleSchema}).parse(raw);
            json(res,await gm.rebuild(c,input.bundle,signal));return;
          }
          if (operation === 'delete-index') {await store.deleteIndex(campaignId);json(res,{ok:true});return;}
          if (operation === 'fork') {
            const input = z.object({revision:z.number().int(),turnId:z.string().optional(),title:z.string().min(1)}).parse(raw); revision(c,input.revision);
            const pos = input.turnId ? c.turns.findIndex(t => t.id === input.turnId) : c.turns.length;
            if (pos < 0) throw new Error('Turn not found.');
            const fork = structuredClone(c);fork.id=id();fork.title=input.title;fork.parentCampaignId=c.id;fork.revision=0;
            fork.createdAt=fork.updatedAt=new Date().toISOString();
            if (pos < c.turns.length) {fork.state=structuredClone(c.turns[pos].before);fork.turns=fork.turns.slice(0,pos);fork.audit=[];}
            for (const t of fork.turns) if (t.proposalStatus==='pending') {t.proposalStatus='rejected';t.error='Proposal belongs to the parent campaign. Retry state analysis in this branch.';}
            await store.save(fork);json(res,fork,201);return;
          }
          if (operation === 'analyze') {
            const input = BodySchema.extend({turnId:z.string()}).parse(raw);revision(c,input.revision);
            const turn = c.turns.find(t => t.id === input.turnId);
            if (!turn) throw new Error('Turn not found.');
            assertTurnCurrent(c,input.bundle,turn);
            try {turn.proposal=await gm.analyze(c,input.bundle,turn,signal);turn.proposalStatus='pending';turn.error='';}
            catch(e) {turn.error=(e as Error).message;turn.proposal=null;turn.proposalStatus='none';delete turn.transitionPlan;}
            await store.transaction(campaignId,latest => {latest.turns[latest.turns.findIndex(t => t.id === turn.id)]=turn;});json(res,await store.get(campaignId));return;
          }
          if (operation === 'summarize') {
            const input = z.object({revision:z.number().int(),level:SummarySchema.shape.level,eventIds:z.array(z.string()),title:z.string().min(1)}).parse(raw);revision(c,input.revision);
            const summary = await gm.summarize(c,input.level,input.eventIds,input.title,signal);
            await store.transaction(campaignId,latest => {revision(latest,input.revision);const context={origin:'generated-summary' as const,campaign:latest};const plan=planTransition(latest.state,[{kind:'summary.create',handle:'summary',value:summary}],context,id());commitTransition(latest,plan,context,`Summarize ${input.level}`,new Date().toISOString());});json(res,await store.get(campaignId));return;
          }
          await store.transaction(campaignId,latest => {
            const input = z.object({revision:z.number().int()}).passthrough().parse(raw);revision(latest,input.revision);
            if (operation === 'settings') latest.settings=SettingsSchema.parse(input.settings);
            else if (operation === 'worldbooks') {
              // Worldbook ownership is checked against the supplied tracker bundle before saving:
              // a book scoped to a Jump outside this campaign branch must fail explicitly rather
              // than silently becoming invisible lore. The whole update is rejected on failure.
              const parsed = BodySchema.extend({worldbooks:z.array(WorldbookSchema)}).parse(raw);
              validateWorldbookScopes(latest, parsed.bundle, parsed.worldbooks);
              latest.worldbooks = parsed.worldbooks;
            }
            else if (operation === 'state') {
              const parsed=z.union([BodySchema.extend({state:StateSchema}).strict(),BodySchema.extend({operations:z.array(CampaignOperationSchema)}).strict()]).parse(raw);
              const operations='state' in parsed ? playerEditOperations(latest.state,parsed.state) : parsed.operations;
              const context={origin:'player-edit' as const,campaign:latest,bundle:parsed.bundle};
              const plan=planTransition(latest.state,operations,context,id());
              commitTransition(latest,plan,context,'Player edited campaign state',new Date().toISOString());
              for (const t of latest.turns) if (t.proposalStatus === 'pending') t.proposalStatus='rejected';
            } else if (operation === 'review') {
              const parsed=BodySchema.extend({turnId:z.string(),accept:z.boolean()}).parse(raw);
              reviewProposal(latest,parsed.bundle,parsed.turnId,parsed.accept,new Date().toISOString());
            } else if (operation === 'rollback') rollbackLatest(latest);
            else throw new Error('Unknown campaign operation.');
          });json(res,await store.get(campaignId));
        });return;
      }
      if (req.method === 'GET' && options.staticDir && !url.pathname.startsWith('/api/')) {
        const root=resolve(options.staticDir); const path=resolve(root,`.${decodeURIComponent(url.pathname === '/' ? '/index.html':url.pathname)}`);
        if (!path.startsWith(root+sep)) {json(res,{error:'Invalid path'},400);return;}
        const data=await readFile(path); const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.mjs':'text/javascript','.woff2':'font/woff2'};
        res.writeHead(200,{'Content-Type':mime[extname(path)] ?? 'application/octet-stream'});res.end(data);return;
      }
      json(res,{error:'Not found'},404);
    } catch (e) {
      if (res.headersSent) {res.end();return;}
      const error=e as Error & {code?:string};
      json(res,{error:error.code === 'ENOENT' ? 'Campaign or file not found.' : error.message},error.code === 'ENOENT' ? 404 : 400);
    }
  });
  server.requestTimeout=1800000;
  return {server,gm};
}
