import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, Database, Users } from 'lucide-react';
import TelemetryPage from './pages/telemetria/TelemetryPage';
import ItamPage from './pages/gestao-itam/ItamPage';
import UsersPage from './pages/gestao-usuario/UsersPage';

function Layout() {
  const location = useLocation();

  const isTelemetry = location.pathname === '/';
  const isItam = location.pathname === '/itam';
  const isUsers = location.pathname === '/users';

  return (
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-status-info/20 font-sans flex flex-col">
      {/* Header / Nav */}
      <header className="h-14 border-b border-border-sutil bg-bg-base sticky top-0 z-40 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-text-primary p-1 rounded-sm">
              <LayoutDashboard size={14} className="text-bg-base" />
            </div>
            <h1 className="text-sm font-bold tracking-tight uppercase">Sentinel</h1>
          </div>

          <nav className="hidden md:flex items-center gap-1 font-mono text-xs uppercase tracking-widest">
            <Link 
              to="/" 
              className={`px-4 py-2 transition-colors flex items-center gap-2 ${isTelemetry ? 'text-status-success' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              <Server size={14} /> Telemetria
            </Link>
            <Link 
              to="/itam" 
              className={`px-4 py-2 transition-colors flex items-center gap-2 ${isItam ? 'text-status-success' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              <Database size={14} /> ITAM
            </Link>
            <Link 
              to="/users" 
              className={`px-4 py-2 transition-colors flex items-center gap-2 ${isUsers ? 'text-status-success' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              <Users size={14} /> Usuários
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8">
        <Routes>
          <Route path="/" element={<TelemetryPage />} />
          <Route path="/itam" element={<ItamPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
