import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import {
  OCUPANTES_ABERTOS_ORDER_BY, buildWorkstationWhere,
  type WorkstationSortable, type WorkstationView,
} from '../helpers/workstation-filters.helper';
import {
  WORKSTATION_OCCUPANT_SELECT, WORKSTATION_SELECT,
} from '../helpers/workstation-select.helper';
import { agruparOcupantes, montarLinhaDePosto, type WorkstationRow } from '../helpers/workstation-row.helper';

/**
 * Os POSTOS DE TRABALHO, com o que a tela precisa por linha.
 *
 * O posto é o coração do modelo (docs/referencia/modelo-de-posse.md) e estava invisível:
 * chegava-se a ele pela 6ª aba de Configurações, por um ícone pequeno numa
 * linha de catálogo. Esta rota é a superfície que faltava — e não um modelo
 * novo: continua lendo `locations`, `location_occupants` e `assignments`.
 *
 * NÚMERO FIXO DE CONSULTAS, venham 1 ou 100 postos:
 *   1. a contagem e 2. a página (na mesma transação, com o `_count` dos ativos)
 *   3. os ocupantes abertos de TODOS os postos da página, de uma vez
 *
 * O caminho ingênuo — perguntar os ocupantes por linha — seria N+1 sobre
 * uma página que vai a 100.
 */
export async function listWorkstations(
  query: ListQuery<WorkstationSortable>,
  view: WorkstationView,
): Promise<ListEnvelope<WorkstationRow>> {
  const where = buildWorkstationWhere(query.q, view);

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um posto criado entre uma e outra faz o total não bater
  // com o que a página mostra.
  const [total, locais] = await prisma.$transaction([
    prisma.location.count({ where }),
    prisma.location.findMany({
      where,
      select: WORKSTATION_SELECT,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  // Página vazia: nada a perguntar sobre ocupantes.
  if (locais.length === 0) return { total, rows: [] };

  const ocupacoes = await prisma.locationOccupant.findMany({
    where: { locationId: { in: locais.map((local) => local.id) }, endedAt: null },
    select: WORKSTATION_OCCUPANT_SELECT,
    orderBy: OCUPANTES_ABERTOS_ORDER_BY,
  });

  const ocupantesPorPosto = agruparOcupantes(ocupacoes);

  return {
    total,
    rows: locais.map((local) => montarLinhaDePosto(local, ocupantesPorPosto)),
  };
}
