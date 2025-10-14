import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import Dashboard from './pages/Dashboard';
import CardsList from './pages/CardsList';
import CardNew from './pages/CardNew';
import CardDetail from './pages/CardDetail';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'cards', element: <CardsList /> },
      { path: 'cards/new', element: <CardNew /> },
      { path: 'cards/:numero', element: <CardDetail /> },
    ],
  },
]);
