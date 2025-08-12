import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { Landing } from './pages/Landing';
import { RoomPage } from './pages/RoomPage';
import { AppLayout } from './AppLayout';
import { SocketProvider } from './socket/SocketProvider';
import { Home } from './pages/Home';

const router = createBrowserRouter([
  { path: '/', element: <AppLayout><Home /></AppLayout> },
  { path: '/guess-who', element: <AppLayout><Landing /></AppLayout> },
  { path: '/room/:code', element: <AppLayout><RoomPage /></AppLayout> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SocketProvider>
      <RouterProvider router={router} />
    </SocketProvider>
  </React.StrictMode>,
);


