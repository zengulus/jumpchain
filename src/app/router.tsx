import type { ComponentType } from 'react';
import { Navigate, createHashRouter } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { HomePage } from '../features/home/HomePage';

function lazyRoute<TModule extends Record<string, unknown>>(loader: () => Promise<TModule>, exportName: keyof TModule) {
  return async () => {
    const module = await loader();

    return {
      Component: module[exportName] as ComponentType,
    };
  };
}

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <PageShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'import',
        lazy: lazyRoute(() => import('../features/advanced-import/ImportDebugPage'), 'ImportDebugPage'),
      },
      {
        path: 'search',
        lazy: lazyRoute(() => import('../features/search/SearchResultsPage'), 'SearchResultsPage'),
      },
      {
        path: 'chains/:chainId',
        lazy: lazyRoute(() => import('../features/workspace/ChainWorkspaceLayout'), 'ChainWorkspaceLayout'),
        children: [
          {
            index: true,
            element: <Navigate to="overview" replace />,
          },
          {
            path: 'overview',
            lazy: lazyRoute(() => import('../features/chain-overview/ChainOverviewPage'), 'ChainOverviewPage'),
          },
          {
            path: 'jumpers',
            lazy: lazyRoute(() => import('../features/jumpers/JumpersPage'), 'JumpersPage'),
          },
          {
            path: 'companions',
            lazy: lazyRoute(() => import('../features/companions/CompanionsPage'), 'CompanionsPage'),
          },
          {
            path: 'jumps',
            lazy: lazyRoute(() => import('../features/jumps/JumpsPage'), 'JumpsPage'),
          },
          {
            path: 'jumps/:jumpId',
            lazy: lazyRoute(() => import('../features/jumps/JumpsPage'), 'JumpsPage'),
          },
          {
            path: 'participation/:jumpId',
            lazy: lazyRoute(() => import('../features/participation/ParticipationPage'), 'ParticipationPage'),
          },
          {
            path: 'effects',
            lazy: lazyRoute(() => import('../features/effects/EffectsPage'), 'EffectsPage'),
          },
          {
            path: 'rules',
            lazy: lazyRoute(() => import('../features/chainwide-rules/ChainwideRulesPage'), 'ChainwideRulesPage'),
          },
          {
            path: 'alt-chain-builder',
            lazy: lazyRoute(() => import('../features/chainwide-rules/AltChainBuilderPage'), 'AltChainBuilderPage'),
          },
          {
            path: 'three-boons',
            lazy: lazyRoute(() => import('../features/three-boons/ThreeBoonsPage'), 'ThreeBoonsPage'),
          },
          {
            path: 'current-jump-rules',
            lazy: lazyRoute(() => import('../features/current-jump-rules/CurrentJumpRulesPage'), 'CurrentJumpRulesPage'),
          },
          {
            path: 'bodymod',
            lazy: lazyRoute(() => import('../features/bodymod/BodymodPage'), 'BodymodPage'),
          },
          {
            path: 'cosmic-backpack',
            lazy: lazyRoute(() => import('../features/cosmic-backpack/CosmicBackpackPage'), 'CosmicBackpackPage'),
          },
          {
            path: 'personal-reality',
            element: <Navigate to="../cosmic-backpack" replace />,
          },
          {
            path: 'timeline',
            lazy: lazyRoute(() => import('../features/timeline/TimelinePage'), 'TimelinePage'),
          },
          {
            path: 'notes',
            lazy: lazyRoute(() => import('../features/notes/NotesPage'), 'NotesPage'),
          },
          {
            path: 'jumpdocs',
            lazy: lazyRoute(() => import('../features/jumpdocs/JumpDocsPage'), 'JumpDocsPage'),
          },
          {
            path: 'export',
            lazy: lazyRoute(() => import('../features/export/ExportPage'), 'ExportPage'),
          },
          {
            path: 'advanced-tools',
            lazy: lazyRoute(() => import('../features/advanced-tools/AdvancedToolsPage'), 'AdvancedToolsPage'),
          },
          {
            path: 'backups',
            lazy: lazyRoute(() => import('../features/backups/BackupsPage'), 'BackupsPage'),
          },
        ],
      },
    ],
  },
]);
