import { z } from 'zod';
import type { NativeChainBundle } from '../domain/save';
import { buildBranchWorkspace } from '../domain/chain/selectors';
import { trackerFingerprint } from './context';
import { CampaignOperationSchema, PlayerOperationSchema, ModelOperationSchema, TransitionPlanSchema, StateSchema, SummarySchema, NpcSchema, FactSchema, EventSchema, stableStringify, type Campaign, type CampaignState, type CampaignOperation, type TransitionPlan } from './schema';

export type TransitionContext =
  | {origin:'model-proposal';campaign:Pick<Campaign,'id'|'chainId'|'branchId'>;bundle:NativeChainBundle;sourceTurnId:string}
  | {origin:'player-edit';campaign:Pick<Campaign,'id'|'chainId'|'branchId'>;bundle:NativeChainBundle}
  | {origin:'generated-summary';campaign:Pick<Campaign,'id'|'chainId'|'branchId'>};
const collections = {npc:'npcs',fact:'facts',event:'events',summary:'summaries'} as const;
type RecordKind = keyof typeof collections;

/** Whole-state consistency, also used at load boundaries. Actor permissions belong to planning. */
export function validateState(state: CampaignState, bundle?: NativeChainBundle, campaign?: Pick<Campaign, 'chainId' | 'branchId'>) {
  StateSchema.parse(state);
  const ids = new Set<string>();
  for (const record of [...state.npcs, ...state.facts, ...state.events, ...state.summaries]) {
    if (ids.has(record.id)) throw new Error(`Duplicate campaign record ID: ${record.id}`); ids.add(record.id);
  }
  for (const id of state.scene.npcIds) if (!state.npcs.some(n => n.id === id)) throw new Error(`Unknown scene NPC: ${id}`);
  for (const fact of state.facts) {
    if (fact.authority === 'authoritative') throw new Error('Campaign facts cannot claim mechanical authority.');
    if (fact.supersededBy && !state.facts.some(f => f.id === fact.supersededBy && f.id !== fact.id)) throw new Error('Invalid superseding fact.');
  }
  for (const event of state.events) {
    if (event.authority === 'authoritative') throw new Error('Campaign events cannot claim mechanical authority.');
    if (event.supersededBy && !state.events.some(e => e.id === event.supersededBy && e.id !== event.id)) throw new Error('Invalid superseding event.');
  }
  for (const records of [state.facts, state.events]) for (const record of records) {
    const seen = new Set<string>(); let current: {id:string;supersededBy:string|null}|undefined = record;
    while (current?.supersededBy) { if (seen.has(current.id)) throw new Error('Cyclic memory supersession.'); seen.add(current.id); current=records.find(r=>r.id===current!.supersededBy); }
  }
  for (const summary of state.summaries) if (summary.eventIds.some(id => !state.events.some(e=>e.id===id))) throw new Error('Summary references unknown events.');
  if (bundle && campaign) {
    if(bundle.chain.id!==campaign.chainId || !bundle.branches.some(b=>b.id===campaign.branchId)) throw new Error('Tracker does not match this campaign.');
    const ws = buildBranchWorkspace(bundle, campaign.branchId);
    if (!ws.jumps.some(j => j.id === state.scene.stamp.jumpId)) throw new Error('Unknown chronology jump.');
    const participating = new Set(ws.participations.filter(p => p.jumpId === state.scene.stamp.jumpId && p.participantKind === 'companion' && p.status === 'active').map(p => p.participantId));
    for (const id of state.scene.presentCompanionIds) if (!participating.has(id)) throw new Error(`Companion ${id} is not active in this jump’s tracker participation.`);
    for (const npc of state.npcs) if (npc.companionId && !ws.companions.some(c => c.id === npc.companionId)) throw new Error('NPC links to an unknown tracker companion.');
  }
}
/** Shared preflight and commit invariant for generated summaries. */
export function summaryEvents(state: CampaignState, eventIds: string[]) {
  const events = eventIds.map(id => state.events.find(e=>e.id===id && !e.supersededBy));
  if (!eventIds.length || new Set(eventIds).size !== eventIds.length || events.some(e=>!e)) throw new Error('Select existing, current events for the summary.');
  return events as CampaignState['events'];
}

export function planTransition(previous: CampaignState, raw: unknown, context: TransitionContext, transitionId: string): TransitionPlan {
  if (!transitionId || !context.campaign.id) throw new Error('A trusted transition and campaign identity are required.');
  const operations = z.array(CampaignOperationSchema).max(context.origin==='model-proposal' ? 100 : 10000).parse(raw);
  const before = StateSchema.parse(previous); const next = structuredClone(before);
  // Tracker selectors cache by object identity. Use a fresh read snapshot so planning depends
  // on the supplied contents, even if an importer/editor reused and changed a bundle object.
  const tracker = 'bundle' in context ? structuredClone(context.bundle) : undefined;
  // Player corrections can repair stale tracker references; validate their final state below.
  if (context.origin === 'model-proposal') {
    if (!context.sourceTurnId) throw new Error('Model provenance requires the actual exchange.');
    validateState(before,tracker,context.campaign);
    const ws = buildBranchWorkspace(tracker!,context.campaign.branchId);
    if (context.bundle.chain.activeBranchId !== context.campaign.branchId || ws.currentJump?.id !== before.scene.stamp.jumpId) throw new Error('Campaign and tracker current jump/branch differ.');
  }
  const created: TransitionPlan['created'] = []; const affected = new Set<string>();
  const local = new Map<string,{kind:RecordKind;id:string}>();
  const resolve = (ref:{id:string}|{local:string}, kind:RecordKind):string => {
    const record = 'local' in ref ? local.get(ref.local) : {kind,id:ref.id};
    if (!record || record.kind !== kind || !next[collections[kind]].some(r=>r.id===record.id)) throw new Error(`Unknown ${kind} reference: ${stableStringify(ref)}`);
    return record.id;
  };
  const identity = (handle:string, kind:RecordKind) => {
    if (local.has(handle)) throw new Error(`Duplicate proposal-local handle: ${handle}`);
    // Length-delimited/escaped components avoid collisions; no UUIDs or clock in planning.
    const id = ['transition',context.campaign.id,transitionId,kind,handle].map(encodeURIComponent).join(':');
    if (Object.values(collections).some(list=>next[list].some(r=>r.id===id))) throw new Error(`Duplicate campaign record ID: ${id}`);
    local.set(handle,{kind,id});created.push({handle,kind,id});affected.add(id);return id;
  };
  const provenance = context.origin === 'model-proposal' ? [context.sourceTurnId] : ['player-declaration'];
  const newMemories: Array<CampaignState['facts'][number]|CampaignState['events'][number]> = [];
  for (const operation of operations) {
    if (context.origin === 'model-proposal' && !ModelOperationSchema.safeParse(operation).success) throw new Error('Model capability cannot use player corrections, deletes, or summary operations.');
    if (context.origin === 'generated-summary' && operation.kind !== 'summary.create') throw new Error('Generated-summary capability only permits summary creation.');
    if (context.origin === 'player-edit' && operation.kind === 'summary.create') throw new Error('Generated summary insertion requires its narrow capability. Use a player summary correction.');
    switch (operation.kind) {
      case 'scene.update':
        // A schema-whitelisted scene fragment, never an arbitrary merge or object path.
        Object.assign(next.scene,operation.value); affected.add('scene'); break;
      case 'scene.advance':
        next.scene.stamp.elapsedMinutes += operation.minutes;
        if (operation.absoluteDate !== undefined) next.scene.stamp.absoluteDate = operation.absoluteDate;
        affected.add('scene');break;
      case 'scene.presence':
        if (operation.npcs !== undefined) next.scene.npcIds = operation.npcs.map(ref=>resolve(ref,'npc'));
        if (operation.companionIds !== undefined) next.scene.presentCompanionIds = [...operation.companionIds];
        affected.add('scene');break;
      case 'npc.create': {
        const id = identity(operation.handle,'npc');
        next.npcs.push(NpcSchema.parse({...operation.value,id}));break;
      }
      case 'npc.update': {
        const id = resolve(operation.npc,'npc');
        Object.assign(next.npcs.find(n=>n.id===id)!,operation.value);affected.add(id);break;
      }
      case 'npc.list': {
        const id = resolve(operation.npc,'npc');const npc = next.npcs.find(n=>n.id===id)!;
        npc[operation.list] = npc[operation.list].filter(value=>!operation.remove.includes(value));
        for (const value of operation.add) if (!npc[operation.list].includes(value)) npc[operation.list].push(value);
        affected.add(id);break;
      }
      case 'npc.events': {
        const id = resolve(operation.npc,'npc'); const npc = next.npcs.find(n=>n.id===id)!;
        for (const ref of operation.events) {const eventId = resolve(ref,'event');if (!npc.eventIds.includes(eventId)) npc.eventIds.push(eventId);}
        affected.add(id);break;
      }
      case 'fact.create':
      case 'event.create': {
        if (context.origin === 'model-proposal' && !['inferred','speculative','campaign-established'].includes(operation.value.authority)) throw new Error('Model cannot assert player, canonical, or mechanical authority.');
        const kind = operation.kind === 'fact.create' ? 'fact' : 'event';
        const id = identity(operation.handle,kind); const stamp = operation.value.stamp ?? structuredClone(next.scene.stamp);
        if (operation.kind === 'fact.create') {
          const fact = FactSchema.parse({...operation.value,id,stamp,sourceIds:provenance});next.facts.push(fact);newMemories.push(fact);
        } else {
          const event = EventSchema.parse({...operation.value,id,stamp,sourceMessageIds:provenance});next.events.push(event);newMemories.push(event);
        }
        break;
      }
      case 'memory.supersede': {
        const id = resolve(operation.record,operation.target), replacementId = resolve(operation.replacement,operation.target);
        const list = operation.target === 'fact' ? next.facts : next.events;
        const target = list.find(r=>r.id===id)!, replacement = list.find(r=>r.id===replacementId)!;
        if (id === replacementId || target.supersededBy || replacement.supersededBy) throw new Error('Supersession requires distinct current records of the same type.');
        if (context.origin === 'model-proposal' && target.authority === 'player-established') throw new Error('Model cannot supersede a player declaration.');
        target.supersededBy = replacementId;affected.add(id);break;
      }
      case 'summary.create': {
        summaryEvents(next,operation.value.eventIds);
        if (stableStringify(operation.value.stamp) !== stableStringify(next.scene.stamp)) throw new Error('Summary chronology changed since generation.');
        const id = identity(operation.handle,'summary');next.summaries.push(SummarySchema.parse({...operation.value,id}));break;
      }
      case 'scene.correct': next.scene = structuredClone(operation.value);affected.add('scene');break;
      case 'npc.correct': {
        const index=next.npcs.findIndex(n=>n.id===operation.value.id);if(index<0)next.npcs.push(operation.value);else next.npcs[index]=operation.value;affected.add(operation.value.id);break;
      }
      case 'fact.correct': {
        const index=next.facts.findIndex(n=>n.id===operation.value.id);if(index<0)next.facts.push(operation.value);else next.facts[index]=operation.value;affected.add(operation.value.id);break;
      }
      case 'event.correct': {
        const index=next.events.findIndex(n=>n.id===operation.value.id);if(index<0)next.events.push(operation.value);else next.events[index]=operation.value;affected.add(operation.value.id);break;
      }
      case 'summary.correct': {
        const index=next.summaries.findIndex(n=>n.id===operation.value.id);if(index<0)next.summaries.push(operation.value);else next.summaries[index]=operation.value;affected.add(operation.value.id);break;
      }
      case 'record.delete': {
        const list = next[collections[operation.target]];const index=list.findIndex(r=>r.id===operation.id);
        if(index<0)throw new Error(`Unknown ${operation.target}: ${operation.id}`);list.splice(index,1);affected.add(operation.id);break;
      }
      case 'records.order': {
        const list = next[collections[operation.target]];
        if (operation.ids.length !== list.length || new Set(operation.ids).size !== list.length || operation.ids.some(id=>!list.some(r=>r.id===id))) throw new Error('Record ordering must name every record exactly once.');
        list.sort((a,b)=>operation.ids.indexOf(a.id)-operation.ids.indexOf(b.id));operation.ids.forEach(id=>affected.add(id));break;
      }
      default: {const unreachable:never=operation;throw new Error(`Unknown operation: ${unreachable}`);}
    }
  }
  if (context.origin === 'model-proposal') for (const memory of newMemories) {
    if (memory.stamp.jumpId !== next.scene.stamp.jumpId) throw new Error('Proposed memory has a different jump.');
    if (memory.stamp.elapsedMinutes > next.scene.stamp.elapsedMinutes) throw new Error('A memory cannot be dated in the future.');
  }
  validateState(next,tracker,context.campaign);
  return TransitionPlanSchema.parse({version:1,id:transitionId,campaignId:context.campaign.id,chainId:context.campaign.chainId,branchId:context.campaign.branchId,
    origin:context.origin,sourceTurnId:context.origin==='model-proposal' ? context.sourceTurnId : null,
    trackerFingerprint:'bundle' in context ? trackerFingerprint(context.bundle) : null,
    operations,before,after:next,created,affectedIds:[...affected].sort(),validation:'valid'});
}

/** Recompute exactly the reviewed plan; never trust a persisted result or rebase a stale plan. */
export function applyTransition(previous: CampaignState, raw: unknown, context: TransitionContext): TransitionPlan {
  const plan = TransitionPlanSchema.parse(raw);
  if (plan.campaignId !== context.campaign.id || plan.chainId !== context.campaign.chainId || plan.branchId !== context.campaign.branchId || plan.origin !== context.origin || plan.sourceTurnId !== (context.origin==='model-proposal' ? context.sourceTurnId : null)) throw new Error('Transition targets a different campaign, turn, or capability.');
  if (stableStringify(previous) !== stableStringify(plan.before)) throw new Error('Campaign state changed since transition preview.');
  if (plan.trackerFingerprint !== ('bundle' in context ? trackerFingerprint(context.bundle) : null)) throw new Error('Tracker changed since transition preview.');
  const recomputed = planTransition(previous,plan.operations,context,plan.id);
  if (stableStringify(recomputed) !== stableStringify(plan)) throw new Error('Transition preview differs from validated operations. Reanalyze before review.');
  return recomputed;
}

/** Lower the existing full-state player editor into explicit corrections/deletions only. */
export function playerEditOperations(previous: CampaignState, raw: unknown): CampaignOperation[] {
  const desired = StateSchema.parse(raw); validateState(desired); const operations:CampaignOperation[]=[];
  if (stableStringify(previous.scene) !== stableStringify(desired.scene)) operations.push({kind:'scene.correct',value:desired.scene});
  for (const kind of Object.keys(collections) as RecordKind[]) {
    const old = previous[collections[kind]], records = desired[collections[kind]];
    for (const record of old) if (!records.some(r=>r.id===record.id)) operations.push({kind:'record.delete',target:kind,id:record.id});
    for (const record of records) if (stableStringify(old.find(r=>r.id===record.id)) !== stableStringify(record)) operations.push(PlayerOperationSchema.parse({kind:`${kind}.correct`,value:record}));
    const naturalOrder = [...old.filter(r=>records.some(n=>n.id===r.id)),...records.filter(r=>!old.some(n=>n.id===r.id))].map(r=>r.id);
    if (stableStringify(naturalOrder) !== stableStringify(records.map(r=>r.id))) operations.push({kind:'records.order',target:kind,ids:records.map(r=>r.id)});
  }
  return operations;
}
