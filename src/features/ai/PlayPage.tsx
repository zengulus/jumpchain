import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAiEnabled, useAiEnabled } from '../../app/operatingMode';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { getChainBundle, exportNativeSave, importNativeSave } from '../../db/persistence';
import { StateSchema, FactSchema, CampaignSchema, type Campaign, type CompiledContext, type Turn } from '../../ai/schema';
import { remapCampaign, validateBackup } from '../../ai/backup';
import { mechanicalRecords } from '../../ai/context';
import { downloadJson } from '../../utils/download';
import { api, streamTurn } from './client';
import { SetupPanel } from './SetupPanel';
import { JsonReview, NpcEditor, SceneEditor, SettingsPanel } from './editors';
import './ai.css';
const KnowledgePanel=lazy(()=>import('./KnowledgePanel').then(m=>({default:m.KnowledgePanel})));
type CampaignList=Array<Pick<Campaign,'id'|'title'|'revision'|'updatedAt'>>;
export function PlayPage() {
  const enabled=useAiEnabled();
  return <div className="ai-workspace stack"><header className="ai-heading"><div><p className="eyebrow">Jumpchain campaign</p><h1>{enabled?'AI GM':'Sheet Only'}</h1></div><button onClick={()=>setAiEnabled(!enabled)}>{enabled?'Switch to Sheet Only':'Enable AI GM'}</button></header>
    {enabled?<EnabledPlay/>:<section className="ai-panel stack"><h2>Your tracker is ready</h2><p>Sheet Only uses the existing tracker and saves. You can manage your entire chain without a model, AI service, or search index.</p><p>Enable AI GM to add campaign play, world knowledge, and persistent memory. Switching modes preserves your chain and campaigns.</p></section>}
  </div>;
}
function ContextInspector({context,extraction}:{context:CompiledContext|null;extraction?:Turn['extractionContext']}) {
  if(!context)return null;
  return <details className="ai-inspector"><summary>Injected context · {context.estimatedTokens.toLocaleString()} / {context.inputBudget.toLocaleString()} conservative tokens</summary>
    {context.diagnostics.map((d,i)=><p key={i}>{d}</p>)}
    {context.layers.map((layer,i)=><details key={i}><summary>{layer.name} · {layer.estimatedTokens} tokens · {layer.sourceIds.length} sources</summary><pre>{layer.content}</pre></details>)}
    <details><summary>Exact narrator messages sent to model</summary><pre>{JSON.stringify(context.messages,null,2)}</pre></details>
    <details><summary>Omitted record IDs</summary><pre>{context.omittedIds.join('\n')}</pre></details>
    {!!extraction?.length&&<details><summary>Exact state extraction messages</summary><pre>{JSON.stringify(extraction,null,2)}</pre></details>}
    <button onClick={()=>downloadJson('jumpchain-injected-context.json',{context,extraction})}>Export context</button>
  </details>;
}
function EnabledPlay() {
  const {bundle,workspace}=useChainWorkspace();const navigate=useNavigate();
  const [tab,setTab]=useState('play');const [campaigns,setCampaigns]=useState<CampaignList>([]);const [campaign,setCampaign]=useState<Campaign|null>(null);
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [action,setAction]=useState('');
  const [partial,setPartial]=useState('');const [phase,setPhase]=useState('');const [context,setContext]=useState<CompiledContext|null>(null);
  const [query,setQuery]=useState('');const [before,setBefore]=useState('');const [searchResult,setSearchResult]=useState<unknown>(null);const [factText,setFactText]=useState('');const [factKey,setFactKey]=useState('');
  const [eventIds,setEventIds]=useState<string[]>([]);const [level,setLevel]=useState<'scene'|'chapter'|'arc'|'jump'|'chain'>('scene');
  const controller=useRef<AbortController|null>(null);const mounted=useRef(true);
  const storageKey=`jumpchain.ai.campaign.${bundle.chain.id}.${workspace.activeBranch?.id}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  async function refreshList() {const rows=await api<CampaignList>(`/campaigns?chainId=${encodeURIComponent(bundle.chain.id)}&branchId=${encodeURIComponent(workspace.activeBranch?.id??'')}`);if(mounted.current)setCampaigns(rows);return rows;}
  useEffect(()=>{const abort=new AbortController();setCampaign(null);setNotice('');void api<CampaignList>(`/campaigns?chainId=${encodeURIComponent(bundle.chain.id)}&branchId=${encodeURIComponent(workspace.activeBranch?.id??'')}`,undefined,abort.signal).then(async rows=>{if(abort.signal.aborted)return;setCampaigns(rows);const saved=localStorage.getItem(storageKey);const chosen=rows.find(c=>c.id===saved)??rows[0];if(chosen){const c=await api<Campaign>(`/campaigns/${chosen.id}`,undefined,abort.signal);if(!abort.signal.aborted)setCampaign(c);}}).catch(e=>{if(!abort.signal.aborted){setNotice((e as Error).message);setTab('setup');}});return()=>{abort.abort();controller.current?.abort();};},[storageKey]);
  async function choose(c:Campaign) {if(mounted.current){setCampaign(c);localStorage.setItem(storageKey,c.id);setContext(null);setPartial('');}await refreshList();}
  async function freshBundle() {const next=await getChainBundle(bundle.chain.id);if(!next)throw new Error('Tracker chain no longer exists.');return next;}
  async function work(fn:()=>Promise<void>) {setBusy(true);setNotice('');try{await fn();}catch(e){if(mounted.current)setNotice((e as Error).message);}finally{if(mounted.current)setBusy(false);}}
  async function operation(op:string,payload:Record<string,unknown>={}) {
    if(!campaign)throw new Error('Create or choose a campaign.');
    const result=await api<Campaign>(`/campaigns/${campaign.id}/${op}`,{revision:campaign.revision,...payload});
    if(result.id&&result.state)setCampaign(result);return result;
  }
  async function send(target=campaign,text=action) {
    if(!target||!text.trim())return;
    setBusy(true);setNotice('');setPartial('');setPhase('Compiling context…');setContext(null);
    const abort=new AbortController();controller.current=abort;
    try {
      await streamTurn(`/campaigns/${target.id}/turn`,{bundle:await freshBundle(),revision:target.revision,action:text},event=>{
        if(!mounted.current)return;
        if(event.type==='context'){setContext(event.context);setPhase('Narrating…');}
        if(event.type==='token')setPartial(previous=>previous+event.token);
        if(event.type==='phase')setPhase(event.phase);
        if(event.type==='done')setAction('');
      },abort.signal);
    }catch(e){if(mounted.current)setNotice(abort.signal.aborted?'Generation stopped. Reload to inspect the saved turn.':(e as Error).message);}
    finally {
      controller.current=null;
      if(mounted.current){try{setCampaign(await api<Campaign>(`/campaigns/${target.id}`));setPartial('');setContext(null);}catch(e){setNotice((e as Error).message);}setBusy(false);setPhase('');}
    }
  }
  async function fork(turn:Turn,regenerate:boolean) {
    if(!campaign)return;
    const c=await operation('fork',{title:`${campaign.title} · alternate`,turnId:turn.id});await choose(c);
    if(regenerate)await send(c,turn.action);else{setAction(turn.action);setNotice('Alternate campaign created before this turn. Edit the action and send; the original remains saved.');}
  }
  const currentJump=workspace.currentJump;
  const scene=campaign?.state.scene;
  let mechanics:ReturnType<typeof mechanicalRecords>=[];let mechanicsError='';
  if(campaign)try{mechanics=mechanicalRecords(bundle,campaign);}catch(e){mechanicsError=(e as Error).message;}
  return <>
    <nav className="ai-tabs" aria-label="AI campaign tools">{[['play','Play'],['scene','Scene & NPCs'],['memory','Memory & chronology'],['knowledge','Knowledge'],['settings','GM direction'],['backup','Save / load'],['setup','AI Setup']].map(([id,label])=><button aria-current={tab===id?'page':undefined} disabled={busy} key={id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {notice&&<p className="ai-notice" role="alert">{notice}</p>}
    {tab==='setup'?<SetupPanel onConnected={()=>void work(async()=>{await refreshList();})}/>:<>
      <div className="ai-actions"><label>Campaign<select value={campaign?.id??''} disabled={busy} onChange={e=>void work(async()=>choose(await api<Campaign>(`/campaigns/${e.target.value}`)))}><option value="" disabled>Select campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
      <button disabled={busy||!currentJump} onClick={()=>void work(async()=>{if(!currentJump)return;const c=await api<Campaign>('/campaigns',{bundle:await freshBundle(),title:`${bundle.chain.title} — ${currentJump.title}`,jumpId:currentJump.id});await choose(c);setTab('play');})}>New campaign in current jump</button>
      <button disabled={busy} onClick={()=>void work(async()=>{await refreshList();if(campaign)setCampaign(await api<Campaign>(`/campaigns/${campaign.id}`));})}>Reload</button>
      {campaign&&<button disabled={busy} onClick={()=>void work(async()=>choose(await operation('fork',{title:`${campaign.title} · branch`})))}>Branch campaign here</button>}</div>
      {!currentJump&&<p>Create and select a jump in the tracker to start a campaign.</p>}
      {campaign&&<>
        {tab==='play'&&<div className="ai-play-grid"><section className="ai-narrative stack"><div><h2>{campaign.title}</h2><p>{currentJump?.title} · {scene?.title} · {scene?.location||'Location not established'}</p></div>
          {!campaign.turns.length&&<div className="ai-empty"><h3>Begin your jump</h3><p>Set the scene and present companions, add relevant world knowledge, then describe what your Jumper does.</p></div>}
          {campaign.turns.map((turn,index)=><article className="ai-turn stack" key={turn.id}><header>Turn {index+1} · {turn.status}{!turn.inContinuity?' · outside current continuity':''} · {turn.proposalStatus==='accepted'?'state reviewed':turn.proposalStatus}</header><div className="ai-user-action"><strong>Your action</strong><p>{turn.action}</p></div><div className="ai-prose">{turn.narrative||'No narrative was returned.'}</div>
            {turn.error&&<p role="alert">{turn.error}</p>}
            <div className="ai-actions"><button disabled={busy} onClick={()=>void work(()=>fork(turn,true))}>{turn.status==='failed'||turn.status==='cancelled'?'Retry in alternate campaign':'Regenerate / alternate'}</button><button disabled={busy} onClick={()=>void work(()=>fork(turn,false))}>Edit action & branch</button>
            {turn.status==='complete'&&turn.proposalStatus!=='accepted'&&<button disabled={busy} onClick={()=>void work(async()=>{await operation('analyze',{turnId:turn.id,bundle:await freshBundle()});})}>Retry state analysis</button>}</div>
            {turn.proposal&&<details open={turn.proposalStatus==='pending'}><summary>Proposed changes · {turn.proposal.changes.length} · {turn.proposalStatus}</summary><p>{turn.proposal.rationale}</p><pre>{JSON.stringify(turn.proposal.changes,null,2)}</pre>
            {turn.proposalStatus==='pending'&&<div className="ai-actions"><button disabled={busy} onClick={()=>void work(async()=>{await operation('review',{turnId:turn.id,accept:true,bundle:await freshBundle()});})}>Accept reviewed changes</button><button disabled={busy} onClick={()=>void work(async()=>{await operation('review',{turnId:turn.id,accept:false,bundle:await freshBundle()});})}>Reject changes</button></div>}</details>}
            <ContextInspector context={turn.context} extraction={turn.extractionContext}/></article>)}
          {busy&&phase&&<article className="ai-turn"><p role="status">{phase}</p><div className="ai-prose" aria-live="polite">{partial}</div><ContextInspector context={context}/></article>}
          <form className="ai-compose stack" onSubmit={e=>{e.preventDefault();void send();}}><label>Your next action<textarea rows={4} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="What does your Jumper do?"/></label><div className="ai-actions"><button type="submit" disabled={busy||!action.trim()||!!mechanicsError||campaign.turns.some(t=>t.proposalStatus==='pending')}>Send action</button>{busy&&<button type="button" onClick={()=>{controller.current?.abort();void api(`/campaigns/${campaign.id}/cancel`,{}).catch(e=>setNotice(e.message));}}>Stop generation</button>}</div>{campaign.turns.some(t=>t.proposalStatus==='pending')&&<p>Review the pending state changes before continuing.</p>}</form>
        </section><aside className="ai-panel stack"><h3>Current jump</h3><p>{currentJump?.title}</p>{mechanicsError&&<p role="alert">{mechanicsError}</p>}<h3>Chronology</h3><p>Day {Math.floor((scene?.stamp.elapsedMinutes??0)/1440)+1}, {Math.floor((scene?.stamp.elapsedMinutes??0)%1440/60).toString().padStart(2,'0')}:{((scene?.stamp.elapsedMinutes??0)%60).toString().padStart(2,'0')}<br/>{scene?.stamp.absoluteDate}</p><h3>Present companions</h3>{scene?.presentCompanionIds.map(id=><p key={id}>{bundle.companions.find(c=>c.id===id)?.name??id}</p>)}<h3>NPCs</h3>{scene?.npcIds.map(id=><p key={id}>{campaign.state.npcs.find(n=>n.id===id)?.name??id}</p>)}<h3>Active drawbacks</h3>{mechanics.filter(r=>r.category==='drawback').map(r=><details key={r.id}><summary>{(r.record as {title?:string}).title??r.id}</summary><pre>{r.text}</pre></details>)}<h3>Unresolved threads</h3>{scene?.threads.map((t,i)=><p key={i}>{t}</p>)}<button disabled={busy} onClick={()=>setTab('scene')}>Edit scene</button></aside></div>}
        {tab==='scene'&&<><SceneEditor campaign={campaign} bundle={bundle} onSave={async state=>{await operation('state',{state,bundle:await freshBundle()});}}/><NpcEditor campaign={campaign} bundle={bundle} onSave={async state=>{await operation('state',{state,bundle:await freshBundle()});}}/></>}
        {tab==='settings'&&<SettingsPanel campaign={campaign} onSave={async settings=>{await operation('settings',{settings});}}/>}
        {tab==='knowledge'&&<Suspense fallback={<p>Loading knowledge tools…</p>}><KnowledgePanel campaign={campaign} bundle={bundle} onSave={async worldbooks=>{await operation('worldbooks',{worldbooks,bundle:await freshBundle()});}} onOperation={async (op,body)=>{const payload={...(body as Record<string,unknown>|undefined)??{}};if(op==='rebuild-index')payload.bundle=await freshBundle();return operation(op,payload);}}/></Suspense>}
        {tab==='memory'&&<section className="ai-panel stack"><h2>Campaign memory</h2><div className="ai-fields"><label>Search facts, sources, and historical events<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Before jump-relative minute (optional)<input type="number" value={before} onChange={e=>setBefore(e.target.value)}/></label></div><button disabled={busy} onClick={()=>void work(async()=>setSearchResult(await api(`/campaigns/${campaign.id}/query`,{query,filter:before?{before:Number(before)}:{}})))}>Search memory</button>{searchResult!==null&&<pre>{JSON.stringify(searchResult,null,2)}</pre>}
          <h3>Player-established fact</h3><label>Fact key (reuse for a conflicting claim)<input value={factKey} onChange={e=>setFactKey(e.target.value)}/></label><label>What is established?<textarea value={factText} onChange={e=>setFactText(e.target.value)}/></label><button disabled={busy} onClick={()=>void work(async()=>{const fact=FactSchema.parse({id:crypto.randomUUID(),key:factKey,text:factText,authority:'player-established',sourceIds:['player-declaration'],stamp:campaign.state.scene.stamp,location:campaign.state.scene.location});await operation('state',{state:{...campaign.state,facts:[...campaign.state.facts,fact]},bundle:await freshBundle()});setFactText('');})}>Record declaration</button>
          <h3>Historical events</h3>{[...campaign.state.events].sort((a,b)=>a.stamp.jumpId.localeCompare(b.stamp.jumpId)||a.stamp.elapsedMinutes-b.stamp.elapsedMinutes).map(event=><article key={event.id}><label><input type="checkbox" disabled={!!event.supersededBy} checked={eventIds.includes(event.id)} onChange={e=>setEventIds(e.target.checked?[...eventIds,event.id]:eventIds.filter(id=>id!==event.id))}/>{bundle.jumps.find(j=>j.id===event.stamp.jumpId)?.title??event.stamp.jumpId} · minute {event.stamp.elapsedMinutes} · {event.location} · {event.authority}{event.supersededBy?' · superseded':''}</label><p>{event.summary}</p><details><summary>Provenance and consequences</summary><pre>{JSON.stringify(event,null,2)}</pre></details></article>)}
          <div className="ai-actions"><label>Summary level<select value={level} onChange={e=>setLevel(e.target.value as typeof level)}>{['scene','chapter','arc','jump','chain'].map(l=><option key={l}>{l}</option>)}</select></label><button disabled={busy||!eventIds.length} onClick={()=>void work(async()=>{await operation('summarize',{level,eventIds,title:`${level}: ${campaign.state.scene.title}`});setEventIds([]);})}>Summarize selected events</button></div>
          {campaign.state.summaries.map(s=><details key={s.id}><summary>{s.level}: {s.title} · inferred summary · {s.eventIds.length} source events</summary><p className="ai-prose">{s.text}</p><p>{s.eventIds.join(', ')}</p></details>)}
          <details><summary>All campaign facts, NPCs, and state (advanced editor)</summary><JsonReview value={campaign.state} onSave={async raw=>{await operation('state',{state:StateSchema.parse(raw),bundle:await freshBundle()});}}/></details>
          <h3>Audit & rollback</h3><button disabled={busy||!campaign.audit.some(a=>!a.rolledBack)} onClick={()=>void work(async()=>{await operation('rollback');setNotice('Latest campaign state change rolled back. Narrative and audit history are retained.');})}>Roll back latest state change</button>{[...campaign.audit].reverse().map(a=><details key={a.id}><summary>{a.at} · {a.action}{a.rolledBack?' · rolled back':''}</summary><pre>{JSON.stringify({before:a.before,after:a.after},null,2)}</pre></details>)}
        </section>}
      </>}
      {tab==='backup'&&<section className="ai-panel stack"><h2>Complete campaign backup</h2><p>Includes the native tracker save, every campaign attached to this chain, worldbooks and embedded sources, NPCs, events, summaries, turns, and audit snapshots. Model keys and disposable indexes are excluded.</p><button disabled={busy} onClick={()=>void work(async()=>{const rows=await api<CampaignList>(`/campaigns?chainId=${encodeURIComponent(bundle.chain.id)}`);const records=await Promise.all(rows.map(c=>api<Campaign>(`/campaigns/${c.id}`)));downloadJson(`${bundle.chain.title}-campaign-backup.json`,{format:'jumpchain-campaign',schemaVersion:1,exportedAt:new Date().toISOString(),tracker:await exportNativeSave(bundle.chain.id),campaigns:records});setNotice('Complete backup downloaded.');})}>Export chain and all its campaigns</button>
        <label>Restore backup as a new chain<input disabled={busy} type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];if(file)void work(async()=>{const backup=validateBackup(JSON.parse(await file.text()));const imported=await importNativeSave(backup.tracker);for(const c of backup.campaigns){const index=backup.tracker.chains.findIndex(b=>b.chain.id===c.chainId);await api('/import',remapCampaign(c,backup.tracker.chains[index],imported.chains[index]));}navigate(`/chains/${imported.chains[0].chain.id}/play`);setNotice('Restored chain and campaigns with remapped tracker references.');});e.target.value='';}}/></label>
      </section>}
    </>}
  </>;
}
