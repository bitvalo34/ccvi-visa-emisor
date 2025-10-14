import { Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';

export default function App() {
  return (
    <>
      <Navbar />
      <div className="container py-3">
        <Outlet />
      </div>
    </>
  );
}
