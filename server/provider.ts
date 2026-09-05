import { z } from 'zod';
import type { ProviderConfig } from '../src/ai/schema';
export interface Message { role: 'system'|'user'|'assistant'; content: string }
export interface GenerativeProvider { models(config: ProviderConfig, signal?: AbortSignal): Promise<string[]>; generate(config: ProviderConfig, messages: Message[], onToken: (token: string) => void, signal?: AbortSignal, json?: boolean): Promise<string> }
export interface EmbeddingsProvider { embed(config: ProviderConfig, texts: string[], signal?: AbortSignal): Promise<number[][]> }
export interface RerankingProvider { rerank(config: ProviderConfig, query: string, documents: string[], signal?: AbortSignal): Promise<number[]> }
export function providerUrl(config: ProviderConfig, route: string) {
  const url = new URL(config.baseUrl);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) base URL without credentials, query, or fragment.');
  return `${url.href.replace(/\/$/,'')}/${route}`;
}
async function request(config: ProviderConfig, route: string, body?: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(config.timeoutMs);
  try {
    const response = await fetch(providerUrl(config, route), { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type':'application/json', ...(config.apiKey ? {Authorization:`Bearer ${config.apiKey}`} : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal,timeout]) : timeout, redirect:'error' });
    if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}. ${response.status === 404 ? 'Check base URL and model identifier.' : 'Check model server diagnostics.'}`);
    return response;
  } catch (error) {
    if (signal?.aborted) throw new Error('Generation cancelled.');
    if (timeout.aborted) throw new Error(`Model endpoint timed out after ${config.timeoutMs/1000}s.`);
    if (error instanceof TypeError) throw new Error('LLM server unreachable. Start the model server and check its base URL.');
    throw error;
  }
}
export async function* sseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = '';
  try {
    while (true) {
      const {value, done} = await reader.read(); buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      buffer = buffer.replace(/\r\n/g,'\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0,end); buffer = buffer.slice(end+2);
        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (data) yield data;
      }
      if (buffer.length > 4000000) throw new Error('Model stream frame exceeded size limit.');
      if (done) { if (buffer.trim().startsWith('data:')) yield buffer.trim().slice(5).trim(); break; }
    }
  } finally { reader.releaseLock(); }
}
export const openAICompatible: GenerativeProvider & EmbeddingsProvider & RerankingProvider = {
  async models(config, signal) {
    const body = await (await request(config,'models',undefined,signal)).json();
    return z.object({data:z.array(z.object({id:z.string()}))}).parse(body).data.map(m => m.id);
  },
  async generate(config, messages, onToken, signal, json = false) {
    if (!config.model.trim()) throw new Error('Choose a model identifier in AI Setup.');
    const response = await request(config, 'chat/completions', {model:config.model,messages,temperature:json ? 0 : config.temperature,max_tokens:config.maxOutput,stop:config.stop.length ? config.stop : undefined,stream:config.streaming, ...(json ? {response_format:{type:'json_object'}} : {})}, signal);
    let text = '';
    if (config.streaming) {
      if (!response.body) throw new Error('Model returned an empty stream.');
      let finished = false;
      for await (const data of sseData(response.body)) {
        if (data === '[DONE]') { finished = true; break; }
        const chunk = JSON.parse(data);
        if (chunk.error) throw new Error('Model stream reported an error. Check model server diagnostics.');
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason === 'length') throw new Error('Model output limit reached. Increase max output or shorten the requested response.');
        if (choice?.finish_reason) finished = true;
        const token = choice?.delta?.content;
        if (typeof token === 'string') { text += token; onToken(token); }
        if (text.length > 2000000) throw new Error('Model response exceeded size limit.');
      }
      if (!finished) throw new Error('Model stream ended prematurely. Retry the turn.');
    } else {
      const body = await response.json();
      if (body.choices?.[0]?.finish_reason === 'length') throw new Error('Model output limit reached.');
      text = z.string().parse(body.choices?.[0]?.message?.content); onToken(text);
    }
    if (!text.trim()) throw new Error('Model returned no narrative. Verify model and output budget.');
    return text;
  },
  async embed(config, texts, signal) {
    const result: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 16) {
      const batch = texts.slice(offset, offset+16);
      const body = await (await request(config,'embeddings',{model:config.model,input:batch},signal)).json();
      const data = z.object({data:z.array(z.object({index:z.number().int(),embedding:z.array(z.number().finite()).min(1)}))}).parse(body).data.sort((a,b) => a.index-b.index);
      if (data.length !== batch.length || data.some((d,i) => d.index !== i)) throw new Error('Embedding endpoint returned incomplete or duplicate vectors.');
      result.push(...data.map(d => d.embedding));
    }
    if (result.some(v => v.length !== result[0]?.length)) throw new Error('Embedding dimensions are inconsistent.');
    return result;
  },
  async rerank(config, query, documents, signal) {
    const body = await (await request(config,'rerank',{model:config.model,query,documents,top_n:documents.length},signal)).json();
    const data = z.object({results:z.array(z.object({index:z.number().int().nonnegative(),relevance_score:z.number().finite()}))}).parse(body).results;
    if (data.some(r => r.index >= documents.length) || new Set(data.map(r => r.index)).size !== data.length) throw new Error('Reranker returned invalid indices.');
    return documents.map((_,i) => data.find(r => r.index === i)?.relevance_score ?? -Infinity);
  },
};
export function parseModelJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try { return JSON.parse(stripped); } catch { throw new Error('Model returned malformed structured JSON. Narrative was saved; no state was changed.'); }
}
