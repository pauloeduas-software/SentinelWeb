import { useAuthStore } from '../../domain/auth/auth.store';
import Iniciais from '../components/Iniciais';
import MeusTokensPanel from './components/MeusTokensPanel';
import SegundoFatorPanel from './components/SegundoFatorPanel';
import { useMinhaConta } from './hooks/useMinhaConta';

// MINHA CONTA (F11, Etapa H) — a única tela do painel que não exige permissão.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ELA NÃO É UMA ABA DE `/configuracoes`.
//
// `/configuracoes` é administração do SISTEMA, e o item de menu dela pede
// `catalog.manage`. O que está aqui é a credencial de QUEM ESTÁ OLHANDO: o
// segundo fator e os tokens pessoais. Pôr isso lá significaria que só
// administrador pode se proteger — e trancar a verificação em duas etapas atrás
// de uma permissão é o avesso do que ela existe para fazer.
//
// O NOME É O SUBSTANTIVO do que a tela mostra: a conta. Não `/seguranca`, que
// nomearia o assunto, nem `/perfil`, que prometeria editar nome e foto — o
// cadastro do colaborador se edita em Usuários, por quem tem `users.edit`.
// ═══════════════════════════════════════════════════════════════════════════

export default function MinhaContaPage() {
  const usuario = useAuthStore((estado) => estado.usuario);
  const conta = useMinhaConta();

  return (
    <div className="animate-in fade-in space-y-6 font-mono text-xs duration-300">
      <header className="flex items-start gap-4">
        <Iniciais nome={usuario?.name ?? ''} tamanho="grande" />
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-xl uppercase tracking-widest text-text-primary">
            {usuario?.name ?? 'Minha conta'}
          </h2>
          <p className="truncate text-text-tertiary">{usuario?.email}</p>
          <p className="max-w-2xl pt-1 text-[10px] leading-relaxed text-text-tertiary">
            O que está aqui é a sua credencial, e só a sua. Para mudar nome, e-mail, departamento ou
            gestor, a tela é Usuários — aquilo é cadastro de colaborador, e quem mexe nele é quem tem
            permissão para isso.
          </p>
        </div>
      </header>

      {conta.erro && (
        <div className="border border-status-danger/20 bg-status-danger/10 p-3 text-status-danger">
          {conta.erro}
        </div>
      )}

      <SegundoFatorPanel fator={conta.fator} carregando={conta.carregandoFator} conta={conta} />
      <MeusTokensPanel conta={conta} />
    </div>
  );
}
