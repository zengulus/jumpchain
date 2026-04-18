import { useSyncExternalStore } from 'react';
import type { Table } from 'dexie';
import { db, ensureDatabaseOpen } from '../../db/database';

type UndoKind = 'restore-record' | 'delete-created-record';

interface UndoAction<T extends { id: string; chainId?: string }> {
  id: string;
  kind: UndoKind;
  table: Table<T, string>;
  recordId: string;
  chainId?: string;
  previousRecord?: T;
  label: string;
  createdAt: string;
}

interface UndoState {
  action: UndoAction<{ id: string; chainId?: string }> | null;
  isUndoing: boolean;
}

let undoState: UndoState = {
  action: null,
  isUndoing: false,
};

const subscribers = new Set<() => void>();

function emitUndoChange() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function subscribeToUndoStore(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function getUndoSnapshot() {
  return undoState;
}

function getTableLabel(tableName: string) {
  return tableName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setUndoAction<T extends { id: string; chainId?: string }>(action: Omit<UndoAction<T>, 'id' | 'createdAt' | 'label'>) {
  if (undoState.isUndoing) {
    return;
  }

  undoState = {
    ...undoState,
    action: {
      ...action,
      id: `${action.table.name}:${action.recordId}:${Date.now()}`,
      label: getTableLabel(action.table.name),
      createdAt: new Date().toISOString(),
    } as UndoAction<{ id: string; chainId?: string }>,
  };
  emitUndoChange();
}

export async function rememberRecordSave<T extends { id: string; chainId?: string }>(
  table: Table<T, string>,
  record: T,
) {
  if (undoState.isUndoing) {
    return;
  }

  const previousRecord = await table.get(record.id);

  setUndoAction({
    kind: previousRecord ? 'restore-record' : 'delete-created-record',
    table,
    recordId: record.id,
    chainId: record.chainId,
    previousRecord,
  });
}

export async function rememberRecordDelete<T extends { id: string; chainId?: string }>(
  table: Table<T, string>,
  recordId: string,
  chainId?: string,
) {
  if (undoState.isUndoing) {
    return;
  }

  const previousRecord = await table.get(recordId);

  if (!previousRecord) {
    return;
  }

  setUndoAction({
    kind: 'restore-record',
    table,
    recordId,
    chainId: chainId ?? previousRecord.chainId,
    previousRecord,
  });
}

export async function undoLastWorkspaceAction() {
  const action = undoState.action;

  if (!action || undoState.isUndoing) {
    return null;
  }

  undoState = {
    ...undoState,
    isUndoing: true,
  };
  emitUndoChange();

  try {
    await ensureDatabaseOpen();

    if (action.kind === 'restore-record' && action.previousRecord) {
      await action.table.put(action.previousRecord);
    } else if (action.kind === 'delete-created-record') {
      await action.table.delete(action.recordId);
    }

    if (action.chainId && action.table.name !== db.chains.name) {
      await db.chains.update(action.chainId, { updatedAt: new Date().toISOString() });
    }

    undoState = {
      action: null,
      isUndoing: false,
    };
    emitUndoChange();

    return action;
  } catch (error) {
    undoState = {
      ...undoState,
      isUndoing: false,
    };
    emitUndoChange();
    throw error;
  }
}

export function useLastWorkspaceUndo() {
  return useSyncExternalStore(subscribeToUndoStore, getUndoSnapshot, getUndoSnapshot);
}
