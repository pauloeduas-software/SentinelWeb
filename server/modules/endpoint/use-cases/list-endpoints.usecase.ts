import { prisma } from '../../../infra/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import { MAQUINA_DA_LISTA_SELECT, type MaquinaDaLista } from '../helpers/present-endpoint.helper';
import { buildEndpointWhere, type FiltrosDeEndpoint } from '../helpers/endpoint-filters.helper';

// Máquinas descobertas pelo agente. SEM telemetria: as tabelas de
// `/descobertas` não a mostram, e quem quer a amostra de UMA máquina usa
// `getEndpoint` (o porquê está lá). Sem ORDER BY o Postgres devolve em ordem
// arbitrária e as linhas trocavam de lugar a cada atualização do painel.
export async function listEndpoints(
  query: ListQuery,
  filtros: Omit<FiltrosDeEndpoint, 'q'> = {},
): Promise<ListEnvelope<MaquinaDaLista>> {
  const where = buildEndpointWhere({ ...filtros, q: query.q });

  const [total, endpoints] = await prisma.$transaction([
    prisma.endpoint.count({ where }),
    prisma.endpoint.findMany({
      where,
      // O patrimônio vai junto: é o que separa a lista de máquinas VINCULADAS
      // de uma lista de hostnames, em `/descobertas`.
      select: MAQUINA_DA_LISTA_SELECT,
      orderBy: { hostname: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows: endpoints };
}
