import {
  Armchair, Boxes, Contact, Database, Radar, ScrollText, SlidersHorizontal, Users, type LucideIcon,
} from 'lucide-react';

// O MENU, declarado em um lugar só — a barra lateral desenha, o cabeçalho lê
// para descobrir o nome da tela atual.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE SAIU DO CABEÇALHO (e por que isto é correção de defeito, não enfeite).
//
// Os itens moravam numa `<nav>` horizontal dentro do `<header>`. O menu era bem
// maior antes do corte de escopo, e com catorze deles a barra passava de 1500px
// de conteúdo: o `<header>` ficava mais largo que a janela, e como ele é
// `sticky`, a PÁGINA INTEIRA ganhava barra de rolagem horizontal — em toda tela,
// inclusive nas que não têm tabela larga. Rolar para o lado para achar um link de
// menu é o sintoma; a causa era a barra competir por largura com o conteúdo.
//
// E abaixo de `md` a `<nav>` era `hidden`: no celular e na janela estreita não
// havia navegação NENHUMA — só o logo e o botão de sair. O menu não ficava
// apertado, ele desaparecia.
//
// Na vertical o número de itens para de ser um problema de largura: eles cabem
// numa coluna de 220px, e a lista cresce para baixo, onde há espaço.
// ═══════════════════════════════════════════════════════════════════════════

interface ItemDeMenu {
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * O cargo mínimo que a tela deste item exige.
   *
   * É o MESMO que o servidor exige na rota principal da tela — não uma segunda
   * regra. O item que o cargo da sessão não alcança não é desenhado: um item que
   * leva a uma tela que não carrega é pior do que um menu com um item a menos.
   *
   * ⚠️ Esconder NÃO protege: a autorização é o `preHandler` do servidor
   * (`server/core/http/permission-guard.ts`), que recusa a requisição antes de
   * qualquer tela existir. Isto é interface, e é por isso que os cargos
   * daqui podem estar incompletos sem consequência de segurança — o pior caso é
   * um item visível que responde 403.
   *
   * **AUSENTE quer dizer "todo mundo vê"**, e hoje nenhum item dispensa cargo.
   * O campo continua opcional porque a próxima tela desse tipo não deve
   * precisar de mudança de tipo para existir.
   */
  cargo?: 'ADMIN';
}

interface GrupoDeMenu {
  /** Vira o rótulo da seção. `null` deixa o grupo sem cabeçalho. */
  titulo: string | null;
  itens: readonly ItemDeMenu[];
}

// OS GRUPOS SÃO O QUE A VERTICAL PERMITIU E A HORIZONTAL NÃO.
//
// Em linha, os links eram uma fila sem hierarquia: o último entrava ao lado de
// "Config" por ter sobrado ali. Em coluna há onde escrever o título da seção, e
// a ordem passa a dizer algo — operação diária em cima, sistema embaixo, porque
// é essa a frequência de uso.
//
// AS SEÇÕES SÃO POR ASSUNTO (AH): o que se patrimonia e onde fica, o que se
// conta e se distribui, o que o agente vê, e quem recebe.
export const GRUPOS_DE_MENU: readonly GrupoDeMenu[] = [
  {
    titulo: 'Ativos',
    itens: [
      // COMPUTADORES É O PRIMEIRO ITEM, e antes dele havia Telemetria em `/`. A
      // tela da frota saiu: ela media as máquinas sem saber de quem são, e a
      // medida foi para a ficha do ativo e a do posto, onde a máquina tem nome.
      // A raiz passou a redirecionar para cá (src/App.tsx), então nenhum item
      // aponta mais para `/`. Chamava-se Ativos, e virou o nome da seção: o que
      // a tela lista são computadores — ativo é computador (decisão I).
      { to: '/computadores', label: 'Computadores', icon: Database, cargo: 'ADMIN' },
      // Logo depois: é a mesma operação vista do outro lado — o computador
      // está na mesa, e a mesa é de quem a ocupa (docs/referencia/modelo-de-posse.md).
      { to: '/postos', label: 'Postos', icon: Armchair, cargo: 'ADMIN' },
    ],
  },
  {
    // O que se CONTA em vez de patrimoniar: quantos há e com quem estão os
    // outros — a mesma lógica nos dois (AE).
    titulo: 'Recursos',
    itens: [
      // O que sai do almoxarifado costuma ir para a mesa (docs/decisoes/estoque.md).
      { to: '/estoque', label: 'Estoque', icon: Boxes, cargo: 'ADMIN' },
      // Licença também é posse: cada entrega é uma linha, a um colaborador ou a
      // um computador (AA).
      { to: '/licencas', label: 'Licenças', icon: ScrollText, cargo: 'ADMIN' },
    ],
  },
  {
    titulo: 'Convergência',
    itens: [
      // O que o agente VÊ e o cadastro não sabe (F7). Perto do inventário
      // porque é dele que a tela fala, não do RMM.
      { to: '/descobertas', label: 'Descobertas', icon: Radar, cargo: 'ADMIN' },
    ],
  },
  {
    // Quem RECEBE equipamento. Saiu de Configurações por ser operação de toda
    // semana, não referência (AH). Seção à parte de Gestão de propósito: conta
    // de login e colaborador são coisas diferentes (U).
    titulo: 'Pessoas',
    itens: [
      { to: '/colaboradores', label: 'Colaboradores', icon: Contact, cargo: 'ADMIN' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { to: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal, cargo: 'ADMIN' },
    ],
  },
  {
    // A última, por escolha do usuário (AH).
    titulo: 'Gestão',
    itens: [
      { to: '/usuarios', label: 'Usuários', icon: Users, cargo: 'ADMIN' },
    ],
  },
];

/** Todos os itens, achatados — para quem precisa procurar sem olhar grupo. */
const ITENS_DE_MENU: readonly ItemDeMenu[] = GRUPOS_DE_MENU.flatMap((grupo) => grupo.itens);

/**
 * Este item está ativo para o caminho atual?
 *
 * PREFIXO, e não igualdade: a tela de detalhe do ativo mora em `/computadores/:id` e
 * precisa manter *Computadores* aceso — com igualdade, o menu apagava inteiro assim
 * que se abria um ativo.
 *
 * O prefixo é comparado com a BARRA no fim (`${to}/`), e é isso que torna a raiz
 * um caso comum em vez de especial: havia aqui um ramo `to === '/'` pela
 * preocupação de que todo caminho comece com `/`, mas `'/computadores'.startsWith('//')`
 * é falso — o ramo nunca mudou resposta nenhuma. Ele saiu junto com o item de
 * Telemetria, que era o único a morar em `/`.
 */
export function itemEstaAtivo(to: string, caminho: string): boolean {
  return caminho === to || caminho.startsWith(`${to}/`);
}

/**
 * O nome da tela atual, para o cabeçalho.
 *
 * O item MAIS específico ganha: `/computadores/:id` casa `/computadores`, e se um dia houver
 * `/computadores/algo` as duas casariam — a mais longa é a certa.
 */
export function nomeDaTela(caminho: string): string | null {
  const casados = ITENS_DE_MENU.filter((item) => itemEstaAtivo(item.to, caminho));
  if (casados.length === 0) return null;
  return casados.reduce((maior, item) => (item.to.length > maior.to.length ? item : maior)).label;
}
