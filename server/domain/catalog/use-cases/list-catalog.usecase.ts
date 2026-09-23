import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { buildCatalogWhere } from '../helpers/catalog-where.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

export async function listCatalog(
  spec: CatalogSpec,
  query: ListQuery<string>,
): Promise<ListEnvelope<Record<string, unknown>>> {
  const where = buildCatalogWhere(spec.searchable, query.q);

  // Transação para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um cadastro entre uma e outra faz o total não bater com o
  // que a página mostra. É a forma interativa (e não `$transaction([...])`)
  // porque o delegate genérico devolve Promise, não PrismaPromise.
  return prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const total = await delegate.count({ where });
    const rows = await delegate.findMany({
      where,
      select: spec.select,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    });

    return { total, rows };
  });
}
