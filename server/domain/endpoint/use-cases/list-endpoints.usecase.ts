import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import {
  ATIVO_DA_MAQUINA_SELECT, presentEndpoint, type PresentedEndpoint,
} from '../helpers/present-endpoint.helper';
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
        // `include` aqui é intencional: o model `Endpoint` não recebe campo
        // sensível (o `select` obrigatório vale para `User`, que ganha
        // `passwordHash` na Fase 3).
        //
        // ⚠️ E ele é CARO no plural: com mais de um pai o Prisma não empurra o
        // `take: 1` para o SQL — emite `endpointId IN (…)` sem LIMIT e corta em
        // memória. Quem precisa da amostra de UMA máquina usa `getEndpoint`, que
        // tem um pai só e por isso vira `LIMIT 1` de verdade.
        telemetries: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        // O patrimônio de quem tem: é o que separa a lista de máquinas
        // VINCULADAS de uma lista de hostnames, em `/descobertas`.
        asset: ATIVO_DA_MAQUINA_SELECT,
      },
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows: endpoints.map(presentEndpoint) };
}
