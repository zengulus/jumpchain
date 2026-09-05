import { prepareChainMakerV2ImportSession } from '../domain/import/chainmakerV2';
import sample from '../fixtures/chainmaker/chainmaker-v2.sample.json';
import { CampaignSchema, SettingsSchema, SceneSchema, type Campaign } from '../ai/schema';
import type { NativeChainBundle } from '../domain/save';
export function aiFixture(): {bundle:NativeChainBundle;campaign:Campaign} {
  const bundle=prepareChainMakerV2ImportSession(sample).bundle;
  bundle.snapshots=[];bundle.attachments=[];bundle.importReports=[];bundle.effects=[];bundle.notes=[];bundle.houseRuleProfiles=[];bundle.bodymodProfiles=[];
  bundle.chain.activeJumpId=bundle.jumps[0].id;
  // Imported raw fragments are irrelevant to this fixture, which tests canonical records.
  for(const records of Object.values(bundle)) if(Array.isArray(records)) for(const record of records) if('importSourceMetadata' in record) record.importSourceMetadata={};
  bundle.chain.importSourceMetadata={};
  bundle.jumps[0].status='current';
  for(const p of bundle.participations){p.status='active';p.purchases=[];p.drawbacks=[];p.retainedDrawbacks=[];p.origins={};p.supplementPurchases={};p.supplementInvestments={};}
  const campaign=CampaignSchema.parse({schemaVersion:1,id:'test-campaign',title:'Test campaign',chainId:bundle.chain.id,branchId:bundle.chain.activeBranchId,revision:0,createdAt:'2026-09-05T00:00:00Z',updatedAt:'2026-09-05T00:00:00Z',settings:SettingsSchema.parse({}),state:{scene:SceneSchema.parse({stamp:{jumpId:bundle.jumps[0].id,elapsedMinutes:100},location:'Hogwarts'})}});
  return {bundle,campaign};
}
