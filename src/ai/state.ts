import type { NativeChainBundle } from '../domain/save';
import { buildBranchWorkspace } from '../domain/chain/selectors';
import { migrateCampaign, ProposalSchema, StateSchema, stableStringify, type Campaign, type CampaignState, type Proposal } from './schema';

export function validateState(state: CampaignState, bundle?: NativeChainBundle, campaign?: Campaign) {
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
export function applyProposal(previous: CampaignState, raw: unknown, bundle: NativeChainBundle, campaign: Campaign, sourceMessageIds: string[]): CampaignState {
  const proposal = ProposalSchema.parse(raw); const next: CampaignState = structuredClone(previous);
  for (const change of proposal.changes) {
    if (change.kind === 'scene') {
      if (change.value.stamp.jumpId !== previous.scene.stamp.jumpId) throw new Error('Model proposals cannot change jumps. Use the scene editor.');
      if (change.value.stamp.elapsedMinutes < previous.scene.stamp.elapsedMinutes) throw new Error('Model proposals cannot reverse chronology. Use rollback.');
      next.scene = change.value;
    } else if (change.kind === 'npc') {
      const existing = next.npcs.find(n => n.id === change.value.id);
      if (existing?.companionId !== undefined && existing.companionId !== change.value.companionId) throw new Error('Model cannot reassign companion identity.');
      next.npcs = [...next.npcs.filter(n => n.id !== change.value.id), change.value];
    } else if (change.kind === 'fact' || change.kind === 'event') {
      const value = change.value;
      if (!['inferred', 'speculative', 'campaign-established'].includes(value.authority)) throw new Error('Model cannot assert player, canonical, or mechanical authority.');
      if (value.stamp.jumpId !== next.scene.stamp.jumpId) throw new Error('Proposed memory has a different jump.');
      const list = change.kind === 'fact' ? next.facts : next.events;
      if (list.some(r => r.id === value.id)) throw new Error('Existing memories are immutable; supersede them with a new record.');
      if (change.kind === 'fact') {
        if (!change.value.sourceIds.length || change.value.sourceIds.some(id => !sourceMessageIds.includes(id))) throw new Error('Fact provenance must reference this exchange.');
        next.facts.push(change.value);
      } else {
        if (!change.value.sourceMessageIds.length || change.value.sourceMessageIds.some(id => !sourceMessageIds.includes(id))) throw new Error('Event provenance must reference this exchange.');
        next.events.push(change.value);
      }
    } else {
      const list = change.target === 'fact' ? next.facts : next.events;
      const target = list.find(r => r.id === change.id); const replacement = list.find(r => r.id === change.replacementId);
      if (!target || !replacement || target.id === replacement.id || replacement.supersededBy) throw new Error('Supersession needs an existing target and a current replacement.');
      if (target.authority === 'player-established') throw new Error('Model cannot supersede a player declaration.');
      target.supersededBy = replacement.id;
    }
  }
  for (const change of proposal.changes) if ((change.kind === 'fact' || change.kind === 'event') && change.value.stamp.elapsedMinutes > next.scene.stamp.elapsedMinutes) throw new Error('A memory cannot be dated in the future.');
  validateState(next, bundle, campaign); return next;
}
export function auditChange(campaign: Campaign, next: CampaignState, action: string, turnId: string | null, id: string) {
  campaign.audit.push({id, at:new Date().toISOString(), action, turnId, before:structuredClone(campaign.state), after:structuredClone(next), rolledBack:false});
  campaign.state = next;
}
export function rollbackLatest(campaign: Campaign) {
  const audit = [...campaign.audit].reverse().find(a => !a.rolledBack);
  if (!audit) throw new Error('No state change to roll back.');
  if (stableStringify(campaign.state) !== stableStringify(audit.after)) throw new Error('State has diverged from the audit entry.');
  campaign.state = structuredClone(audit.before); audit.rolledBack = true;
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
export function proposalInstructions(sourceId: string, state: CampaignState) {
  return `Analyze the exchange separately from narration. Return ONLY a JSON object {"rationale":string,"changes":array}. No mechanical tracker edits are allowed. Empty changes are valid. Propose only supported changes; uncertain information stays inferred/speculative. Do not convert NPC beliefs into facts. Preserve unmodified scene/NPC fields. All changes require player review.
Allowed changes: {kind:"scene",value:<complete scene>}, {kind:"npc",value:<complete NPC>}, {kind:"fact",value:<new fact>}, {kind:"event",value:<new event>}, {kind:"supersede",target:"fact"|"event",id:string,replacementId:string}.
Scene shape: ${stableStringify(state.scene)}.
NPC shape: {id,name,setting,aliases:[],companionId:null,background,location,relationship,opinions:[],beliefs:[],knowledge:[],beliefsAboutJumper:[],suspicions:[],goals:[],resources:[],plans:[],eventIds:[],lastInteraction:null}. All unnamed scalar fields are strings.
Fact: {id,key,text,authority:"campaign-established"|"inferred"|"speculative",sourceIds:["${sourceId}"],entities:[],tags:[],location,stamp:{jumpId,elapsedMinutes,absoluteDate:""},supersededBy:null}.
Event: {id,stamp:{jumpId,elapsedMinutes,absoluteDate:""},location,participants:[],entities:[],summary,facts:[],relationshipChanges:[],npcBeliefChanges:[],hooks:[],tags:[],sourceMessageIds:["${sourceId}"],authority:"campaign-established"|"inferred"|"speculative",supersededBy:null}.
Use new unique IDs for new records. Never overwrite past memories. Use the exchange ID ${sourceId} as provenance. Do not advance to another jump or reverse time.`;
}
