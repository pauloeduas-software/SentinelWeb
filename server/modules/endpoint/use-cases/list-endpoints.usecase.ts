import { prisma } from '../../../infra/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import {
  ATIVO_DA_MAQUINA_SELECT, presentEndpoint, type PresentedEndpoint,
} from '../helpers/present-endpoint.helper';
import { buildEndpointWhere, type FiltrosDeEndpoint } from '../helpers/endpoint-filters.helper';

// Máquinas descobertas pelo agente. SEM telemetria: as tabelas de
// `/descobertas` não a mostram, e quem quer a amostra de UMA máquina usa
// `getEndpoint` (o porquê está lá). Sem ORDER BY o Postgres devolve em ordem
// arbitrária e as linhas trocavam de lugar a cada atualização do painel.
export async function listEndpoints(
  query: ListQuery,
  filtros: Omit<FiltrosDeEndpoint, 'q'> = {},
): Promise<ListEnvelope<PresentedEndpoint>> {
  const where = buildEndpointWhere({ ...filtros, q: query.q });

  const [total, endpoints] = await prisma.$transaction([
    prisma.endpoint.count({ where }),
    prisma.endpoint.findMany({
      where,
      // `include` aqui é intencional: o model `Endpoint` não recebe campo
      // sensível (o `select` obrigatório vale para `User`, que ganha
      // `passwordHash` na Fase 3).
      include: {
        // O patrimônio de quem tem: é o que separa a lista de máquinas
        // VINCULADAS de uma lista de hostnames, em `/descobertas`.
        asset: ATIVO_DA_MAQUINA_SELECT,
      },
      orderBy: { hostname: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows: endpoints.map(presentEndpoint) };
}
