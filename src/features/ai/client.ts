import { aiEnabled } from '../../app/operatingMode';
export const SERVICE_URL_KEY='jumpchain.ai.service-url';
export function serviceUrl() {return localStorage.getItem(SERVICE_URL_KEY) ?? 'http://127.0.0.1:4317';}
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!aiEnabled()) throw new Error('AI is disabled. Enable AI GM to connect.');
  let response: Response;
  try {response=await fetch(`${serviceUrl()}/api/v1${path}`,{method:body === undefined ? 'GET':'POST',headers:{'Content-Type':'application/json'},body:body === undefined ? undefined:JSON.stringify(body),signal:signal ?? AbortSignal.timeout(1800000)});}
  catch(e) {if (signal?.aborted) throw e;throw new Error('AI service unreachable. Run npm run dev:ai or npm run start:ai, then check the service URL.');}
  const data=await response.json();if (!response.ok) throw new Error(data.error ?? `AI service HTTP ${response.status}`);return data;
}
export async function streamTurn(path: string, body: unknown, onEvent: (event: any) => void, signal: AbortSignal) {
  if (!aiEnabled()) throw new Error('AI is disabled.');
  const response=await fetch(`${serviceUrl()}/api/v1${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if (!response.ok) throw new Error((await response.json()).error);
  if (!response.body) throw new Error('AI service returned no stream.');
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let finished=false;
  try {
    while (true) {
      const {value,done}=await reader.read();buffer+=done ? decoder.decode():decoder.decode(value,{stream:true});
      let end:number;
      while((end=buffer.indexOf('\n'))!==-1) {const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if (line.trim()) {const event=JSON.parse(line);if (event.type==='done') finished=true;if (event.type==='error') throw new Error(event.error);onEvent(event);}}
      if(done) break;
    }
    if (!finished) throw new Error('Connection ended before the turn finished. Reload to inspect the saved turn.');
  } finally {reader.releaseLock();}
}
