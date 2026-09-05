import type { NativeChainBundle } from '../domain/save';
import { buildBranchWorkspace, getEffectiveCurrentJumpState } from '../domain/chain/selectors';
import type { Campaign, CompiledContext, ContextAuthority, ContextSalience, ProviderConfig } from './schema';
import { fingerprint, stableStringify } from './schema';
import { tokens, type Retrieved } from './retrieval';

// UTF-8 byte count is a conservative upper bound for typical local byte-fallback tokenizers.
// Reserve additional chat-template overhead; no guessed chars/4 budget silently overruns context.
export function estimateTokens(text: string): number { return new TextEncoder().encode(text).length; }
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
  const context: CompiledContext = { messages: [], layers: [], estimatedTokens: 0, inputBudget: provider.contextWindow-provider.maxOutput-512, omittedIds: [], diagnostics: [...diagnostics, 'Conservative UTF-8 token bound; actual model token counts may be lower.'], trackerFingerprint: trackerFingerprint(bundle) };
  interface LayerOptions { salience?: ContextSalience; authority?: ContextAuthority; required?: boolean; allowance?: number }
  const add = (name: string, value: unknown, ids: string[] = [], opts: LayerOptions = {}) => {
    const { salience = 'relevant', authority = null, required = false, allowance = Infinity } = opts;
    const content = typeof value === 'string' ? value : stableStringify(value);
    const count = estimateTokens(`${name}\n${content}`)+32;
    if (context.estimatedTokens+count > context.inputBudget || count > allowance) {
      if (required) throw new Error(`Context exceeded budget in ${name}. Increase context window, reduce output, or shorten scene/rules/action. Required restrictions are never silently dropped.`);
      context.omittedIds.push(...ids); return false;
    }
    context.layers.push({name, content, sourceIds: ids, estimatedTokens: count, salience, authority}); context.estimatedTokens += count; return true;
  };
  // Reserve action and hard constraints before relevance-selected material.
  // Presentation/configuration directives: salient, but not factual claims about the world.
  add('GM system rules', settings.gmPrompt, [], {salience: 'directive', required: true});
  add('Campaign style and rules', { ...settings, gmPrompt: undefined }, [], {salience: 'directive', required: true});
  for (const r of records.filter(r => r.required)) add(`Authoritative ${r.category}`, { id: r.id, owner: r.owner, authority: 'authoritative', value: r.record }, [r.id], {salience: 'required', authority: 'authoritative', required: true});
  add('Current jump', {id: campaign.state.scene.stamp.jumpId, title: bundle.jumps.find(j => j.id === campaign.state.scene.stamp.jumpId)?.title, documents: bundle.jumpDocs.filter(d => bundle.jumps.find(j => j.id === campaign.state.scene.stamp.jumpId)?.jumpDocIds.includes(d.id)).map(d => ({id:d.id,title:d.title,author:d.author,source:d.source,notes:d.notes}))}, [], {salience: 'required', authority: 'authoritative', required: true});
  add('Current scene facts', campaign.state.scene, [], {salience: 'required', authority: 'campaign-established', required: true});
  add('Current user action', action, [], {salience: 'directive', required: true});
  // NPC state is first-class. Never serialize beliefs as reality.
  // Authority is 'inferred' so epistemic content can never outrank sources or mechanics in a conflict.
  for (const npc of campaign.state.npcs.filter(n => campaign.state.scene.npcIds.includes(n.id) || campaign.state.scene.presentCompanionIds.includes(n.companionId ?? '') || tokens(`${n.name} ${n.aliases.join(' ')}`).some(t => tokens(action).includes(t)))) add('NPC beliefs and knowledge (not objective reality)', npc, [npc.id], {salience: 'required', authority: 'inferred', required: true});
  const terms = new Set(tokens(`${action} ${campaign.state.scene.location} ${campaign.state.scene.threads.join(' ')}`));
  const optional = records.filter(r => !r.required).map(r => ({r, score: tokens(r.text).reduce((n,t) => n+(terms.has(t) ? 1 : 0),0) + (campaign.state.scene.presentCompanionIds.includes(r.owner) ? 2 : 0) })).sort((a,b) => b.score-a.score || a.r.id.localeCompare(b.r.id));
  let mechanicsLeft = settings.mechanicsBudget;
  for (const {r} of optional) {
    const before = context.estimatedTokens;
    add(`Authoritative ${r.category}`, {id: r.id, owner: r.owner, authority: r.category === 'player-note' ? 'player-established' : 'authoritative', value: r.record}, [r.id], {salience: 'relevant', authority: r.category === 'player-note' ? 'player-established' : 'authoritative', allowance: mechanicsLeft});
    mechanicsLeft -= context.estimatedTokens-before;
  }
  for (const r of retrieved) add(r.record.sourceType === 'world' ? 'Retrieved world lore' : 'Retrieved campaign memories', { ...r.record, selectionReason: r.reason }, [r.record.id], {salience: 'relevant', authority: r.record.authority});
  let chatLeft = settings.chatBudget;
  const history: typeof context.messages = [];
  for (const turn of [...campaign.turns].reverse().filter(t => t.status === 'complete' && t.inContinuity)) {
    const count = estimateTokens(turn.action)+estimateTokens(turn.narrative)+64;
    if (count > chatLeft || context.estimatedTokens+count > context.inputBudget) { context.omittedIds.push(turn.id); break; }
    chatLeft -= count; context.estimatedTokens += count;
    history.unshift({role:'user',content:turn.action}, {role:'assistant',content:turn.narrative});
  }
  const system = context.layers.filter(l => l.name !== 'Current user action').map(l => `${l.name}\n${l.content}`).join('\n\n');
  context.messages = [{role:'system',content:system}, ...history, {role:'user',content:action}];
  // Recent conversation is tail-fill material: lowest-salience ('background') and not itself a
  // factual claim (user actions are directives, narration is provisional until reviewed).
  context.layers.push({name:'Recent conversation',content:stableStringify(history),sourceIds:[],estimatedTokens:settings.chatBudget-chatLeft,salience:'background',authority:null});
  if (context.omittedIds.length) context.diagnostics.push(`${context.omittedIds.length} records omitted by budget; omission does not imply lack of ability.`);
  return context;
}
