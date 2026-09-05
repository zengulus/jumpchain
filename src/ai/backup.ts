import { z } from 'zod';
import type { NativeChainBundle } from '../domain/save';
import { CampaignSchema, type Campaign } from './schema';
import { migrateNativeSaveEnvelope } from '../migrations/nativeSave';
export const CampaignBackupSchema=z.object({format:z.literal('jumpchain-campaign'),schemaVersion:z.literal(1),exportedAt:z.string(),tracker:z.unknown(),campaigns:z.array(CampaignSchema)}).strict();
export function validateBackup(raw:unknown) {
  const backup=CampaignBackupSchema.parse(raw);const tracker=migrateNativeSaveEnvelope(backup.tracker);
  for (const campaign of backup.campaigns) {
    const chain=tracker.chains.find(b => b.chain.id===campaign.chainId);
    if (!chain || !chain.branches.some(b => b.id===campaign.branchId)) throw new Error('Backup campaign has no matching tracker chain/branch.');
  }
  return {...backup,tracker};
}
export function remapCampaign(campaign:Campaign, before:NativeChainBundle, after:NativeChainBundle):Campaign {
  const ids=new Map<string,string>();
  function collect(a:unknown,b:unknown) {
    if (Array.isArray(a)&&Array.isArray(b)) {a.forEach((v,i) => collect(v,b[i]));return;}
    if(a&&b&&typeof a==='object'&&typeof b==='object') {
      const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
      if(typeof aa.id==='string'&&typeof bb.id==='string') ids.set(aa.id,bb.id);
      for(const k of Object.keys(aa)) collect(aa[k],bb[k]);
    }
  }
  collect(before,after);
  const mapped=JSON.parse(JSON.stringify(campaign,(_,value) => typeof value==='string'&&ids.has(value)?ids.get(value):value));
  mapped.chainId=after.chain.id;mapped.branchId=ids.get(campaign.branchId) ?? campaign.branchId;
  return CampaignSchema.parse(mapped);
}
