import { Navigate, createHashRouter } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { ChainOverviewPage } from '../features/chain-overview/ChainOverviewPage';
import { BackupsPage } from '../features/backups/BackupsPage';
import { HomePage } from '../features/home/HomePage';
import { ImportDebugPage } from '../features/advanced-import/ImportDebugPage';
import { JumpersPage } from '../features/jumpers/JumpersPage';
import { CompanionsPage } from '../features/companions/CompanionsPage';
import { JumpsPage } from '../features/jumps/JumpsPage';
import { ParticipationPage } from '../features/participation/ParticipationPage';
import { EffectsPage } from '../features/effects/EffectsPage';
import { ChainwideRulesPage } from '../features/chainwide-rules/ChainwideRulesPage';
import { CurrentJumpRulesPage } from '../features/current-jump-rules/CurrentJumpRulesPage';
import { BodymodPage } from '../features/bodymod/BodymodPage';
import { TimelinePage } from '../features/timeline/TimelinePage';
import { NotesPage } from '../features/notes/NotesPage';
import { ChainWorkspaceLayout } from '../features/workspace/ChainWorkspaceLayout';
import { PersonalRealityPage } from '../features/personal-reality/PersonalRealityPage';
import { SearchResultsPage } from '../features/search/SearchResultsPage';

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
        element: <ImportDebugPage />,
      },
      {
        path: 'search',
        element: <SearchResultsPage />,
      },
      {
        path: 'chains/:chainId',
        element: <ChainWorkspaceLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="overview" replace />,
          },
          {
            path: 'overview',
            element: <ChainOverviewPage />,
          },
          {
            path: 'jumpers',
            element: <JumpersPage />,
          },
          {
            path: 'companions',
            element: <CompanionsPage />,
          },
          {
            path: 'jumps',
            element: <JumpsPage />,
          },
          {
            path: 'jumps/:jumpId',
            element: <JumpsPage />,
          },
          {
            path: 'participation/:jumpId',
            element: <ParticipationPage />,
          },
          {
            path: 'effects',
            element: <EffectsPage />,
          },
          {
            path: 'rules',
            element: <ChainwideRulesPage />,
          },
          {
            path: 'current-jump-rules',
            element: <CurrentJumpRulesPage />,
          },
          {
            path: 'bodymod',
            element: <BodymodPage />,
          },
          {
            path: 'personal-reality',
            element: <PersonalRealityPage />,
          },
          {
            path: 'timeline',
            element: <TimelinePage />,
          },
          {
            path: 'notes',
            element: <NotesPage />,
          },
          {
            path: 'backups',
            element: <BackupsPage />,
          },
        ],
      },
    ],
  },
]);
