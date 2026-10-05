import {
  Armchair, Boxes, ClipboardCheck, Database, FileBarChart, FileUp, KeyRound,
  Laptop, QrCode, Radar, ScrollText, Server, ShieldCheck, SlidersHorizontal, Users, Wrench,
  type LucideIcon,
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
   * **AUSENTE quer dizer "todo mundo vê"**, e existe para as telas que falam sobre
   * QUEM ESTÁ OLHANDO: minha conta e meus equipamentos. As rotas delas também não
   * exigem chave nenhuma no servidor (as dispensas declaradas em
   * `access/helpers/route-permissions.ts`) — é a mesma decisão, dos dois lados:
   * ninguém precisa de autorização para cuidar da própria credencial nem para ver
   * o que está no próprio nome.
   */
  permissao?: string;
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
      { to: '/', label: 'Telemetria', icon: Server, permissao: 'endpoints.view' },
      { to: '/ativos', label: 'Ativos', icon: Database, permissao: 'assets.view' },
      // Logo depois de Ativos: é a mesma operação vista do outro lado — o ativo
      // está na mesa, e a mesa é de quem a ocupa (docs/referencia/modelo-de-posse.md).
      { to: '/postos', label: 'Postos', icon: Armchair, permissao: 'assets.view' },
      // Depois de Postos porque a entrega de acessório pende dele: os 5 mouses
      // da Mesa 1 são do POSTO, e quem responde são os ocupantes (D33).
      { to: '/estoque', label: 'Estoque', icon: Boxes, permissao: 'stock.view' },
      // Depois de Estoque porque é o mesmo desenho um passo adiante: lá o saldo
      // é calculado sobre unidades intercambiáveis, aqui o assento é uma LINHA
      // que se trava (D40). E porque licença também é posse — entra no
      // desligamento.
      { to: '/licencas', label: 'Licenças', icon: ScrollText, permissao: 'licenses.view' },
    ],
  },
  {
    titulo: 'Convergência',
    itens: [
      // O que o agente VÊ e o cadastro não sabe (F7). Perto do inventário
      // porque é dele que a tela fala, não do RMM.
      { to: '/descobertas', label: 'Descobertas', icon: Radar, permissao: 'endpoints.view' },
      { to: '/manutencoes', label: 'Manutenções', icon: Wrench, permissao: 'assets.view' },
      // AGORA TEM LUGAR NO MENU, e o motivo da ausência caducou junto com a
      // barra horizontal: `/auditorias` ficava de fora porque "a barra já tem
      // doze itens e desaparece abaixo de md". Na vertical não há essa disputa,
      // e esconder a tela de conferência fazia dela a única do sistema que só
      // se alcançava por dentro de outra.
      { to: '/auditorias', label: 'Auditorias', icon: ClipboardCheck, permissao: 'assets.view' },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { to: '/users', label: 'Usuários', icon: Users, permissao: 'users.view' },
      { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, permissao: 'reports.view' },
    ],
  },
  {
    // MINHA CONTA fica em grupo PRÓPRIO, no fim: ela não é operação (não fala de
    // ativo nenhum) nem sistema (não configura nada para os outros). É a única
    // seção que toda sessão vê, inclusive a de quem não tem chave nenhuma — e por
    // isso ela é também a última tela que sobra quando o acesso é removido.
    titulo: 'Minha conta',
    itens: [
      // PRIMEIRO os equipamentos, depois a conta: o colaborador comum abre o
      // painel para ver o que está no nome dele, não para mexer em credencial.
      { to: '/meus-equipamentos', label: 'Meus equipamentos', icon: Laptop },
      { to: '/minha-conta', label: 'Minha conta', icon: ShieldCheck },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { to: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal, permissao: 'catalog.manage' },
      { to: '/importacao', label: 'Importar', icon: FileUp, permissao: 'imports.manage' },
      { to: '/etiquetas', label: 'Etiquetas', icon: QrCode, permissao: 'labels.print' },
      { to: '/tokens', label: 'Tokens', icon: KeyRound, permissao: 'access.manage' },
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
