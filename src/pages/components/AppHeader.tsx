import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, Database, Users } from 'lucide-react';

// Navegação do painel. Fica em pages/components porque é interface
// compartilhada entre as páginas — não pertence a nenhum domínio.
const NAV_ITEMS = [
  { to: '/', label: 'Telemetria', icon: Server },
  { to: '/itam', label: 'ITAM', icon: Database },
  { to: '/users', label: 'Usuários', icon: Users },
] as const;

export default function AppHeader() {
  const location = useLocation();

  return (
    <header className="h-14 border-b border-border-sutil bg-bg-base sticky top-0 z-40 flex items-center px-6 justify-between shrink-0">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="bg-text-primary p-1 rounded-sm">
            <LayoutDashboard size={14} className="text-bg-base" />
          </div>
          <h1 className="text-sm font-bold tracking-tight uppercase">Sentinel</h1>
        </div>

        <nav className="hidden md:flex items-center gap-1 font-mono text-xs uppercase tracking-widest">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`px-4 py-2 transition-colors flex items-center gap-2 ${isActive ? 'text-status-success' : 'text-text-tertiary hover:text-text-primary'}`}
              >
                <Icon size={14} /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
