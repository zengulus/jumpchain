import type { z } from 'zod';
import type { NativeChainBundle } from '../domain/save';
import { buildBranchWorkspace } from '../domain/chain/selectors';
import { migrateCampaign, ModelOperationSchema, SceneUpdateSchema, NpcUpdateSchema, NpcListSchema, NpcSchema, NewFactSchema, NewEventSchema, stableStringify, type Campaign, type CampaignState, type TransitionPlan, type Turn, type Worldbook } from './schema';
import { applyTransition, validateState, type TransitionContext } from './transitions';
import { trackerFingerprint } from './context';
export { validateState } from './transitions';

// Explicit-but-invalid worldbook Jump ownership is an ERROR, not legacy missing scope. Migration
// (migrateCampaign) handles genuinely legacy books that predate book-level jumpId; this validator
// is for current data that names a Jump outside the campaign's branch. Disabled books are validated
// too: disabled means "don't retrieve this source", not "ignore broken referential integrity".
export function validateWorldbookScopes(campaign: Campaign, bundle: NativeChainBundle, worldbooks: Worldbook[] = campaign.worldbooks): void {
  if (bundle.chain.id !== campaign.chainId || !bundle.branches.some(b => b.id === campaign.branchId)) throw new Error('Tracker does not match this campaign.');
  const ws = buildBranchWorkspace(bundle, campaign.branchId);
  const valid = new Set(ws.jumps.map(j => j.id));
  for (const book of worldbooks) {
    if (!valid.has(book.jumpId)) throw new Error(`Worldbook "${book.title}" is scoped to unknown Jump ID "${book.jumpId}". Reassign the worldbook to a Jump in this campaign branch.`);
  }
}
// Receipts are process-local proof of the one commit/rollback pathway, never persisted capabilities.
const stateWrites = new WeakMap<Campaign,{before:string;after:string}>();
export function assertStateWrite(campaign: Campaign, previous: CampaignState) {
  if (stableStringify(previous) === stableStringify(campaign.state)) return;
  const receipt=stateWrites.get(campaign);
  if (!receipt || receipt.before!==stableStringify(previous) || receipt.after!==stableStringify(campaign.state)) throw new Error('CampaignState writes must use a validated transition or audited rollback.');
}
function recordStateWrite(campaign: Campaign, before: CampaignState) {
  stateWrites.set(campaign,{before:stableStringify(before),after:stableStringify(campaign.state)});
}

type CommitContext = Exclude<TransitionContext,{origin:'model-proposal'}> | (Extract<TransitionContext,{origin:'model-proposal'}> & {reviewedTurnId:string});
/** The only forward assignment and audit pathway. Planning and revalidation finish before writes. */
export function commitTransition(campaign: Campaign, plan: TransitionPlan, context: CommitContext, action: string, at: string) {
  if (context.campaign.id!==campaign.id || context.campaign.chainId!==campaign.chainId || context.campaign.branchId!==campaign.branchId) throw new Error('Commit context targets a different campaign.');
  if (context.origin==='model-proposal') {
    const turn=campaign.turns.find(t=>t.id===context.reviewedTurnId && t.id===context.sourceTurnId);
    if (!turn || turn.proposalStatus!=='pending' || !turn.proposal) throw new Error('No pending proposal on this turn.');
    assertTurnCurrent(campaign,context.bundle,turn);
    if (!('version' in turn.proposal) || !turn.transitionPlan) throw new Error('Legacy/unplanned proposal requires fresh state analysis before review.');
    if (stableStringify(turn.transitionPlan)!==stableStringify(plan) || stableStringify(turn.proposal.operations)!==stableStringify(plan.operations)) throw new Error('Proposal operations changed since preview.');
  }
  const validated=applyTransition(campaign.state,plan,context);
  if (campaign.audit.some(a=>a.id===plan.id)) throw new Error('Transition already committed.');
  const before=structuredClone(campaign.state);
  campaign.audit.push({id:validated.id,at,action,turnId:validated.sourceTurnId,before,after:structuredClone(validated.after),rolledBack:false,transition:validated});
  campaign.state=structuredClone(validated.after);
  recordStateWrite(campaign,before);
}

export function assertTurnCurrent(campaign: Campaign, bundle: NativeChainBundle, turn: Turn) {
  if (turn.status!=='complete' || !turn.inContinuity || turn.proposalStatus==='accepted') throw new Error('Only completed, unapplied turns in continuity can be analyzed or reviewed. Fork this turn.');
  if (stableStringify(campaign.state)!==stableStringify(turn.before)) throw new Error('Campaign state changed since generation. Fork before retrying analysis or review.');
  if (trackerFingerprint(bundle)!==turn.context?.trackerFingerprint) throw new Error('Tracker changed since generation. Reject, fork, and regenerate using current state.');
}
export function reviewProposal(campaign: Campaign, bundle: NativeChainBundle, turnId: string, accept: boolean, at: string) {
  const turn=campaign.turns.find(t=>t.id===turnId);
  if (!turn || turn.proposalStatus!=='pending' || !turn.proposal) throw new Error('No pending proposal on this turn.');
  if (accept) {
    if (!turn.transitionPlan) throw new Error('Legacy/unplanned proposal requires fresh state analysis before review.');
    commitTransition(campaign,turn.transitionPlan,{origin:'model-proposal',campaign,bundle,sourceTurnId:turn.id,reviewedTurnId:turn.id},'Accepted model proposal',at);
  }
  turn.proposalStatus=accept ? 'accepted' : 'rejected';
}

export function rollbackLatest(campaign: Campaign) {
  const audit = [...campaign.audit].reverse().find(a => !a.rolledBack);
  if (!audit) throw new Error('No state change to roll back.');
  if (stableStringify(campaign.state) !== stableStringify(audit.after)) throw new Error('State has diverged from the audit entry.');
  validateState(audit.before);
  const before=structuredClone(campaign.state);
  campaign.state = structuredClone(audit.before); audit.rolledBack = true;
  recordStateWrite(campaign,before);
  if (audit.turnId) {
    const index = campaign.turns.findIndex(t => t.id === audit.turnId);
    if (index >= 0) for (const turn of campaign.turns.slice(index)) { turn.inContinuity = false; turn.proposalStatus = 'rejected'; }
  }
  for (const turn of campaign.turns) if (turn.proposalStatus === 'pending') turn.proposalStatus = 'rejected';
}
export function validateCampaign(raw: unknown) {
  // Migration runs at every persistence boundary so legacy saves (worldbooks predating book-level
  // Jump ownership) load unchanged and are scoped deterministically.
  const campaign = migrateCampaign(raw); validateState(campaign.state);
  const ids=new Set<string>();
  for (const book of campaign.worldbooks) {
    if(ids.has(book.id)) throw new Error('Duplicate worldbook ID.'); ids.add(book.id);
    const entries=new Set<string>(); for(const entry of book.entries) { if(entries.has(entry.id))throw new Error('Duplicate worldbook entry ID.');entries.add(entry.id); }
  }
  for (const turn of campaign.turns) validateState(turn.before);
  return campaign;
}
type ModelOperationInput = z.input<typeof ModelOperationSchema>;
/** Examples are keyed by every validated kind; schema additions require a typed prompt example. */
export const modelOperationExamples: {[K in ModelOperationInput['kind']]:Extract<ModelOperationInput,{kind:K}>} = {
  'scene.update':{kind:'scene.update',value:{location:'Great Hall'}},
  'scene.advance':{kind:'scene.advance',minutes:5},
  'scene.presence':{kind:'scene.presence',npcs:[{id:'npc-id'},{local:'newNpc'}]},
  'npc.create':{kind:'npc.create',handle:'newNpc',value:{name:'Visitor'}},
  'npc.update':{kind:'npc.update',npc:{id:'npc-id'},value:{relationship:'Friend'}},
  'npc.list':{kind:'npc.list',npc:{id:'npc-id'},list:'suspicions',add:['The visitor can fly'],remove:[]},
  'npc.events':{kind:'npc.events',npc:{id:'npc-id'},events:[{local:'newEvent'}]},
  'fact.create':{kind:'fact.create',handle:'newFact',value:{key:'gate',text:'The gate opened',authority:'campaign-established'}},
  'event.create':{kind:'event.create',handle:'newEvent',value:{summary:'The gate opened',authority:'inferred'}},
  'memory.supersede':{kind:'memory.supersede',target:'fact',record:{id:'old-fact'},replacement:{local:'newFact'}},
};
export function proposalInstructions(sourceId: string, _state: CampaignState) {
  return `Analyze the exchange separately from narration. Return ONLY {"version":2,"rationale":string,"operations":array}. All changes require player review. No tracker edits. Empty operations are valid. Propose only supported changes; preserve uncertainty and NPC belief versus objective truth.
Use narrow operations. Omitted fields remain unchanged. The application assigns persistent IDs and provenance for exchange ${sourceId}; never supply id/sourceIds/sourceMessageIds on creation. Creation handles are unique short identifiers. References are {"id":"existing-record-id"} or {"local":"earlier-handle"}. Local references must match the required record type and only refer to earlier creations. Examples below illustrate syntax, not facts or actual IDs.
Allowed operations:
${ModelOperationSchema.options.map(schema=>`${schema.description} Example: ${stableStringify(modelOperationExamples[schema.shape.kind.value])}`).join('\n')}
Optional scene.update value fields: ${Object.keys(SceneUpdateSchema.shape).join(', ')}. statuses is [{entityId,description}], resources is {key:number}; threads/plans/temporaryObjects are string arrays.
Optional npc.create value fields: ${Object.keys(NpcSchema.omit({id:true,eventIds:true}).shape).join(', ')}. Name is required; lists default empty.
Optional npc.update value fields: ${Object.keys(NpcUpdateSchema.shape).join(', ')}.
Allowed npc.list lists: ${NpcListSchema.options.join(', ')}. List values are exact strings.
Fact value fields: ${Object.keys(NewFactSchema.shape).join(', ')}. key, text and authority are required.
Event value fields: ${Object.keys(NewEventSchema.shape).join(', ')}. summary and authority are required.
Fact/event authority must be campaign-established, inferred, or speculative. Stamp defaults to the scene after preceding operations; explicit stamp is {jumpId,elapsedMinutes,absoluteDate:""}. Do not change Jump, reverse chronology, date new memories in the future, reassign an NPC companion link, overwrite history, or supersede player declarations. Use current records and valid tracker scene presence. Use supersession to replace a fact/event; never silently overwrite it.`;
}
