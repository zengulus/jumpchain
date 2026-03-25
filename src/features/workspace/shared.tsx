import { useEffect, useState, type ReactNode } from 'react';
import { createJsonText } from './records';
import type { AutosaveStatus } from './useAutosaveRecord';

export interface StatusNotice {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

export function WorkspaceModuleHeader(props: {
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: string;
}) {
  return (
    <div className="workspace-module-header">
      <div className="stack stack--compact">
        <div className="section-heading">
          <h2>{props.title}</h2>
          {props.badge ? <span className="pill">{props.badge}</span> : null}
        </div>
        <p>{props.description}</p>
      </div>
      {props.actions ? <div className="actions">{props.actions}</div> : null}
    </div>
  );
}

export function EmptyWorkspaceCard(props: { title: string; body: string; action?: ReactNode }) {
  return (
    <section className="card stack">
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      {props.action ? <div className="actions">{props.action}</div> : null}
    </section>
  );
}

export function StatusNoticeBanner({ notice }: { notice: StatusNotice | null }) {
  if (!notice) {
    return null;
  }

  return <div className={`status status--${notice.tone}`}>{notice.message}</div>;
}

export function AutosaveStatusIndicator({ status }: { status: AutosaveStatus }) {
  if (status.phase === 'idle') {
    return null;
  }

  if (status.phase === 'error') {
    return (
      <div className="autosave-status autosave-status--error" role="alert">
        Autosave failed: {status.message ?? 'Unable to persist the latest edits.'}
      </div>
    );
  }

  if (status.phase === 'dirty') {
    return (
      <div className="autosave-status autosave-status--dirty" role="status">
        Changes pending
      </div>
    );
  }

  if (status.phase === 'saving') {
    return (
      <div className="autosave-status autosave-status--saving" role="status">
        Saving...
      </div>
    );
  }

  return (
    <div className="autosave-status autosave-status--saved" role="status">
      Saved
    </div>
  );
}

export function AdvancedJsonDetails(props: {
  summary?: string;
  badge?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="details-panel">
      <summary className="details-panel__summary">
        <span>{props.summary ?? 'Advanced JSON'}</span>
        <span className="pill">{props.badge ?? 'raw data'}</span>
      </summary>
      <div className="details-panel__body stack stack--compact">
        {props.hint ? <p className="field-hint">{props.hint}</p> : null}
        {props.children}
      </div>
    </details>
  );
}

export function JsonEditorField(props: {
  label: string;
  value: unknown;
  rows?: number;
  hint?: string;
  onValidChange: (value: unknown) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(createJsonText(props.value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(createJsonText(props.value));
    setError(null);
  }, [props.value]);

  async function handleChange(nextValue: string) {
    setDraft(nextValue);

    try {
      const parsed = JSON.parse(nextValue);
      setError(null);
      await props.onValidChange(parsed);
    } catch {
      setError('Waiting for valid JSON before this field can autosave.');
    }
  }

  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea
        className="json-editor"
        rows={props.rows ?? 8}
        value={draft}
        onChange={(event) => void handleChange(event.target.value)}
      />
      {props.hint ? <small className="field-hint">{props.hint}</small> : null}
      {error ? <small className="field-hint field-hint--error">{error}</small> : null}
    </label>
  );
}
