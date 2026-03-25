import { RouterProvider } from 'react-router-dom';
import { EditorContextMenu } from '../components/EditorContextMenu';
import { appRouter } from './router';

export function App() {
  return (
    <>
      <RouterProvider router={appRouter} />
      <EditorContextMenu />
    </>
  );
}
