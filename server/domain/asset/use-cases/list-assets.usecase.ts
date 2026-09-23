import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { presentAsset, type PresentedAsset } from '../helpers/present-asset.helper';
import { buildAssetWhere, type AssetSortable } from '../helpers/asset-filters.helper';

// Máquinas descobertas pelo agente, cada uma com a amostra de telemetria mais
// recente. Sem ORDER BY o Postgres devolve em ordem arbitrária e os cards
// trocavam de lugar a cada atualização do painel.
export async function listAssets(
  query: ListQuery<AssetSortable>,
): Promise<ListEnvelope<PresentedAsset>> {
  const where = buildAssetWhere(query.q);

  const [total, assets] = await prisma.$transaction([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: {
        // `include` aqui é intencional: a telemetria é o conteúdo do card, e o
        // model `Asset` não recebe campo sensível (o `select` obrigatório vale
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

  return { total, rows: assets.map(presentAsset) };
}
