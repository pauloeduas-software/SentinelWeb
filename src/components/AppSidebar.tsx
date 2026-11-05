import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, Menu, X } from 'lucide-react';
import { GRUPOS_DE_MENU, itemEstaAtivo } from './navegacao';
import SentinelLogo from './SentinelLogo';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { cn } from '../helpers/cn.helper';
import { useBarraLateral } from '../hooks/useBarraLateral';
import { usePermissoes } from '../stores/auth.store';

// A NAVEGAÇÃO DO PAINEL, na vertical.
//
// Fica em `src/components` porque é interface compartilhada entre as páginas e
// não pertence a domínio nenhum — mesmo lugar do `AppHeader`. A LISTA de itens
// mora em `navegacao.ts`, separada daqui: o cabeçalho também a lê, para
// descobrir o nome da tela atual, e duas cópias divergiriam no primeiro item
// acrescentado.
//
// ═══════════════════════════════════════════════════════════════════════════
// TRÊS LARGURAS, E A DO MEIO É A QUE RESOLVE O DEFEITO.
//
//   `md` para cima, aberta     256px, com rótulo e seção que recolhe;
//   `md` para cima, recolhida   64px, só ícone, com a dica à direita;
//   abaixo de `md`              gaveta por cima do conteúdo, fechada por padrão.
//
// A gaveta é `fixed` e sai do fluxo: ela NÃO empurra o conteúdo, senão abrir o
// menu no celular reintroduziria exatamente a rolagem horizontal que esta barra
// existe para eliminar.
// ═══════════════════════════════════════════════════════════════════════════

export default function AppSidebar() {
  const location = useLocation();
  const {
    recolhida, abertaNoCelular, gruposFechados, alternarRecolhida, alternarGrupo, fecharNoCelular,
  } = useBarraLateral();
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
  // Filtrar só os itens deixaria "Gestão" como um título com nada embaixo para
  // quem não alcança o cargo dela: um cabeçalho de seção vazio é pior do que a
  // seção não existir, porque parece coisa que não carregou.
  //
  // `useMemo` porque `pode` só troca quando a sessão troca: sem ele, a lista
  // inteira é remontada a cada render da barra, que acontece em toda navegação.
  const visiveis = useMemo(
    () => GRUPOS_DE_MENU
      .map((grupo) => ({
        ...grupo,
        // SEM CARGO = TODO MUNDO VÊ. Hoje nenhum item está nesse caso (D148,
        // D156), e o campo segue opcional para a próxima tela desse tipo.
        itens: grupo.itens.filter((item) => item.cargo === undefined || pode(item.cargo)),
      }))
      .filter((grupo) => grupo.itens.length > 0),
    [pode],
  );

  const largura = recolhida ? 'md:w-16' : 'md:w-64';
  // Na gaveta do celular a barra está sempre aberta: a preferência é do desktop.
  const soIcones = recolhida && !abertaNoCelular;

  const desenharItem = ({ to, label, icon: Icon }: (typeof visiveis)[number]['itens'][number]) => {
    const ativo = itemEstaAtivo(to, location.pathname);
    const link = (
      <Link
        key={to}
        to={to}
        aria-label={label}
        aria-current={ativo ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          ativo
            ? 'bg-primary text-primary-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent',
          soIcones && 'justify-center',
        )}
      >
        {ativo && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary-foreground/70" />}
        <Icon className="size-5 shrink-0" />
        {!soIcones && <span className="truncate">{label}</span>}
      </Link>
    );

    if (!soIcones) return link;
    return (
      <Tooltip key={to}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          // `fixed` abaixo de `md` (gaveta, fora do fluxo) e `sticky` a partir
          // dele (coluna no fluxo, acompanhando a rolagem da página).
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0',
          'md:sticky md:top-0 md:z-30 md:h-screen md:translate-x-0',
          largura,
          abertaNoCelular ? 'translate-x-0' : '-translate-x-full',
          'flex flex-col bg-sidebar text-sidebar-foreground transition-[width,transform] duration-300',
        )}
      >
        {/* ── MARCA ─────────────────────────────────────────────────────────
            Mesma altura do cabeçalho (`h-14`) de propósito. O botão de recolher
            mora aqui, ao lado dela; na gaveta ele é o X. */}
        <div className={cn('flex h-14 shrink-0 items-center gap-2 px-4', soIcones ? 'justify-center px-0' : 'justify-between')}>
          {!soIcones && (
            // `/computadores` e não `/`: a raiz REDIRECIONA para cá (src/App.tsx), e
            // clicar na marca empilhava uma entrada de histórico que o
            // redirecionamento substituía.
            <Link to="/computadores" className="flex min-w-0 items-center gap-2" title="Sentinel">
              <SentinelLogo className="-mx-2 size-10" />
              <h1 className="truncate text-lg font-bold tracking-tight text-primary">Sentinel</h1>
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={alternarRecolhida}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className="hidden text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:inline-flex"
          >
            {recolhida ? <Menu /> : <ChevronLeft />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fecharNoCelular}
            aria-label="Fechar menu"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          >
            <X />
          </Button>
        </div>

        {/* ── ITENS ─────────────────────────────────────────────────────────
            `overflow-y-auto` com `min-h-0`: numa janela baixa a lista rola DENTRO
            da barra. Sem o `min-h-0`, o flex item não encolhe. */}
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden p-2">
          {visiveis.map((grupo, indice) => {
            const titulo = grupo.titulo ?? '';
            const fechado = gruposFechados.includes(titulo);

            // Recolhida: um traço entre as seções, e a seção fechada some.
            if (soIcones) {
              if (fechado) return null;
              return (
                <div key={titulo} className="space-y-1">
                  {indice > 0 && <div className="mx-2 my-2 border-t border-sidebar-border" />}
                  {grupo.itens.map(desenharItem)}
                </div>
              );
            }

            return (
              <Collapsible key={titulo} open={!fechado} onOpenChange={() => alternarGrupo(titulo)} className="space-y-1">
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 pb-1 pt-3 text-xs font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground">
                  <span>{grupo.titulo}</span>
                  <ChevronDown className={cn('size-3.5 opacity-60 transition-transform duration-200', fechado && '-rotate-90')} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-1">
                  {grupo.itens.map(desenharItem)}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
