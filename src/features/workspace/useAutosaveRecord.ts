import { useEffect, useRef, useState } from 'react';

export interface AutosaveStatus {
  phase: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  message?: string;
}

interface UseAutosaveRecordOptions<T> {
  delayMs?: number;
  getErrorMessage?: (error: unknown) => string;
  getKey?: (value: T | null) => string | null;
  onSave: (value: T) => void | Promise<void>;
}

function defaultGetRecordKey<T>(value: T | null) {
  if (typeof value !== 'object' || value === null || !('id' in value)) {
    return null;
  }

  const candidateId = (value as { id?: unknown }).id;
  return typeof candidateId === 'string' ? candidateId : null;
}

function toSerializedValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function mergeAutosaveStatuses(statuses: AutosaveStatus[]) {
  if (statuses.some((status) => status.phase === 'error')) {
    return statuses.find((status) => status.phase === 'error') ?? { phase: 'idle' as const };
  }

  if (statuses.some((status) => status.phase === 'saving')) {
    return statuses.find((status) => status.phase === 'saving') ?? { phase: 'idle' as const };
  }

  if (statuses.some((status) => status.phase === 'dirty')) {
    return statuses.find((status) => status.phase === 'dirty') ?? { phase: 'idle' as const };
  }

  if (statuses.some((status) => status.phase === 'saved')) {
    return statuses.find((status) => status.phase === 'saved') ?? { phase: 'idle' as const };
  }

  return { phase: 'idle' as const };
}

export function useAutosaveRecord<T>(sourceValue: T | null, options: UseAutosaveRecordOptions<T>) {
  const [draft, setDraft] = useState<T | null>(sourceValue);
  const [status, setStatus] = useState<AutosaveStatus>({ phase: 'idle' });
  const currentRecordKeyRef = useRef<string | null>(null);
  const inFlightSerializedRef = useRef<string | null>(null);
  const failedSerializedRef = useRef<string | null>(null);
  const onSaveRef = useRef(options.onSave);
  const getErrorMessageRef = useRef(options.getErrorMessage);
  const getKey = options.getKey ?? defaultGetRecordKey<T>;
  const delayMs = options.delayMs ?? 500;
  const sourceKey = getKey(sourceValue);
  const draftKey = getKey(draft);
  const serializedSource = toSerializedValue(sourceValue);
  const serializedDraft = toSerializedValue(draft);

  currentRecordKeyRef.current = sourceKey;

  useEffect(() => {
    onSaveRef.current = options.onSave;
  }, [options.onSave]);

  useEffect(() => {
    getErrorMessageRef.current = options.getErrorMessage;
  }, [options.getErrorMessage]);

  useEffect(() => {
    if (sourceKey !== draftKey) {
      inFlightSerializedRef.current = null;
      failedSerializedRef.current = null;
      setDraft(sourceValue);
      setStatus({ phase: 'idle' });
      return;
    }

    if (sourceValue === null) {
      inFlightSerializedRef.current = null;
      failedSerializedRef.current = null;

      if (draft !== null) {
        setDraft(null);
      }

      if (status.phase !== 'idle') {
        setStatus({ phase: 'idle' });
      }

      return;
    }

    if (inFlightSerializedRef.current !== null && serializedSource === inFlightSerializedRef.current) {
      inFlightSerializedRef.current = null;
      failedSerializedRef.current = null;
      setDraft(sourceValue);
      setStatus((currentStatus) => (currentStatus.phase === 'error' ? currentStatus : { phase: 'saved' }));
      return;
    }

    if (serializedDraft === serializedSource && draft !== sourceValue) {
      setDraft(sourceValue);
    }
  }, [draft, draftKey, serializedDraft, serializedSource, sourceKey, sourceValue, status.phase]);

  useEffect(() => {
    if (sourceValue === null || draft === null || sourceKey === null || sourceKey !== draftKey) {
      return;
    }

    if (serializedDraft === serializedSource) {
      if (status.phase === 'dirty' || status.phase === 'saving') {
        setStatus({ phase: 'saved' });
      }

      return;
    }

    if (failedSerializedRef.current === serializedDraft || inFlightSerializedRef.current === serializedDraft) {
      return;
    }

    if (status.phase !== 'dirty') {
      setStatus({ phase: 'dirty' });
    }

    const timer = window.setTimeout(async () => {
      const submittedValue = draft;
      const submittedKey = draftKey;
      const submittedSerialized = serializedDraft;

      if (submittedValue === null || submittedKey === null) {
        return;
      }

      inFlightSerializedRef.current = submittedSerialized;

      if (currentRecordKeyRef.current === submittedKey) {
        setStatus({ phase: 'saving' });
      }

      try {
        await onSaveRef.current(submittedValue);

        if (currentRecordKeyRef.current === submittedKey) {
          setStatus({ phase: 'saved' });
        }
      } catch (error) {
        if (inFlightSerializedRef.current === submittedSerialized) {
          inFlightSerializedRef.current = null;
        }

        failedSerializedRef.current = submittedSerialized;

        if (currentRecordKeyRef.current === submittedKey) {
          setStatus({
            phase: 'error',
            message:
              getErrorMessageRef.current?.(error) ??
              (error instanceof Error ? error.message : 'Unable to autosave changes.'),
          });
        }
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, draft, draftKey, serializedDraft, serializedSource, sourceKey, sourceValue, status.phase]);

  function updateDraft(nextValue: T | null | ((currentValue: T | null) => T | null)) {
    setDraft((currentValue) =>
      typeof nextValue === 'function'
        ? (nextValue as (value: T | null) => T | null)(currentValue)
        : nextValue,
    );
  }

  return {
    draft,
    status,
    updateDraft,
  };
}
