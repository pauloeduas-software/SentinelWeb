import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { presentEndpoint, type PresentedEndpoint } from '../helpers/present-endpoint.helper';
import { buildEndpointWhere, type EndpointSortable, type FiltrosDeEndpoint } from '../helpers/endpoint-filters.helper';

// Máquinas descobertas pelo agente, cada uma com a amostra de telemetria mais
// recente. Sem ORDER BY o Postgres devolve em ordem arbitrária e os cards
// trocavam de lugar a cada atualização do painel.
export async function listEndpoints(
  query: ListQuery<EndpointSortable>,
  filtros: Omit<FiltrosDeEndpoint, 'q'> = {},
): Promise<ListEnvelope<PresentedEndpoint>> {
  const where = buildEndpointWhere({ ...filtros, q: query.q });

  const [total, endpoints] = await prisma.$transaction([
    prisma.endpoint.count({ where }),
    prisma.endpoint.findMany({
      where,
      include: {
        // `include` aqui é intencional: a telemetria é o conteúdo do card, e o
        // model `Endpoint` não recebe campo sensível (o `select` obrigatório vale
        // para `User`, que ganha `passwordHash` na Fase 3).
        telemetries: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows: endpoints.map(presentEndpoint) };
}
