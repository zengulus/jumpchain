import type { ExportIR, ExportParticipation, ExportSelection } from './exportModel';

function clean(value: string) {
  return value.replace(/\s+\n/g, '\n').trim();
}

function mdSelection(selection: ExportSelection) {
  const tags = selection.tags.length > 0 ? ` _${selection.tags.join(', ')}_` : '';
  const description = selection.description.trim() ? `\n  ${selection.description.trim().replace(/\n/g, '\n  ')}` : '';
  const rewards = selection.rewards.length > 0 ? `\n  Rewards: ${selection.rewards.join('; ')}` : '';
  return `- **${selection.title}** (${selection.cost})${tags}${description}${rewards}`;
}

function bbSelection(selection: ExportSelection) {
  const tags = selection.tags.length > 0 ? ` [i]${selection.tags.join(', ')}[/i]` : '';
  const description = selection.description.trim() ? `\n  ${selection.description.trim().replace(/\n/g, '\n  ')}` : '';
  const rewards = selection.rewards.length > 0 ? `\n  Rewards: ${selection.rewards.join('; ')}` : '';
  return `[*][b]${selection.title}[/b] (${selection.cost})${tags}${description}${rewards}`;
}

function renderMdSection(title: string, items: string[]) {
  return items.length > 0 ? `\n### ${title}\n${items.join('\n')}\n` : '';
}

function renderBbSection(title: string, items: string[]) {
  return items.length > 0 ? `\n[b]${title}[/b]\n[list]\n${items.join('\n')}\n[/list]\n` : '';
}

function mdParticipation(participation: ExportParticipation) {
  return clean(`
## ${participation.participantName}
${participation.origins.length > 0 ? `\n### Beginnings\n${participation.origins.map((line) => `- ${line}`).join('\n')}\n` : ''}
${renderMdSection('Purchases', participation.purchases.map(mdSelection))}
${renderMdSection('Drawbacks', participation.drawbacks.map(mdSelection))}
${renderMdSection('Retained Drawbacks', participation.retainedDrawbacks.map(mdSelection))}
${participation.narratives.length > 0 ? renderMdSection('Narratives', participation.narratives.map((line) => `- ${line}`)) : ''}
${participation.notes.trim() ? `\n### Notes\n${participation.notes.trim()}\n` : ''}
`);
}

function bbParticipation(participation: ExportParticipation) {
  return clean(`
[h2]${participation.participantName}[/h2]
${participation.origins.length > 0 ? `\n[b]Beginnings[/b]\n[list]\n${participation.origins.map((line) => `[*]${line}`).join('\n')}\n[/list]\n` : ''}
${renderBbSection('Purchases', participation.purchases.map(bbSelection))}
${renderBbSection('Drawbacks', participation.drawbacks.map(bbSelection))}
${renderBbSection('Retained Drawbacks', participation.retainedDrawbacks.map(bbSelection))}
${participation.narratives.length > 0 ? renderBbSection('Narratives', participation.narratives.map((line) => `[*]${line}`)) : ''}
${participation.notes.trim() ? `\n[b]Notes[/b]\n${participation.notes.trim()}\n` : ''}
`);
}

export function renderMarkdown(ir: ExportIR) {
  return clean(`# ${ir.chainTitle}

Branch: ${ir.branchTitle}
Scope: ${ir.scopeLabel}
Generated: ${ir.generatedAt}

${ir.jumps
  .map((jump) => clean(`## ${jump.title}

Duration: ${jump.duration}

${jump.participations.map(mdParticipation).join('\n\n')}`))
  .join('\n\n')}
`) + '\n';
}

export function renderBBCode(ir: ExportIR) {
  return clean(`[h1]${ir.chainTitle}[/h1]

[b]Branch:[/b] ${ir.branchTitle}
[b]Scope:[/b] ${ir.scopeLabel}
[b]Generated:[/b] ${ir.generatedAt}

${ir.jumps
  .map((jump) => clean(`[h2]${jump.title}[/h2]

[b]Duration:[/b] ${jump.duration}

${jump.participations.map(bbParticipation).join('\n\n')}`))
  .join('\n\n')}
`) + '\n';
}
