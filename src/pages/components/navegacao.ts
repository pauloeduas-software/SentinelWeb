import {
  Armchair, Database, Radar, ScrollText, Server, SlidersHorizontal, Users, type LucideIcon,
} from 'lucide-react';

// O MENU, declarado em um lugar só — a barra lateral desenha, o cabeçalho lê
// para descobrir o nome da tela atual.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE SAIU DO CABEÇALHO (e por que isto é correção de defeito, não enfeite).
//
// Os itens moravam numa `<nav>` horizontal dentro do `<header>`. Com catorze
// deles, a barra passava de 1500px de conteúdo: o `<header>` ficava mais largo
// que a janela, e como ele é `sticky`, a PÁGINA INTEIRA ganhava barra de rolagem
// horizontal — em toda tela, inclusive nas que não têm tabela larga. Rolar para
// o lado para achar um link de menu é o sintoma; a causa era a barra competir
// por largura com o conteúdo.
//
// E abaixo de `md` a `<nav>` era `hidden`: no celular e na janela estreita não
// havia navegação NENHUMA — só o logo e o botão de sair. O menu não ficava
// apertado, ele desaparecia.
//
// Na vertical o número de itens para de ser um problema de largura: quinze
// cabem numa coluna de 220px, e a lista cresce para baixo, onde há espaço.
// ═══════════════════════════════════════════════════════════════════════════

export interface ItemDeMenu {
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * A chave que a tela deste item exige (F11).
   *
   * É a MESMA que o servidor exige na rota principal da tela — não uma segunda
   * regra. O item sem a chave não é desenhado: um *Importar* que leva a uma tela
   * que não carrega é pior do que um menu com um item a menos.
   *
   * ⚠️ Esconder NÃO protege: a autorização é o `preHandler` do servidor
   * (`server/core/http/permission-guard.ts`), que recusa a requisição antes de
   * qualquer tela existir. Isto é interface, e é por isso que a lista de chaves
   * daqui pode estar incompleta sem consequência de segurança — o pior caso é
   * um item visível que responde 403.
   *
   * **AUSENTE quer dizer "todo mundo vê"**, e hoje nenhum item dispensa papel:
   * toda sessão é `TECNICO` ou `ADMIN`, porque `USUARIO` não entra no painel —
   * o login o recusa com 403 (`login.usecase.ts`). O campo continua opcional
   * porque a próxima tela desse tipo não deve precisar de mudança de tipo para
   * existir.
   */
  papel?: 'TECNICO' | 'ADMIN';
}

export interface GrupoDeMenu {
  /** Vira o rótulo da seção. `null` deixa o grupo sem cabeçalho. */
  titulo: string | null;
  itens: readonly ItemDeMenu[];
}

// OS GRUPOS SÃO O QUE A VERTICAL PERMITIU E A HORIZONTAL NÃO.
//
// Em linha, quinze links eram uma fila sem hierarquia: "Etiquetas" ficava do
// lado de "Config" por ter sobrado ali. Em coluna há onde escrever o título da
// seção, e a ordem passa a dizer algo — operação diária em cima, sistema
// embaixo, porque é essa a frequência de uso.
export const GRUPOS_DE_MENU: readonly GrupoDeMenu[] = [
  {
    titulo: 'Operação',
    itens: [
      { to: '/', label: 'Telemetria', icon: Server, papel: 'TECNICO' },
      { to: '/ativos', label: 'Ativos', icon: Database, papel: 'TECNICO' },
      // Logo depois de Ativos: é a mesma operação vista do outro lado — o ativo
      // está na mesa, e a mesa é de quem a ocupa (docs/referencia/modelo-de-posse.md).
      { to: '/postos', label: 'Postos', icon: Armchair, papel: 'TECNICO' },
      // Depois de Postos porque licença também é posse: o assento é uma LINHA
      // que se trava (D40).
      { to: '/licencas', label: 'Licenças', icon: ScrollText, papel: 'TECNICO' },
    ],
  },
  {
    titulo: 'Convergência',
    itens: [
      // O que o agente VÊ e o cadastro não sabe (F7). Perto do inventário
      // porque é dele que a tela fala, não do RMM.
      { to: '/descobertas', label: 'Descobertas', icon: Radar, papel: 'TECNICO' },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { to: '/users', label: 'Usuários', icon: Users, papel: 'TECNICO' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { to: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal, papel: 'ADMIN' },
    ],
  },
];

/** Todos os itens, achatados — para quem precisa procurar sem olhar grupo. */
export const ITENS_DE_MENU: readonly ItemDeMenu[] = GRUPOS_DE_MENU.flatMap((grupo) => grupo.itens);

/**
 * Este item está ativo para o caminho atual?
 *
 * PREFIXO, e não igualdade: a tela de detalhe do ativo mora em `/ativos/:id` e
 * precisa manter *Ativos* aceso — com igualdade, o menu apagava inteiro assim
 * que se abria um ativo. A raiz é o caso à parte, porque todo caminho começa
 * com `/`.
 */
export function itemEstaAtivo(to: string, caminho: string): boolean {
  return to === '/' ? caminho === '/' : caminho === to || caminho.startsWith(`${to}/`);
}

/**
 * O nome da tela atual, para o cabeçalho.
 *
 * O item MAIS específico ganha: `/users/:id` casa `/users`, e se um dia houver
 * `/users/grupos` as duas casariam — a mais longa é a certa.
 */
export function nomeDaTela(caminho: string): string | null {
  const casados = ITENS_DE_MENU.filter((item) => itemEstaAtivo(item.to, caminho));
  if (casados.length === 0) return null;
  return casados.reduce((maior, item) => (item.to.length > maior.to.length ? item : maior)).label;
}
