import { Link, useLocation } from 'react-router-dom';
import { Armchair, Boxes, FileBarChart, KeyRound, LayoutDashboard, LogOut, Radar, Server, Database, ScrollText, Users, SlidersHorizontal, Wrench } from 'lucide-react';
import AlertBell from './AlertBell';
import { useAuthStore } from '../../domain/auth/auth.store';

// Navegação do painel. Fica em pages/components porque é interface
// compartilhada entre as páginas — não pertence a nenhum domínio.
const NAV_ITEMS = [
  { to: '/', label: 'Telemetria', icon: Server },
  { to: '/ativos', label: 'Ativos', icon: Database },
  // Logo depois de Ativos, e antes de Usuários, porque é a mesma operação vista
  // do outro lado: o ativo está na mesa, e a mesa é de quem a ocupa
  // (docs/MODELO-POSSE.md). Fora do menu, ele estava atrás da 6ª aba de Config.
  { to: '/postos', label: 'Postos', icon: Armchair },
  // Depois de Postos porque a entrega de acessório pende dele: os 5 mouses da
  // Mesa 1 são do POSTO, e quem responde por eles são os ocupantes (D33).
  { to: '/estoque', label: 'Estoque', icon: Boxes },
  // Depois de Estoque porque é o mesmo desenho um passo adiante: lá o saldo é
  // calculado sobre unidades intercambiáveis, aqui o assento é uma LINHA que se
  // trava (D40). E porque licença também é posse — ela entra no desligamento.
  { to: '/licencas', label: 'Licenças', icon: ScrollText },
  // Depois de Licenças e antes de Usuários: é a tela que liga os dois lados do
  // produto — o que o agente VÊ e o que a empresa CADASTROU (F7). Fica perto do
  // inventário porque é dele que ela fala, não do RMM.
  { to: '/descobertas', label: 'Descobertas', icon: Radar },
  // As DUAS entradas da F8, e são duas de propósito: a barra já tinha dez itens e
  // desaparece abaixo de `md`. A conferência por posto (`/auditorias`) NÃO ocupa
  // lugar aqui — ela é alcançada de dentro de Postos e pela aba de auditorias dos
  // relatórios, porque é lá que estão os números que levam alguém a conferir.
  { to: '/manutencoes', label: 'Manutenções', icon: Wrench },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
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
            // `/ativos/:id` e precisa manter Ativos aceso — com igualdade, o
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
          {/* O sino ANTES do nome: ele é a única coisa do cabeçalho que muda
              sozinha, e é do lado direito que o olho volta depois de ler a tela. */}
          <AlertBell />
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
