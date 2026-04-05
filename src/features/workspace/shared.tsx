import { cloneElement, useCallback, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { useUiPreferences } from '../../app/UiPreferencesContext';
import { createJsonText } from './records';
import type { AutosaveStatus } from './useAutosaveRecord';

export interface StatusNotice {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

export type ReadinessTone = 'start' | 'core' | 'optional' | 'advanced';

const READINESS_LABELS: Record<ReadinessTone, string> = {
  start: 'Start here',
  core: 'Core setup',
  optional: 'Optional later',
  advanced: 'Advanced rules',
};

export function WorkspaceModuleHeader(props: {
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: string;
}) {
  return (
    <div className="workspace-module-header">
      <div className="stack stack--compact workspace-module-header__copy">
        <div className="section-heading">
          <h2>{props.title}</h2>
          {props.badge ? <span className="pill">{props.badge}</span> : null}
        </div>
        <p>{props.description}</p>
      </div>
      {props.actions ? <div className="actions workspace-module-header__actions">{props.actions}</div> : null}
    </div>
  );
}

export function WorkspaceFocusBar(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  aside?: ReactNode;
}) {
  const metaItems = props.meta?.filter((item) => item.trim().length > 0) ?? [];

  return (
    <section className="workspace-focus-bar">
      <div className="workspace-focus-bar__copy">
        <div className="workspace-context-title">
          {props.eyebrow ? <span className="workspace-focus-bar__eyebrow">{props.eyebrow}</span> : null}
          <strong>{props.title}</strong>
          {props.subtitle ? <span>{props.subtitle}</span> : null}
        </div>
        {metaItems.length > 0 ? (
          <div className="workspace-context-meta">
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>
      {props.aside ? <div className="workspace-focus-bar__aside">{props.aside}</div> : null}
    </section>
  );
}

export function ConfirmActionDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  details?: ReactNode;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!props.open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        props.onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [props.open, props.onCancel]);

  if (!props.open) {
    return null;
  }

  return (
    <>
      <button
        className="confirm-action-dialog__backdrop"
        type="button"
        aria-label="Close confirmation dialog"
        onClick={props.onCancel}
      />
      <section
        className={`confirm-action-dialog${props.tone === 'danger' ? ' confirm-action-dialog--danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="stack">
          <div className="stack stack--compact">
            <h3 id={titleId}>{props.title}</h3>
            <p>{props.description}</p>
          </div>
          {props.details ? <div className="confirm-action-dialog__details">{props.details}</div> : null}
          <div className="actions confirm-action-dialog__actions">
            <button className="button button--secondary" type="button" onClick={props.onCancel} disabled={props.isBusy}>
              {props.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={`button${props.tone === 'danger' ? ' button--danger' : ''}`}
              type="button"
              onClick={props.onConfirm}
              disabled={props.isBusy}
            >
              {props.isBusy ? 'Working...' : props.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </>
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

  return (
    <div className={`status status--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      {notice.message}
    </div>
  );
}

export function ReadinessPill(props: { tone: ReadinessTone; label?: string; className?: string }) {
  return (
    <span className={['readiness-pill', `readiness-pill--${props.tone}`, props.className].filter(Boolean).join(' ')}>
      {props.label ?? READINESS_LABELS[props.tone]}
    </span>
  );
}

export function SimpleModeAffirmation(props: { message: string | null; className?: string }) {
  if (!props.message) {
    return null;
  }

  return (
    <div className={['simple-mode-affirmation', props.className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      {props.message}
    </div>
  );
}

export interface SimpleModeGuideStep {
  id: string;
  label: string;
  description: string;
}

export function SimpleModeGuideFrame(props: {
  title: string;
  steps: SimpleModeGuideStep[];
  currentStepId: string;
  acknowledgedStepIds: string[];
  onStepChange: (stepId: string) => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const currentStep = props.steps.find((step) => step.id === props.currentStepId) ?? props.steps[0];

  function getStatusLabel(stepId: string) {
    if (props.acknowledgedStepIds.includes(stepId)) {
      return 'Reviewed';
    }

    if (props.currentStepId === stepId) {
      return 'Current';
    }

    return 'Next';
  }

  if (!currentStep) {
    return null;
  }

  return (
    <section className="jump-guided-flow stack stack--compact">
      <div className="jump-guided-flow__header">
        <div className="stack stack--compact">
          <h4>{props.title}</h4>
          <p className="editor-section__copy">{currentStep.description}</p>
        </div>
        <div className="actions">
          <span className="pill">Guided</span>
          <button className="button button--secondary" type="button" onClick={props.onDismiss}>
            Dismiss Setup
          </button>
        </div>
      </div>

      <div className="guided-stepper" role="tablist" aria-label={props.title}>
        {props.steps.map((step, index) => {
          const isComplete = props.acknowledgedStepIds.includes(step.id);
          const isCurrent = props.currentStepId === step.id;

          return (
            <button
              key={step.id}
              className={`guided-stepper__item${isCurrent ? ' is-current' : ''}${isComplete ? ' is-complete' : ''}`}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => props.onStepChange(step.id)}
            >
              <span className="guided-stepper__item-index">{index + 1}</span>
              <span className="guided-stepper__item-copy">
                <strong>{step.label}</strong>
                <span>{getStatusLabel(step.id)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="selection-editor">{props.children}</div>
    </section>
  );
}

export function useSimpleModeAffirmation() {
  const { simpleMode } = useUiPreferences();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!simpleMode) {
      setMessage(null);
    }
  }, [simpleMode]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const showAffirmation = useCallback(
    (nextMessage: string) => {
      if (!simpleMode) {
        return;
      }

      setMessage(nextMessage);
    },
    [simpleMode],
  );

  const clearAffirmation = useCallback(() => {
    setMessage(null);
  }, []);

  return {
    message: simpleMode ? message : null,
    showAffirmation,
    clearAffirmation,
  };
}

export function AutosaveStatusIndicator({ status }: { status: AutosaveStatus }) {
  const { simpleMode } = useUiPreferences();

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

  if (!simpleMode) {
    return null;
  }

  return (
    <div className="autosave-status autosave-status--saved" role="status">
      Saved
    </div>
  );
}

export function TooltipFrame(props: {
  tooltip?: ReactNode;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  inline?: boolean;
  placement?: 'top' | 'right' | 'bottom' | 'left';
}) {
  if (!props.tooltip) {
    return props.children;
  }

  const tooltipId = useId();
  const Wrapper = props.inline ? 'span' : 'div';
  const child = cloneElement(props.children, {
    'aria-describedby': props.children.props['aria-describedby']
      ? `${props.children.props['aria-describedby']} ${tooltipId}`
      : tooltipId,
  });

  return (
    <Wrapper
      className={`tooltip-frame${props.inline ? ' tooltip-frame--inline' : ''} tooltip-frame--placement-${props.placement ?? 'top'}`}
    >
      {child}
      <span className="tooltip-frame__bubble" id={tooltipId} role="tooltip">
        {props.tooltip}
      </span>
    </Wrapper>
  );
}

export function AssistiveHint(props: {
  text?: string | null;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  as?: 'small' | 'p' | 'span' | 'div';
  className?: string;
  triggerLabel?: string;
}) {
  const { simpleMode } = useUiPreferences();

  if (!props.text) {
    return null;
  }

  if (simpleMode) {
    const Tag = props.as ?? 'small';

    return <Tag className={['field-hint', props.className].filter(Boolean).join(' ')}>{props.text}</Tag>;
  }

  return (
    <TooltipFrame inline tooltip={props.text} placement={props.placement ?? 'top'}>
      <button className="assistive-hint__trigger" type="button" aria-label={props.triggerLabel ?? 'Show help'}>
        Help
      </button>
    </TooltipFrame>
  );
}

export function PlainLanguageHint(props: {
  term: string;
  meaning: string;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  const { simpleMode } = useUiPreferences();
  const text = `${props.term} = ${props.meaning}`;

  if (simpleMode) {
    return <small className={['field-hint', 'plain-language-hint', props.className].filter(Boolean).join(' ')}>{text}</small>;
  }

  return (
    <TooltipFrame inline tooltip={text} placement={props.placement ?? 'top'}>
      <button
        className={['plain-language-hint__trigger', props.className].filter(Boolean).join(' ')}
        type="button"
        aria-label={`Explain ${props.term}`}
      >
        ?
      </button>
    </TooltipFrame>
  );
}

export function AdvancedJsonDetails(props: {
  summary?: string;
  badge?: string;
  hint?: string;
  children: ReactNode;
}) {
  const { simpleMode } = useUiPreferences();

  if (simpleMode) {
    return null;
  }

  return (
    <details className="details-panel">
      <summary className="details-panel__summary">
        <span>{props.summary ?? 'Advanced JSON'}</span>
        <span className="pill">{props.badge ?? 'raw data'}</span>
      </summary>
      <div className="details-panel__body stack stack--compact">
        <AssistiveHint
          as="p"
          text={props.hint}
          triggerLabel={`Explain ${props.summary ?? 'Advanced JSON'}`}
        />
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
      <span className="field-label-row">
        <span>{props.label}</span>
        <AssistiveHint text={props.hint} triggerLabel={`Explain ${props.label}`} />
      </span>
      <textarea
        className="json-editor"
        rows={props.rows ?? 8}
        value={draft}
        onChange={(event) => void handleChange(event.target.value)}
      />
      {error ? <small className="field-hint field-hint--error">{error}</small> : null}
    </label>
  );
}
