import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { UiPreferencesProvider } from '../app/UiPreferencesContext';
import { PageShell } from '../components/PageShell';
import { ChainWorkspaceLayout } from '../features/workspace/ChainWorkspaceLayout';
import { PlayPage } from '../features/ai/PlayPage';
import { setAiEnabled } from '../app/operatingMode';
import { createBlankChain } from '../db/persistence';
import { db } from '../db/database';

// Frontend surface gating for the experimental narrative-AI cluster. The backend
// boundary is covered in aiFeatureGate.test.tsx; this file proves the ordinary UI
// presents no experimental surfaces while the flag is off, and restores them when on.

async function resetDatabase() {
  db.close();
  await db.delete();
}

function renderWorkspaceAt(path: string) {
  render(
    <UiPreferencesProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<PageShell />}>
            <Route path="chains/:chainId" element={<ChainWorkspaceLayout />}>
              <Route path="overview" element={<h2>Chain overview</h2>} />
              <Route path="play" element={<PlayPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MemoryRouter>
    </UiPreferencesProvider>,
  );
}

afterEach(async () => {
  cleanup();
  setAiEnabled(false);
  await resetDatabase();
});

it('hides the Play / AI Setup module from navigation while off', async () => {
  setAiEnabled(false);
  const bundle = await createBlankChain('Gate Off Chain');
  renderWorkspaceAt(`/chains/${bundle.chain.id}/overview`);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Chain overview' })).toBeDefined());
  expect(screen.queryByRole('link', { name: /Play \/ AI Setup/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /enable ai/i })).toBeNull();
});

it('redirects direct navigation to the experimental route to the overview while off', async () => {
  setAiEnabled(false);
  const bundle = await createBlankChain('Gate Off Chain');
  renderWorkspaceAt(`/chains/${bundle.chain.id}/play`);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Chain overview' })).toBeDefined());
  expect(screen.queryByRole('heading', { name: /AI GM|Sheet Only/i })).toBeNull();
  expect(screen.queryByText(/Enable AI GM to add campaign play/i)).toBeNull();
});

it('restores the Play / AI Setup module and route when the flag is on', async () => {
  setAiEnabled(true);
  const bundle = await createBlankChain('Gate On Chain');
  renderWorkspaceAt(`/chains/${bundle.chain.id}/overview`);
  await waitFor(() => expect(screen.getByRole('link', { name: /Play \/ AI Setup/i })).toBeDefined());
  renderWorkspaceAtPlay(bundle.chain.id);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'AI GM' })).toBeDefined());
});

function renderWorkspaceAtPlay(chainId: string) {
  cleanup();
  render(
    <UiPreferencesProvider>
      <MemoryRouter initialEntries={[`/chains/${chainId}/play`]}>
        <Routes>
          <Route path="/" element={<PageShell />}>
            <Route path="chains/:chainId" element={<ChainWorkspaceLayout />}>
              <Route path="overview" element={<h2>Chain overview</h2>} />
              <Route path="play" element={<PlayPage />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </UiPreferencesProvider>,
  );
}
