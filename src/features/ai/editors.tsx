import { useEffect, useState } from 'react';
import { NpcSchema, SceneSchema, SettingsSchema, StateSchema, type Campaign, type CampaignState } from '../../ai/schema';
import type { NativeChainBundle } from '../../domain/save';
export function JsonReview({value,onSave,label='Review JSON'}:{value:unknown;onSave:(raw:unknown)=>Promise<void>;label?:string}) {
  const [text,setText]=useState(()=>JSON.stringify(value,null,2));const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>setText(JSON.stringify(value,null,2)),[value]);
  return <div className="stack"><label>{label}<textarea className="ai-json" rows={16} value={text} onChange={e=>setText(e.target.value)}/></label><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSave(JSON.parse(text));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Validate & save</button>{error&&<p role="alert">{error}</p>}</div>;
}
export function SettingsPanel({campaign,onSave}:{campaign:Campaign;onSave:(settings:unknown)=>Promise<void>}) {
  const [settings,setSettings]=useState(campaign.settings);const [notice,setNotice]=useState('');
  useEffect(()=>setSettings(campaign.settings),[campaign.settings]);
  return <section className="ai-panel stack"><h2>GM direction</h2>
    <label>Campaign style<textarea value={settings.style} onChange={e=>setSettings({...settings,style:e.target.value})}/></label>
    <div className="ai-fields">{(['fidelity','simulation','accommodation','verbosity','npcInitiative','timeAdvancement'] as const).map(key=><label key={key}>{({fidelity:'Canon fidelity',simulation:'Simulation strictness',accommodation:'Protagonist accommodation',verbosity:'Narrative verbosity',npcInitiative:'NPC initiative',timeAdvancement:'Time advancement'})[key]}<select value={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value})}>{SettingsSchema.shape[key].removeDefault().options.map(v=><option key={v}>{v}</option>)}</select></label>)}</div>
    <label>GM system prompt<textarea rows={12} value={settings.gmPrompt} onChange={e=>setSettings({...settings,gmPrompt:e.target.value})}/></label>
    <label>Mature content preferences<textarea rows={2} value={settings.matureContentPolicy} onChange={e=>setSettings({...settings,matureContentPolicy:e.target.value})}/></label>
    <div className="ai-fields">{(['loreDepth','memoryDepth','mechanicsBudget','chatBudget'] as const).map(key=><label key={key}>{key}<input type="number" value={settings[key]} onChange={e=>setSettings({...settings,[key]:Number(e.target.value)})}/></label>)}</div>
    <button onClick={async()=>{try{await onSave(SettingsSchema.parse(settings));setNotice('GM settings saved.');}catch(e){setNotice((e as Error).message);}}}>Save GM settings</button><p role="status">{notice}</p>
  </section>;
}
export function SceneEditor({campaign,bundle,onSave}:{campaign:Campaign;bundle:NativeChainBundle;onSave:(state:CampaignState)=>Promise<void>}) {
  const [scene,setScene]=useState(campaign.state.scene);const [notice,setNotice]=useState('');
  useEffect(()=>setScene(campaign.state.scene),[campaign.state.scene]);
  const companions=bundle.companions.filter(c=>bundle.companionParticipations.some(p=>p.companionId===c.id&&p.jumpId===scene.stamp.jumpId&&p.status==='active'));
  return <section className="ai-panel stack"><h2>Scene & chronology</h2><div className="ai-fields">
    <label>Scene title<input value={scene.title} onChange={e=>setScene({...scene,title:e.target.value})}/></label><label>Location<input value={scene.location} onChange={e=>setScene({...scene,location:e.target.value})}/></label>
    <label>Jump<select value={scene.stamp.jumpId} onChange={e=>setScene({...scene,stamp:{jumpId:e.target.value,elapsedMinutes:0,absoluteDate:''},presentCompanionIds:[],npcIds:[]})}>{bundle.jumps.filter(j=>j.branchId===campaign.branchId).map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
    <label>Jump-relative minutes<input type="number" min={0} value={scene.stamp.elapsedMinutes} onChange={e=>setScene({...scene,stamp:{...scene.stamp,elapsedMinutes:Number(e.target.value)}})}/></label>
    <label>Absolute date / calendar label<input value={scene.stamp.absoluteDate} onChange={e=>setScene({...scene,stamp:{...scene.stamp,absoluteDate:e.target.value}})}/></label></div>
    <div className="ai-actions">{[60,1440,43200,525600].map((m,i)=><button key={m} onClick={()=>setScene({...scene,stamp:{...scene.stamp,elapsedMinutes:scene.stamp.elapsedMinutes+m}})}>Advance {['hour','day','30 days','365 days'][i]}</button>)}</div>
    <fieldset><legend>Companions in this scene</legend>{companions.length?companions.map(c=><label key={c.id}><input type="checkbox" checked={scene.presentCompanionIds.includes(c.id)} onChange={e=>setScene({...scene,presentCompanionIds:e.target.checked?[...scene.presentCompanionIds,c.id]:scene.presentCompanionIds.filter(id=>id!==c.id)})}/>{c.name}</label>):<p>Add active companion participations in the tracker to include them here.</p>}</fieldset>
    <fieldset><legend>NPCs in this scene</legend>{campaign.state.npcs.map(n=><label key={n.id}><input type="checkbox" checked={scene.npcIds.includes(n.id)} onChange={e=>setScene({...scene,npcIds:e.target.checked?[...scene.npcIds,n.id]:scene.npcIds.filter(id=>id!==n.id)})}/>{n.name}</label>)}</fieldset>
    {(['threads','plans'] as const).map(key=><label key={key}>{key==='threads'?'Unresolved threads':'Ongoing plans'}<textarea value={scene[key].join('\n')} onChange={e=>setScene({...scene,[key]:e.target.value.split('\n').filter(Boolean)})}/></label>)}
    <button onClick={async()=>{try{await onSave({...campaign.state,scene:SceneSchema.parse(scene)});setNotice('Scene saved to campaign history.');}catch(e){setNotice((e as Error).message);}}}>Save scene</button><p role="status">{notice}</p>
    <details><summary>Status, injuries, resources, and temporary objects</summary><JsonReview value={campaign.state.scene} onSave={raw=>onSave({...campaign.state,scene:SceneSchema.parse(raw)})}/></details>
  </section>;
}
export function NpcEditor({campaign,bundle,onSave}:{campaign:Campaign;bundle:NativeChainBundle;onSave:(state:CampaignState)=>Promise<void>}) {
  const [selected,setSelected]=useState('');const [draft,setDraft]=useState(NpcSchema.parse({id:crypto.randomUUID(),name:'New NPC'}));const [notice,setNotice]=useState('');
  useEffect(()=>{const npc=campaign.state.npcs.find(n=>n.id===selected);if(npc)setDraft(npc);},[selected,campaign.state.npcs]);
  return <section className="ai-panel stack"><h2>NPCs & companion continuity</h2><p>Knowledge and beliefs describe this character’s perspective. Objective facts belong in campaign memory.</p>
    <div className="ai-actions"><select aria-label="Select NPC" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">New NPC</option>{campaign.state.npcs.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select><button onClick={()=>{setSelected('');setDraft(NpcSchema.parse({id:crypto.randomUUID(),name:'New NPC'}));}}>New NPC</button></div>
    <div className="ai-fields">{(['name','setting','location','relationship','background'] as const).map(key=><label key={key}>{key}<input value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
    <label>Tracker companion link<select value={draft.companionId??''} onChange={e=>setDraft({...draft,companionId:e.target.value||null})}><option value="">Independent NPC</option>{bundle.companions.filter(c=>c.branchId===campaign.branchId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    <div className="ai-fields">{(['aliases','opinions','beliefs','knowledge','beliefsAboutJumper','suspicions','goals','resources','plans'] as const).map(key=><label key={key}>{key==='beliefsAboutJumper'?'Beliefs about the Jumper':key}<textarea rows={3} value={draft[key].join('\n')} onChange={e=>setDraft({...draft,[key]:e.target.value.split('\n').filter(Boolean)})}/></label>)}</div>
    <button onClick={async()=>{try{const npc=NpcSchema.parse(draft);await onSave({...campaign.state,npcs:[...campaign.state.npcs.filter(n=>n.id!==npc.id),npc]});setSelected(npc.id);setNotice('NPC saved.');}catch(e){setNotice((e as Error).message);}}}>Save NPC</button><p role="status">{notice}</p>
  </section>;
}
