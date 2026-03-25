import { useEffect, useState, type ReactNode } from 'react';
import { createJsonText } from './records';

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
