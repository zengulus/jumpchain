import { useMemo, useState } from 'react';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { downloadText } from '../../utils/download';
import { WorkspaceModuleHeader } from '../workspace/shared';
import { useChainWorkspace } from '../workspace/useChainWorkspace';
import { buildExportIR, type ExportScope } from './exportModel';
import { renderBBCode, renderMarkdown } from './renderers';

type ExportFormat = 'markdown' | 'bbcode';

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'jumpchain-export';
}

function getScopeKey(scope: ExportScope) {
  return scope.kind === 'branch' ? 'branch' : `${scope.kind}:${scope.kind === 'jump' ? scope.jumpId : scope.participantId}`;
}

function readScopeKey(value: string, fallback: ExportScope): ExportScope {
  if (value === 'branch') {
    return { kind: 'branch' };
  }

  const [kind, id] = value.split(':');
  if (kind === 'jump' && id) {
    return { kind: 'jump', jumpId: id };
  }

  if (kind === 'participant' && id) {
    return { kind: 'participant', participantId: id };
  }

  return fallback;
}

export function ExportPage() {
  const { simpleMode } = useUiPreferences();
  const { workspace } = useChainWorkspace();
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [scope, setScope] = useState<ExportScope>({ kind: 'branch' });
  const ir = useMemo(() => buildExportIR(workspace, scope), [scope, workspace]);
  const output = useMemo(() => (format === 'markdown' ? renderMarkdown(ir) : renderBBCode(ir)), [format, ir]);
  const participantOptions = [
    ...workspace.jumpers.map((jumper) => ({ id: jumper.id, label: jumper.name, kind: 'jumper' })),
    ...workspace.companions.map((companion) => ({ id: companion.id, label: companion.name, kind: 'companion' })),
  ];
  const extension = format === 'markdown' ? 'md' : 'txt';

  return (
    <div className="stack">
      <WorkspaceModuleHeader
        title="Share Export"
        description={
          simpleMode
            ? 'Create a readable copy of this branch for notes, forums, or review.'
            : 'Generate Markdown or BBCode from the active branch, a single participant, or a single jump.'
        }
        badge={format === 'markdown' ? 'Markdown' : 'BBCode'}
      />

      <section className="card stack">
        <div className="field-grid field-grid--two">
          <label className="field">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="markdown">Markdown</option>
              <option value="bbcode">BBCode</option>
            </select>
          </label>

          <label className="field">
            <span>Scope</span>
            <select value={getScopeKey(scope)} onChange={(event) => setScope(readScopeKey(event.target.value, { kind: 'branch' }))}>
              <option value="branch">Active branch</option>
              {workspace.jumps.map((jump) => (
                <option key={jump.id} value={`jump:${jump.id}`}>
                  Jump: {jump.title}
                </option>
              ))}
              {participantOptions.map((participant) => (
                <option key={participant.id} value={`participant:${participant.id}`}>
                  {participant.kind}: {participant.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="actions">
          <button
            className="button"
            type="button"
            onClick={() => downloadText(`${toFileSlug(workspace.chain.title)}-${toFileSlug(ir.scopeLabel)}.${extension}`, output)}
          >
            Download {format === 'markdown' ? 'Markdown' : 'BBCode'}
          </button>
        </div>
      </section>

      <section className="card stack">
        <div className="section-heading">
          <h3>Preview</h3>
          <span className="pill">{ir.jumps.length} jumps</span>
        </div>
        <textarea className="json-editor" rows={28} readOnly value={output} />
      </section>
    </div>
  );
}
