import { useOutletContext } from 'react-router-dom';
import type { ChainWorkspaceOutletContext } from './ChainWorkspaceLayout';

export function useChainWorkspace() {
  return useOutletContext<ChainWorkspaceOutletContext>();
}
