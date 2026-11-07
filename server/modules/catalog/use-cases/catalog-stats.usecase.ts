import { prisma } from '../../../infra/database/prismaClient';
import type { CatalogSpec } from '../specs/catalog-spec.types';

// OS CARTÕES DA TELA DE COLABORADORES (BT). Rota própria porque a listagem só sabe o
// total do recorte aberto. Cada número é o total da lista que ele abre, sem a busca, e a
// lixeira não entra: a extension de soft delete a esconde.
export interface CatalogStats {
  total: number;
  ativos: number;
  desativados: number;
}

export async function getCatalogStats(spec: CatalogSpec): Promise<CatalogStats> {
  // Na mesma transação: um cadastro novo entre duas contagens faria os recortes
  // deixarem de somar o total. A forma interativa, como na listagem, porque o delegate
  // genérico devolve Promise, não PrismaPromise.
  return prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const total = await delegate.count({});
    const ativos = await delegate.count({ where: { isActive: true } });
    const desativados = await delegate.count({ where: { isActive: false } });

    return { total, ativos, desativados };
  });
}
