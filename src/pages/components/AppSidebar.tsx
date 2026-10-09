import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LayoutDashboard, LogOut, X } from 'lucide-react';
import Iniciais from './Iniciais';
import { GRUPOS_DE_MENU, itemEstaAtivo } from './navegacao';
import { useBarraLateral } from '../hooks/useBarraLateral';
import { useAuthStore, usePermissoes } from '../../domain/auth/auth.store';
import { useSistema, useUrlDaLogo } from '../hooks/useSistema';

// A NAVEGAÇÃO DO PAINEL, na vertical.
//
// Fica em `pages/components` porque é interface compartilhada entre as páginas e
// não pertence a domínio nenhum — mesmo lugar do `AppHeader`. A LISTA de itens
// mora em `navegacao.ts`, separada daqui: o cabeçalho também a lê, para
// descobrir o nome da tela atual, e duas cópias divergiriam no primeiro item
// acrescentado.
//
// ═══════════════════════════════════════════════════════════════════════════
// TRÊS LARGURAS, E A DO MEIO É A QUE RESOLVE O DEFEITO.
//
//   `md` para cima, aberta     220px, com rótulo e título de seção;
//   `md` para cima, recolhida   64px, só ícone, com `title` no hover;
//   abaixo de `md`              gaveta por cima do conteúdo, fechada por padrão.
//
// A gaveta é `fixed` e sai do fluxo: ela NÃO empurra o conteúdo, senão abrir o
// menu no celular reintroduziria exatamente a rolagem horizontal que esta barra
// existe para eliminar.
// ═══════════════════════════════════════════════════════════════════════════

export default function AppSidebar() {
  const location = useLocation();
  const { recolhida, abertaNoCelular, alternarRecolhida, fecharNoCelular } = useBarraLateral();
  // A marca sai da configuração de sistema; a query é compartilhada com o
  // `Layout` e com o cabeçalho, então ler aqui não dobra requisição nenhuma.
  const { configuracao } = useSistema();
  const urlDaLogo = useUrlDaLogo();
  const usuario = useAuthStore((estado) => estado.usuario);
  const sair = useAuthStore((estado) => estado.sair);
  // `usePermissoes` e não `usePode` por item: o número de itens é variável, e um
  // hook por item quebraria a regra dos hooks. Aqui é uma assinatura só.
  const pode = usePermissoes();

  // NAVEGOU, FECHA A GAVETA. Sem isto, no celular, tocar num item abre a tela
  // ATRÁS do menu, que continua cobrindo-a — e a pessoa acha que o toque não
  // funcionou. Depende do caminho, não do clique, então também fecha quando a
  // navegação vem do botão de voltar do navegador.
  useEffect(() => { fecharNoCelular(); }, [location.pathname, fecharNoCelular]);

  // ESC fecha. É a tecla que todo mundo tenta quando algo cobre a tela, e sem
  // ela a única saída é acertar o X ou a área escura.
  useEffect(() => {
    if (!abertaNoCelular) return;
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') fecharNoCelular(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [abertaNoCelular, fecharNoCelular]);

  // SÓ O QUE A PESSOA ALCANÇA (F11) — e o GRUPO VAZIO SOME JUNTO.
  //
  // Filtrar só os itens deixaria "Convergência" como um título com nada
  // embaixo para quem é `USUARIO`: um cabeçalho de seção vazio é
  // pior do que a seção não existir, porque parece coisa que não carregou.
  //
  // `useMemo` porque `pode` só troca quando a sessão troca: sem ele, a lista
  // inteira é remontada a cada render da barra, que acontece em toda navegação.
  const visiveis = useMemo(
    () => GRUPOS_DE_MENU
      .map((grupo) => ({
        ...grupo,
        // SEM PAPEL = TODO MUNDO VÊ. Hoje nenhum item está nesse caso (D148,
        // D156), e o campo segue opcional para a próxima tela desse tipo.
        itens: grupo.itens.filter((item) => item.papel === undefined || pode(item.papel)),
      }))
      .filter((grupo) => grupo.itens.length > 0),
    [pode],
  );

  const largura = recolhida ? 'md:w-16' : 'md:w-56';

  return (
    <>
      {/* O VÉU da gaveta, só abaixo de `md`. Clicar fora fecha — e ele precisa
          existir como elemento para capturar o clique; um `onBlur` na barra não
          pega toque em área vazia. */}
      {abertaNoCelular && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={fecharNoCelular}
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
        />
      )}

      <aside
        className={[
          // `fixed` abaixo de `md` (gaveta, fora do fluxo) e `sticky` a partir
          // dele (coluna no fluxo, acompanhando a rolagem da página).
          'fixed inset-y-0 left-0 z-50 w-56 shrink-0',
          'md:sticky md:top-0 md:z-30 md:h-screen md:translate-x-0',
          largura,
          abertaNoCelular ? 'translate-x-0' : '-translate-x-full',
          'flex flex-col border-r border-border-sutil bg-bg-base transition-[width,transform] duration-200',
        ].join(' ')}
      >
        {/* ── MARCA ─────────────────────────────────────────────────────────
            Mesma altura do cabeçalho (`h-14`) de propósito: a borda de baixo
            daqui e a do cabeçalho formam UMA linha reta atravessando a tela. */}
        <div className="h-14 shrink-0 flex items-center gap-3 border-b border-border-sutil px-4">
          <Link to="/" className="flex items-center gap-3 min-w-0" title={configuracao?.companyName ?? 'Sentinel'}>
            {urlDaLogo ? (
              <img src={urlDaLogo} alt="" className="h-6 w-6 shrink-0 object-contain" />
            ) : (
              <div className="bg-text-primary p-1 rounded-sm shrink-0">
                <LayoutDashboard size={14} className="text-bg-base" />
              </div>
            )}
            {!recolhida && (
              <h1
                className="truncate text-sm font-bold uppercase tracking-tight"
                style={{ color: 'var(--color-marca)' }}
              >
                {configuracao?.companyName ?? 'Sentinel'}
              </h1>
            )}
          </Link>

          {/* O X da gaveta — só no celular, onde não há botão de recolher. */}
          <button
            type="button"
            onClick={fecharNoCelular}
            aria-label="Fechar menu"
            className="ml-auto p-1 text-text-tertiary hover:text-text-primary md:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── ITENS ─────────────────────────────────────────────────────────
            `overflow-y-auto` com `min-h-0`: numa janela baixa a lista rola
            DENTRO da barra, sem empurrar o rodapé (nome e sair) para fora da
            tela. Sem o `min-h-0`, o flex item não encolhe e o rodapé some. */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 font-mono text-xs uppercase tracking-widest">
          {visiveis.map((grupo, indice) => (
            <div key={grupo.titulo ?? indice} className={indice > 0 ? 'mt-5' : ''}>
              {/* O título da seção desaparece quando a barra está recolhida —
                  em 64px não cabe texto. No lugar dele, uma linha: sem nenhuma
                  marca, os quinze ícones viram uma coluna sem hierarquia. */}
              {grupo.titulo && (
                recolhida ? (
                  <div className="mx-4 mb-2 border-t border-border-sutil" />
                ) : (
                  <div className="px-4 pb-2 text-[10px] text-text-tertiary">{grupo.titulo}</div>
                )
              )}

              {grupo.itens.map(({ to, label, icon: Icon }) => {
                const ativo = itemEstaAtivo(to, location.pathname);
                return (
                  <Link
                    key={to}
                    to={to}
                    // `title` sempre, não só quando recolhida: no modo estreito
                    // é a única forma de saber o que o ícone é, e no aberto não
                    // incomoda.
                    title={label}
                    aria-current={ativo ? 'page' : undefined}
                    className={[
                      'flex items-center gap-3 px-4 py-2 transition-colors',
                      // A BARRA DE 2px À ESQUERDA é o que marca o ativo, e ela
                      // existe nos dois modos — recolhida, a cor do ícone
                      // sozinha é fraca demais para achar a tela atual numa
                      // coluna de quinze.
                      ativo
                        ? 'border-l-2 border-status-success bg-surface-card text-status-success'
                        : 'border-l-2 border-transparent text-text-tertiary hover:bg-surface-card hover:text-text-primary',
                      recolhida ? 'justify-center' : '',
                    ].join(' ')}
                  >
                    <Icon size={14} className="shrink-0" />
                    {!recolhida && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── QUEM ESTÁ OPERANDO ────────────────────────────────────────────
            Saiu do cabeçalho e veio para cá: é informação de sessão, não de
            tela, e no cabeçalho ela disputava largura com a busca do leitor.
            Continua sendo a metade visível do `actorId` de cada ActivityLog
            (D23) — num computador compartilhado, é o que diz em nome de quem se
            está clicando. */}
        {usuario && (
          <div className="shrink-0 border-t border-border-sutil p-3 font-mono text-xs">
            <div className={`flex items-center gap-2 ${recolhida ? 'justify-center' : ''}`}>
              {/* AS INICIAIS (F11): aqui elas são o que sobra quando a barra está
                  recolhida — 64px não cabem nome, e um ícone genérico de usuário
                  não diria EM NOME DE QUEM se está clicando, que é a razão de este
                  rodapé existir (D23). */}
              <Iniciais nome={usuario.name} />
              {!recolhida && (
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-text-primary">{usuario.name}</span>
                  <span className="truncate text-[10px] uppercase tracking-widest text-text-tertiary">
                    Sessão ativa
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void sair()}
                title="Sair"
                className={`p-2 text-text-tertiary transition-colors hover:text-status-danger ${recolhida ? '' : 'ml-auto'}`}
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── RECOLHER ──────────────────────────────────────────────────────
            Só a partir de `md`: abaixo disso a barra é gaveta, e "recolher uma
            gaveta" não quer dizer nada. */}
        <button
          type="button"
          onClick={alternarRecolhida}
          title={recolhida ? 'Expandir menu' : 'Recolher menu'}
          className="hidden shrink-0 items-center justify-center gap-2 border-t border-border-sutil py-2 font-mono text-[10px] uppercase tracking-widest text-text-tertiary transition-colors hover:bg-surface-card hover:text-text-primary md:flex"
        >
          {recolhida ? <ChevronsRight size={14} /> : <><ChevronsLeft size={14} /> Recolher</>}
        </button>
      </aside>
    </>
  );
}
