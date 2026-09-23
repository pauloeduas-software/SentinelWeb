import { Link, useLocation } from 'react-router-dom';
import { Armchair, KeyRound, LayoutDashboard, LogOut, Server, Database, Users, SlidersHorizontal } from 'lucide-react';
import { useAuthStore } from '../../domain/auth/auth.store';

// Navegação do painel. Fica em pages/components porque é interface
// compartilhada entre as páginas — não pertence a nenhum domínio.
const NAV_ITEMS = [
  { to: '/', label: 'Telemetria', icon: Server },
  { to: '/itam', label: 'ITAM', icon: Database },
  // Logo depois de ITAM, e antes de Usuários, porque é a mesma operação vista
  // do outro lado: o ativo está na mesa, e a mesa é de quem a ocupa
  // (docs/MODELO-POSSE.md). Fora do menu, ele estava atrás da 6ª aba de Config.
  { to: '/postos', label: 'Postos', icon: Armchair },
  { to: '/users', label: 'Usuários', icon: Users },
  { to: '/tokens', label: 'Tokens', icon: KeyRound },
  { to: '/configuracoes', label: 'Config', icon: SlidersHorizontal },
] as const;

export default function AppHeader() {
  const location = useLocation();
  // Quem está logado sai do store, não de uma busca: sessão é client state
  // (docs/ARQUITETURA.md) e o cabeçalho só a lê.
  const usuario = useAuthStore((estado) => estado.usuario);
  const sair = useAuthStore((estado) => estado.sair);

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
            // Prefixo, e não igualdade: a tela de detalhe do ativo mora em
            // `/itam/assets/:id` e precisa manter ITAM aceso — com igualdade, o
            // menu apagava inteiro assim que se abria um ativo. A raiz é o caso
            // à parte, porque todo caminho começa com "/".
            const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
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

      {/* Quem está operando — a metade visível do `actorId` que passou a ser
          gravado em cada ActivityLog (D23). Sem isto, num computador
          compartilhado, ninguém sabe em nome de quem está clicando. */}
      {usuario && (
        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-text-primary">{usuario.name}</span>
            <span className="text-[10px] text-text-tertiary uppercase tracking-widest">
              {usuario.department || 'Sessão ativa'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void sair()}
            title="Sair"
            className="p-2 text-text-tertiary hover:text-status-danger transition-colors"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
