import { createHashRouter } from 'react-router-dom';
import { PageShell } from '../components/PageShell';
import { HomePage } from '../features/home/HomePage';
import { ImportDebugPage } from '../features/advanced-import/ImportDebugPage';

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
    ],
  },
]);
