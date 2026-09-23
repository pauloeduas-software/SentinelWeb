import { prisma } from '../../../core/database/prismaClient';
import { ASSIGNMENT_SELECT } from '../helpers/assignment-select.helper';
import { diasDeAtraso } from '../helpers/overdue.helper';
import { resolverResponsaveisEmLote, type PosseResolvida } from './resolve-responsibles.usecase';

// ITENS VENCIDOS — posse aberta cujo prazo de devolução já passou.
//
// Vencido é `checkinAt IS NULL AND expectedCheckinAt < now()`, e as duas
// metades importam: sem a primeira, um empréstimo devolvido com atraso
// apareceria para sempre na lista de pendências; sem a segunda, a lista seria
// "tudo que tem prazo".
//
// Entrega SEM prazo (`expectedCheckinAt` nulo) nunca vence — é o caso normal do
// equipamento de trabalho, que fica com a pessoa enquanto ela estiver na
// empresa. Quem fecha essa ponta é o desligamento (D32), não este relatório.

/**
 * Teto de linhas. NÃO é paginação, e não vira: esta é uma lista de TRABALHO —
 * quem tem mais de 100 devoluções vencidas tem um problema de processo, não de
 * navegação, e `total` continua contando o universo inteiro para que o número
 * apareça inteiro mesmo quando as linhas não cabem.
 */
const TETO_DE_LINHAS = 100;

/**
 * O ativo vem embutido porque a lista é lida POR ATIVO ("o notebook da Laura
 * venceu"), e não por posse: sem isto a tela faria uma consulta por linha (N+1)
 * só para escrever a etiqueta. Allowlist, como todo `select` do projeto.
 */
const VENCIDA_SELECT = {
  ...ASSIGNMENT_SELECT,
  asset: {
    select: {
      id: true,
      assetTag: true,
      name: true,
      status: { select: { id: true, name: true, color: true } },
      model: { select: { name: true, manufacturer: { select: { name: true } } } },
    },
  },
} as const;

type PosseVencida = Awaited<ReturnType<typeof buscarVencidas>>[number];

export type ItemVencido = PosseVencida & {
  /** Dias inteiros desde o prazo. 0 = venceu hoje. */
  diasDeAtraso: number;
  /** Quem responde pelo ativo hoje — Camada 3, resolvida em lote. */
  posse: PosseResolvida;
};

export interface RelatorioDeVencidos {
  /** Quantos estão vencidos AO TODO, mesmo que as linhas venham cortadas. */
  total: number;
  rows: ItemVencido[];
}

function buscarVencidas(agora: Date) {
  return prisma.assignment.findMany({
    where: where(agora),
    select: VENCIDA_SELECT,
    // O mais atrasado primeiro: a lista existe para ser trabalhada de cima para
    // baixo, e quem está há três meses sem devolver não pode ficar na página 2.
    orderBy: [{ expectedCheckinAt: 'asc' }, { createdAt: 'asc' }],
    take: TETO_DE_LINHAS,
  });
}

/**
 * O `asset: { deletedAt: null }` é EXPLÍCITO, e é um dos dois pontos cegos do
 * soft delete que a Fase 4 cruza: `assignments` não tem `deletedAt`, então a
 * extension (core/database/soft-delete.extension.ts) não escopa esta consulta —
 * e ela não alcança relação aninhada de jeito nenhum. Sem esta linha, um ativo
 * na lixeira com posse aberta e prazo vencido apareceria na cobrança de
 * devolução de um equipamento que já saiu do inventário.
 */
function where(agora: Date) {
  return {
    checkinAt: null,
    expectedCheckinAt: { lt: agora },
    asset: { deletedAt: null },
  } as const;
}

export async function listOverdueAssignments(): Promise<RelatorioDeVencidos> {
  // UM relógio para a consulta e para a conta de dias: lendo `new Date()` duas
  // vezes, uma posse que vence no instante entre as duas sairia na lista com
  // atraso negativo.
  const agora = new Date();

  const [total, vencidas] = await Promise.all([
    prisma.assignment.count({ where: where(agora) }),
    buscarVencidas(agora),
  ]);

  // A Camada 3 em lote: número CONSTANTE de consultas para as 100 linhas, em
  // vez de uma resolução por linha. É o mesmo caminho da listagem de ativos —
  // e é por isso que a posse do POSTO aparece aqui com Laura e Ana, e não com
  // o nome do posto sozinho.
  const posses = await resolverResponsaveisEmLote(prisma, vencidas.map((posse) => posse.assetId));

  return {
    total,
    rows: vencidas.map((posse) => ({
      ...posse,
      // `expectedCheckinAt` não é nulo aqui por construção (o `where` exige
      // `lt`), mas o tipo do Prisma não sabe disso — o `?? agora` dá 0 dia em
      // vez de `NaN` se a consulta mudar um dia.
      diasDeAtraso: diasDeAtraso(posse.expectedCheckinAt ?? agora, agora),
      posse: posses.get(posse.assetId) ?? {
        assignmentId: posse.id,
        targetType: posse.targetType,
        targetLabel: null,
        responsaveis: [],
        postoVago: false,
      },
    })),
  };
}
