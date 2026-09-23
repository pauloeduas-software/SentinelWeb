import type { Prisma } from '@prisma/client';

// Recortes e ordem da listagem de postos — funções puras, sem I/O.

/**
 * As três perguntas que a tela de postos faz.
 *
 * `vagos` é a que justifica a tela existir: posto com equipamento e SEM
 * ninguém respondendo por ele é sinal operacional, não erro de cadastro
 * (docs/MODELO-POSSE.md, "Como isso amarra no status", item 3).
 *
 * `ocupados` é o complemento útil — quem está de fato em serviço —, e NÃO é o
 * inverso exato de `vagos`: um posto recém-criado, sem ativo e sem gente, não
 * é nem um nem outro. Ele aparece só em `todos`, que é o padrão.
 *
 * Nomes diferentes do `active|trashed` do `core/http/list-query.ts` de
 * propósito: lá o par fala de lixeira, aqui fala de ocupação. Reaproveitar a
 * palavra faria parecer que um posto vago foi excluído.
 */
export type WorkstationView = 'todos' | 'vagos' | 'ocupados';

export type WorkstationSortable = 'name' | 'createdAt';

/** Allowlist de ordenação exigida pelo `parseListQuery`. */
export const WORKSTATION_SORTABLE: readonly [WorkstationSortable, ...WorkstationSortable[]] = [
  'name',
  'createdAt',
];

/**
 * Uma posse ABERTA apontando para o posto — o que faz um ativo "estar entregue"
 * à mesa (docs/MODELO-POSSE.md, Camada 1).
 *
 * `asset: { deletedAt: null }` escrito à mão porque a `softDeleteExtension` só
 * age no model do topo da consulta: num filtro de relação aninhado ela não
 * entra, e o ativo mandado para a lixeira continuaria contando como equipamento
 * na mesa — inflando o número da tela e criando "posto vago" onde não há
 * equipamento nenhum.
 */
export const POSSE_ABERTA: Prisma.AssignmentWhereInput = {
  targetType: 'LOCATION',
  checkinAt: null,
  asset: { deletedAt: null },
};

/** Ocupação ABERTA — `endedAt` nulo. É quem responde pelo posto agora. */
const OCUPACAO_ABERTA: Prisma.LocationOccupantWhereInput = { endedAt: null };

/**
 * Ordem dos ocupantes abertos de um posto.
 *
 * TURNO primeiro, e não data: a linha do posto se lê como "Manhã · Laura /
 * Tarde · Ana", então o turno é o eixo da leitura. Antiguidade desempata, para
 * a lista sair igual a cada consulta — ordem instável faz a tabela "piscar"
 * entre dois refreshes idênticos. É a mesma ordem do `resolve-responsibles`.
 */
export const OCUPANTES_ABERTOS_ORDER_BY: Prisma.LocationOccupantOrderByWithRelationInput[] = [
  { shift: 'asc' },
  { startedAt: 'asc' },
];

/**
 * A busca `?q=` varre nome, notas e o NOME DO PAI.
 *
 * O pai entra porque a pergunta real de quem procura um posto é "as mesas da
 * Sala 3" — e o nome da sala não está em nenhuma coluna da mesa. Sem isso,
 * achar um posto exigiria lembrar como ele foi nomeado.
 */
function buildBuscaWhere(q?: string): Prisma.LocationWhereInput {
  if (!q) return {};

  // `mode: 'insensitive'` é obrigatório: sem ele "mesa" não acha "Mesa 1".
  const contem = { contains: q, mode: 'insensitive' as const };
  return { OR: [{ name: contem }, { notes: contem }, { parent: { name: contem } }] };
}

/**
 * O recorte de ocupação, expresso em `where` e não filtrado depois em memória.
 *
 * Tem que ser assim: filtrar a página já paginada faria o `total` do envelope
 * contar postos que a tela não mostra, e a paginação passaria a pular linhas.
 */
function buildVisaoWhere(view: WorkstationView): Prisma.LocationWhereInput {
  if (view === 'ocupados') return { occupants: { some: OCUPACAO_ABERTA } };

  // VAGO = tem equipamento e não tem ninguém. As duas metades são necessárias:
  // sem a segunda, todo posto recém-criado apareceria como vago, e o sinal —
  // que é sobre equipamento parado — viraria ruído de cadastro.
  if (view === 'vagos') {
    return { occupants: { none: OCUPACAO_ABERTA }, assignments: { some: POSSE_ABERTA } };
  }

  return {};
}

/**
 * O `where` da listagem.
 *
 * `isWorkstation: true` é o corte da rota inteira: /postos mostra MESA, não
 * filial. Uma localização que é mesa e nunca foi marcada não aparece aqui — a
 * marca é justamente o que a tela usa para saber a diferença, e marcar é um
 * clique em Configurações › Localizações.
 */
export function buildWorkstationWhere(
  q: string | undefined,
  view: WorkstationView,
): Prisma.LocationWhereInput {
  return {
    isWorkstation: true,
    ...buildBuscaWhere(q),
    ...buildVisaoWhere(view),
  };
}
