import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import {
  OCUPANTES_ABERTOS_ORDER_BY, buildWorkstationWhere,
  type WorkstationView,
} from '../helpers/workstation-filters.helper';
import {
  WORKSTATION_OCCUPANT_SELECT, WORKSTATION_SELECT,
} from '../helpers/workstation-select.helper';
import { agruparOcupantes, montarLinhaDePosto, type WorkstationRow } from '../helpers/workstation-row.helper';

/**
 * Os POSTOS DE TRABALHO, com o que a tela precisa por linha.
 *
 * O posto é o coração do modelo (docs/referencia/modelo-de-posse.md): esta
 * rota lê `workstations`, `workstation_occupants` e `assignments` e devolve,
 * por linha, quem está nele e quantos ativos tem.
 *
 * NÚMERO FIXO DE CONSULTAS, venham 1 ou 100 postos:
 *   1. a contagem e 2. a página (na mesma transação, com o `_count` dos ativos)
 *   3. os ocupantes abertos de TODOS os postos da página, de uma vez
 *
 * O caminho ingênuo — perguntar os ocupantes por linha — seria N+1 sobre
 * uma página que vai a 100.
 */
export async function listWorkstations(
  query: ListQuery,
  view: WorkstationView,
): Promise<ListEnvelope<WorkstationRow>> {
  const where = buildWorkstationWhere(query.q, view);

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um posto criado entre uma e outra faz o total não bater
  // com o que a página mostra.
  const [total, postos] = await prisma.$transaction([
    prisma.workstation.count({ where }),
    prisma.workstation.findMany({
      where,
      select: WORKSTATION_SELECT,
      orderBy: { name: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  // Página vazia: nada a perguntar sobre ocupantes.
  if (postos.length === 0) return { total, rows: [] };

  const ocupacoes = await prisma.workstationOccupant.findMany({
    where: { workstationId: { in: postos.map((posto) => posto.id) }, endedAt: null },
    select: WORKSTATION_OCCUPANT_SELECT,
    orderBy: OCUPANTES_ABERTOS_ORDER_BY,
  });

  const ocupantesPorPosto = agruparOcupantes(ocupacoes);

  return {
    total,
    rows: postos.map((posto) => montarLinhaDePosto(posto, ocupantesPorPosto)),
  };
}
