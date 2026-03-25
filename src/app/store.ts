import { create } from 'zustand';
import type { PreparedImportSession } from '../domain/import/types';

interface AppStoreState {
  importSession: PreparedImportSession | null;
  setImportSession: (session: PreparedImportSession | null) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  importSession: null,
  setImportSession: (session) => set({ importSession: session }),
}));
