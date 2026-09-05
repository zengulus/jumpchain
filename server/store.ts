import { mkdir, readFile, rename, writeFile, readdir, rm, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CampaignSchema, ServiceConfigSchema, ProviderSchema, stableStringify, type Campaign, type ServiceConfig } from '../src/ai/schema';
import type { VectorIndex } from '../src/ai/retrieval';
import { validateCampaign } from '../src/ai/state';

export class LocalStore {
  private locks = new Map<string, Promise<unknown>>();
  constructor(readonly root: string) {}
  async init(): Promise<void> {
    await mkdir(join(this.root,'campaigns'),{recursive:true}); await mkdir(join(this.root,'indexes'),{recursive:true});
    // A single writer process protects JSON transactions, including on Windows.
    const lockPath = join(this.root,'service.lock');
    try { const lock = await open(lockPath,'wx'); await lock.writeFile(String(process.pid)); await lock.close(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(await readFile(lockPath,'utf8'));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid service.lock; inspect the data directory before removing it.');
      try { process.kill(pid,0); } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe;
        await rm(lockPath); return this.init();
      }
      throw new Error('Another AI service is using this data directory.');
    }
    // Interrupted generations become retryable, never implicitly established.
    for (const campaign of await this.list()) {
      let changed = false;
      for (const turn of campaign.turns) if (turn.status === 'generating') { turn.status = 'failed'; turn.error = 'Service stopped during generation. Retry or fork this turn.'; changed = true; }
      if (changed) await this.save(campaign);
    }
  }
  async close() { await rm(join(this.root,'service.lock'),{force:true}); }
  path(id: string, index = false) {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid campaign identifier.');
    return join(this.root,index ? 'indexes':'campaigns',`${id}.json`);
  }
  async atomic(path: string, value: unknown) {
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(temp,'wx',0o600);
      try { await file.writeFile(stableStringify(value)); await file.sync(); } finally { await file.close(); }
      await rename(temp,path);
    } finally { await rm(temp,{force:true}); }
  }
  async get(id: string): Promise<Campaign> { return validateCampaign(JSON.parse(await readFile(this.path(id),'utf8'))); }
  async save(campaign: Campaign) { await this.atomic(this.path(campaign.id), validateCampaign(campaign)); }
  async list(): Promise<Campaign[]> {
    const names = (await readdir(join(this.root,'campaigns'))).filter(n => n.endsWith('.json'));
    return Promise.all(names.sort().map(n => this.get(n.slice(0,-5))));
  }
  async transaction<T>(id: string, fn: (campaign: Campaign) => Promise<T> | T): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const campaign = await this.get(id); const result = await fn(campaign);
      campaign.revision++; campaign.updatedAt = new Date().toISOString(); await this.save(campaign); return result;
    });
    this.locks.set(id,next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
  async config(): Promise<ServiceConfig> {
    try { return ServiceConfigSchema.parse(JSON.parse(await readFile(join(this.root,'config.json'),'utf8'))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; return ServiceConfigSchema.parse({providers:{narrator:ProviderSchema.parse({})}}); }
  }
  async saveConfig(config: unknown) { await this.atomic(join(this.root,'config.json'),ServiceConfigSchema.parse(config)); }
  async index(id: string): Promise<VectorIndex | undefined> {
    try {
      const index = JSON.parse(await readFile(this.path(id,true),'utf8')) as VectorIndex;
      if (index.version !== 1 || typeof index.fingerprint !== 'string' || !index.vectors || Object.values(index.vectors).some(v => !Array.isArray(v) || !v.length || v.some(n => typeof n !== 'number' || !Number.isFinite(n)))) return undefined;
      return index;
    } catch (e) { if (e instanceof SyntaxError || (e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
  }
  async saveIndex(id: string, index: VectorIndex) { await this.atomic(this.path(id,true),index); }
  async deleteIndex(id: string) { await rm(this.path(id,true),{force:true}); }
}
