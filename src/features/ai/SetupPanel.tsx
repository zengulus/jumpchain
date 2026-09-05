import { useState } from 'react';
import { ProviderSchema, RoleSchema, ServiceConfigSchema, type ServiceConfig, type ModelRole } from '../../ai/schema';
import { api, serviceUrl, SERVICE_URL_KEY } from './client';
export function SetupPanel({onConnected}:{onConnected:() => void}) {
  const [url,setUrl]=useState(serviceUrl);const [config,setConfig]=useState<ServiceConfig>(ServiceConfigSchema.parse({providers:{narrator:ProviderSchema.parse({})}}));
  const [role,setRole]=useState<ModelRole>('narrator');const [models,setModels]=useState<string[]>([]);const [notice,setNotice]=useState('Start the local AI service, then connect.');const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);
  const provider=config.providers[role];
  async function run(work:()=>Promise<void>) {setBusy(true);try{await work();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
  const update=(patch:Record<string,unknown>) => setConfig({...config,providers:{...config.providers,[role]:{...provider,...patch}}});
  return <section className="ai-panel stack"><h2>AI Setup</h2><p>Connect a local service and narrator. Extraction and summaries use the narrator unless you assign another model. Embeddings and reranking are optional.</p>
    <label>1. Jumpchain service URL<input value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <button disabled={busy} onClick={()=>void run(async()=>{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('Use an HTTP service URL.');localStorage.setItem(SERVICE_URL_KEY,url.replace(/\/$/,''));await api('/health');setConfig(await api<ServiceConfig>('/config'));setLoaded(true);setNotice('Service connected. Configure and test the narrator.');onConnected();})}>Connect service</button>
    <fieldset disabled={busy||!loaded}><legend>2. Model assignments</legend>
      <label>Model role<select value={role} onChange={e=>{setRole(e.target.value as ModelRole);setModels([]);}}>{RoleSchema.options.map(r=><option key={r}>{r}</option>)}</select></label>
      {role!=='narrator'&&<label><input type="checkbox" checked={!!provider} onChange={e=>setConfig({...config,providers:{...config.providers,[role]:e.target.checked?ProviderSchema.parse({}):undefined}})}/> Assign a separate model {role==='embeddings'||role==='reranking'?'(optional)':'(otherwise use narrator)'}</label>}
      {provider&&<><label>Provider<select value={provider.type} onChange={()=>{}}><option value="openai-compatible">OpenAI-compatible local API</option></select></label>
      <label>Base URL<input value={provider.baseUrl} onChange={e=>update({baseUrl:e.target.value})}/></label>
      <label>Model identifier<input list="ai-models" value={provider.model} onChange={e=>update({model:e.target.value})}/><datalist id="ai-models">{models.map(m=><option key={m} value={m}/>)}</datalist></label>
      <label>Optional API key<input type="password" autoComplete="off" value={provider.apiKey} onChange={e=>update({apiKey:e.target.value})}/></label>
      <div className="ai-fields">{(['contextWindow','temperature','maxOutput','timeoutMs'] as const).map(key=><label key={key}>{({contextWindow:'Context window (tokens)',temperature:'Temperature',maxOutput:'Max output tokens',timeoutMs:'Timeout (milliseconds)'})[key]}<input type="number" step={key==='temperature'?'0.1':'1'} value={provider[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}</div>
      <label>Stop strings (one per line)<textarea rows={2} value={provider.stop.join('\n')} onChange={e=>update({stop:e.target.value.split('\n').filter(Boolean)})}/></label>
      <label><input type="checkbox" checked={provider.streaming} onChange={e=>update({streaming:e.target.checked})}/> Stream output</label></>}
      <div className="ai-actions"><button onClick={()=>void run(async()=>{await api('/config',ServiceConfigSchema.parse(config));setNotice('Model assignments saved locally.');})}>Save assignments</button>
      <button onClick={()=>void run(async()=>{await api('/config',ServiceConfigSchema.parse(config));const result=await api<{models:string[];selectedAvailable:boolean}>('/models',{role});setModels(result.models);setNotice(result.selectedAvailable?'Connection passed. Selected model is advertised by the server.':`Endpoint reached. ${result.models.length} models available; choose an advertised model identifier.`);})}>Save & test connection / discover models</button></div>
    </fieldset>
    <p role="status">{busy?'Connecting…':notice}</p><p>3. In Knowledge, import setting text or PDFs. 4. In Play, create a campaign for the current jump. A model server controls model loading; Jumpchain uses its configured endpoints.</p>
  </section>;
}
