import type { NativeChainBundle } from '../domain/save';
import { buildBranchWorkspace, getEffectiveCurrentJumpState } from '../domain/chain/selectors';
import type { Campaign, CompiledContext, ContextAuthority, ContextDomain, ContextSalience, ProviderConfig } from './schema';
import { fingerprint, stableStringify } from './schema';
import { tokens, narrationLoreQuery, type Retrieved } from './retrieval';
import { estimateTokens, planContext, type ContextCandidate } from './planner';
export { estimateTokens } from './budget';

export function trackerFingerprint(bundle: NativeChainBundle) {
  const { snapshots: _snapshots, attachments: _attachments, importReports: _reports, ...state } = bundle;
  return fingerprint(state);
}
export interface MechanicalRecord { id: string; owner: string; category: string; record: unknown; text: string; required: boolean }
export function mechanicalRecords(bundle: NativeChainBundle, campaign: Campaign): MechanicalRecord[] {
  const ws = buildBranchWorkspace(bundle, campaign.branchId); const jump = ws.currentJump;
  if (!jump || jump.id !== campaign.state.scene.stamp.jumpId) throw new Error('Campaign scene and tracker current jump differ. Update the scene chronology or select the matching tracker jump.');
  const result: MechanicalRecord[] = [];
  const add = (id: string, owner: string, category: string, record: unknown, required = false) => result.push({ id, owner, category, record, text: stableStringify(record), required });
  const current = ws.participations.filter(p => p.jumpId === jump.id && p.status === 'active');
  const present = new Set([...jump.participantJumperIds, ...current.map(p => p.participantId)]);
  const restrictionMetadata = bundle.chain.importSourceMetadata.masterBuildRestrictions;
  add('current-rules', bundle.chain.id, 'rules', { ...getEffectiveCurrentJumpState(ws), chainSettings: bundle.chain.chainSettings, masterBuildRestrictions: restrictionMetadata, houseRules: ws.houseRuleProfiles }, true);
  for (const jumper of ws.jumpers) if (present.has(jumper.id)) add(jumper.id, jumper.id, 'character', jumper, true);
  for (const companion of ws.companions) if (present.has(companion.id)) add(companion.id, companion.id, 'companion', { ...companion, scenePresent: campaign.state.scene.presentCompanionIds.includes(companion.id) }, true);
  for (const participation of ws.participations) {
    const originJump = ws.jumps.find(j => j.id === participation.jumpId);
    if (!originJump || originJump.orderIndex > jump.orderIndex || !['active','completed'].includes(participation.status) || !present.has(participation.participantId)) continue;
    if (originJump.id === jump.id) add(participation.id, participation.participantId, 'participation', { id: participation.id, status: participation.status, origins: participation.origins, budgets: participation.budgets, notes: participation.notes, narratives: participation.narratives, altForms: participation.altForms, supplementPurchases: participation.supplementPurchases, supplementInvestments: participation.supplementInvestments, drawbackOverrides: participation.drawbackOverrides }, true);
    participation.purchases.forEach((selection, i) => {
      if (selection.mergedIntoId) return;
      const template = ws.jumpDocs.find(d => d.id === selection.sourceJumpDocId)?.purchases.find(p => p.id === selection.sourceTemplateId);
      if (template?.temporary && originJump.id !== jump.id) return;
      add(`${participation.id}/purchase/${selection.id ?? i}`, participation.participantId, 'ability', { participationId: participation.id, jumpId: participation.jumpId, selection, temporary: template?.temporary ?? 'unspecified' });
    });
    if (originJump.id === jump.id) for (const [i, d] of [...participation.drawbacks, ...participation.retainedDrawbacks].entries()) add(`${participation.id}/drawback/${d.id ?? i}`, participation.participantId, 'drawback', d, true);
  }
  for (const effect of ws.effects) {
    const applies = ['chain', 'branch', 'global'].includes(effect.scopeType) || present.has(effect.ownerEntityId) || effect.ownerEntityId === jump.id || current.some(p => p.id === effect.ownerEntityId);
    if (applies && effect.state !== 'resolved' && effect.state !== 'inactive') add(effect.id, effect.ownerEntityId, effect.category, effect, effect.category === 'drawback' || effect.category === 'rule');
  }
  for (const profile of ws.bodymodProfiles) if (present.has(profile.jumperId)) {
    const { iconicSelections, forms, features, importSourceMetadata: _metadata, ...base } = profile;
    add(profile.id, profile.jumperId, 'bodymod', base);
    iconicSelections.forEach((r, i) => add(`${profile.id}/iconic/${i}`, profile.jumperId, 'bodymod', r));
    forms.forEach((r, i) => add(`${profile.id}/form/${i}`, profile.jumperId, 'bodymod', r));
    features.forEach((r, i) => add(`${profile.id}/feature/${i}`, profile.jumperId, 'bodymod', r));
  }
  for (const note of ws.notes) add(note.id, note.ownerEntityId, 'player-note', note);
  return result;
}
export function compileContext(bundle: NativeChainBundle, campaign: Campaign, action: string, provider: ProviderConfig, retrieved: Retrieved[] = [], diagnostics: string[] = []): CompiledContext {
  if (bundle.chain.id !== campaign.chainId || bundle.chain.activeBranchId !== campaign.branchId) throw new Error('Campaign belongs to a different tracker chain or branch.');
  const records = mechanicalRecords(bundle, campaign); const settings = campaign.settings;
  const candidates: ContextCandidate[] = [];
  interface LayerOptions { salience?: ContextSalience; authority?: ContextAuthority; domain: ContextDomain; required?: boolean; relevance?: number; pool?: string; signal?: string; sourceClass?: string; section?: string }
  const add = (name: string, value: unknown, ids: string[] = [], opts: LayerOptions) => {
    const content = typeof value === 'string' ? value : stableStringify(value);
    candidates.push({id: `${name}/${ids.join('/')}`, name, content, sourceIds:ids,
      estimatedTokens:estimateTokens(`${name}\n${content}`)+32,
      salience:opts.salience ?? 'relevant', authority:opts.authority ?? null, domain:opts.domain,
      mandatory:opts.required ?? false, relevance:opts.relevance ?? 0, pool:opts.pool, section:opts.section ?? 'system',
      signal:opts.signal ?? 'current tracker/campaign context', sourceClass:opts.sourceClass ?? 'tracker-campaign'});
  };
  // Reserve action and hard constraints before relevance-selected material.
  // Presentation/configuration directives: salient, but not factual claims about the world.
  add('GM system rules', settings.gmPrompt, [], {salience: 'directive', authority: null, domain: 'directive', required: true});
  add('Campaign style and rules', { ...settings, gmPrompt: undefined }, [], {salience: 'directive', authority: null, domain: 'directive', required: true});
  for (const r of records.filter(r => r.required)) add(`Authoritative ${r.category}`, { id: r.id, owner: r.owner, authority: 'authoritative', value: r.record }, [r.id], {salience: 'required', authority: 'authoritative', domain: 'mechanics', required: true});
  // Current jump is tracker/jump configuration (ids, titles, document metadata), not descriptive lore.
  add('Current jump', {id: campaign.state.scene.stamp.jumpId, title: bundle.jumps.find(j => j.id === campaign.state.scene.stamp.jumpId)?.title, documents: bundle.jumpDocs.filter(d => bundle.jumps.find(j => j.id === campaign.state.scene.stamp.jumpId)?.jumpDocIds.includes(d.id)).map(d => ({id:d.id,title:d.title,author:d.author,source:d.source,notes:d.notes}))}, [], {salience: 'required', authority: 'authoritative', domain: 'mechanics', required: true});
  add('Current scene facts', campaign.state.scene, [], {salience: 'required', authority: 'campaign-established', domain: 'world-state', required: true});
  add('Current user action', action, [], {salience: 'directive', authority: null, domain: 'player-action', required: true, section:'action'});
  // NPC state is first-class and split by claim kind. Selection is unchanged: present in the
  // scene, linked to a present companion, or explicitly referenced by the current action.
  const selectedNpcs = campaign.state.npcs.filter(n => campaign.state.scene.npcIds.includes(n.id) || campaign.state.scene.presentCompanionIds.includes(n.companionId ?? '') || tokens(`${n.name} ${n.aliases.join(' ')}`).some(t => tokens(action).includes(t)));
  for (const npc of selectedNpcs) {
    // Layer 1 — NPC campaign/objective state: reviewed claims about established campaign reality
    // (identity, location, relationship, resources, current goals/plans, event links).
    add('NPC campaign state', {
      id: npc.id, name: npc.name, aliases: npc.aliases, setting: npc.setting, companionId: npc.companionId,
      background: npc.background, location: npc.location, relationship: npc.relationship,
      goals: npc.goals, plans: npc.plans, resources: npc.resources, eventIds: npc.eventIds,
      lastInteraction: npc.lastInteraction,
    }, [npc.id], {salience: 'required', authority: 'campaign-established', domain: 'world-state', required: true});
    // Layer 2 — NPC epistemic/subjective state: "the NPC believes/knows/suspects X" is itself
    // campaign-established, but its npc-epistemic domain prevents it from competing as objective
    // world truth: it never claims "X is true". Omitted entirely when empty.
    const epistemic = { beliefs: npc.beliefs, knowledge: npc.knowledge, beliefsAboutJumper: npc.beliefsAboutJumper, suspicions: npc.suspicions, opinions: npc.opinions };
    if ([...epistemic.beliefs, ...epistemic.knowledge, ...epistemic.beliefsAboutJumper, ...epistemic.suspicions, ...epistemic.opinions].length > 0) add('NPC beliefs and knowledge (not objective reality)', epistemic, [npc.id], {salience: 'required', authority: 'campaign-established', domain: 'npc-epistemic', required: true});
  }
  // Same canonical scene-aware query the lore/memory retrieval path builds, so mechanics-pool
  // salience and retrieval admission read the scene consistently. Duplicates nothing.
  const terms = new Set(tokens(narrationLoreQuery(action, campaign.state.scene)));
  const optional = records.filter(r => !r.required).map(r => ({r, score: tokens(r.text).reduce((n,t) => n+(terms.has(t) ? 1 : 0),0) + (campaign.state.scene.presentCompanionIds.includes(r.owner) ? 2 : 0) }));
  for (const {r, score} of optional) {
    // Player notes are player-authored tracker records (player-established), not mechanical
    // claims; their content asserts world/character facts, so they carry world-state domain.
    add(`Authoritative ${r.category}`, {id: r.id, owner: r.owner, authority: r.category === 'player-note' ? 'player-established' : 'authoritative', value: r.record}, [r.id], {salience: 'relevant', authority: r.category === 'player-note' ? 'player-established' : 'authoritative', domain: r.category === 'player-note' ? 'world-state' : 'mechanics', pool: 'mechanics', relevance:score, signal:'lexical overlap and scene companion presence'});
  }
  // Small deterministic domain mapping: world lore and reviewed memory records (facts/events) claim
  // objective reality; summaries are inferred narrative material. Authority comes from the record.
  for (const r of retrieved) add(r.record.sourceType === 'world' ? 'Retrieved world lore' : 'Retrieved campaign memories', { ...r.record, selectionReason: r.reason }, [r.record.id], {salience: 'relevant', authority: r.record.authority, domain: r.record.sourceType === 'summary' ? 'narrative-history' : 'world-state', relevance:r.score, signal:r.reason, sourceClass:r.record.sourceType, pool:r.record.sourceType === 'world' ? 'lore' : 'memory'});
  campaign.turns.forEach((turn, sequence) => {
    if (turn.status !== 'complete' || !turn.inContinuity) return;
    candidates.push({id:`history/${turn.id}`,name:'Recent conversation',content:stableStringify([{role:'user',content:turn.action},{role:'assistant',content:turn.narrative}]),
      sourceIds:[turn.id],estimatedTokens:estimateTokens(turn.action)+estimateTokens(turn.narrative)+64,
      salience:'background',authority:null,domain:'narrative-history',mandatory:false,relevance:0,signal:'recent continuity exchange',sourceClass:'conversation',pool:'chat',section:'history',sequence});
  });
  const plan = planContext(candidates, provider, {sections:['system','history','action'],pools:{mechanics:{tokens:settings.mechanicsBudget},chat:{tokens:settings.chatBudget,tail:true},lore:{count:settings.loreDepth},memory:{count:settings.memoryDepth}}});
  const history = plan.selected.filter(c => c.pool === 'chat').flatMap(c => JSON.parse(c.content) as CompiledContext['messages']);
  const layers = plan.selected.filter(c => c.pool !== 'chat').map(({id:_id,relevance:_relevance,signal:_signal,sourceClass:_sourceClass,pool:_pool,sequence:_sequence,section:_section,...layer}) => layer);
  const system = layers.filter(l => l.name !== 'Current user action').map(l => `${l.name}\n${l.content}`).join('\n\n');
  layers.push({name:'Recent conversation',content:stableStringify(history),sourceIds:plan.selected.filter(c=>c.pool==='chat').flatMap(c=>c.sourceIds),estimatedTokens:plan.selected.filter(c=>c.pool==='chat').reduce((n,c)=>n+c.estimatedTokens,0),salience:'background',authority:null,domain:'narrative-history',mandatory:false});
  const omittedIds = plan.decisions.filter(d=>!d.included).flatMap(d=>d.candidate.sourceIds);
  return {messages:[{role:'system',content:system},...history,{role:'user',content:action}], layers,
    estimatedTokens:plan.estimatedTokens,inputBudget:plan.inputBudget,omittedIds,plan,
    diagnostics:[...diagnostics,'Conservative UTF-8 token bound; actual model token counts may be lower.',...(omittedIds.length ? [`${omittedIds.length} records omitted by budget; omission does not imply lack of ability.`] : [])],trackerFingerprint:trackerFingerprint(bundle)};
}
