import { $Enums } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { SEM_BAIXA } from '../helpers/asset-filters.helper';

// Contadores do cabeçalho da tela de ativos. Rota própria porque, com paginação,
// `rows.length` conta só a página atual — a agregação roda FORA do skip/take.
export interface AssetStats {
  /** O que a listagem PADRÃO mostra: sem o baixado e sem a lixeira. */
  total: number;
  byStatus: {
    id: string;
    name: string;
    type: $Enums.StatusLabelType;
    total: number;
  }[];
  /**
   * Quantos saíram do PATRIMÔNIO (`retiredAt`), que é o que a vista
   * `?view=retired` mostra e o que `total` NÃO conta.
   *
   * Vem junto porque o cabeçalho ficou clicável: cada contador virou filtro
   * (`?statusId=`), e um número que não bate com a lista que ele abre é pior
   * que número nenhum.
   */
  retired: number;
}

/**
 * O cabeçalho mostra TODOS os status, inclusive os zerados: um contador em zero
 * é informação — "não há nada inutilizável" vale tanto quanto o número.
 */
export async function getAssetStats(): Promise<AssetStats> {
  // `SEM_BAIXA`, porque a listagem padrão o exclui: o contador do cabeçalho é o
  // cabeçalho DAQUELA lista, e contar aqui o notebook vendido faria o badge
  // prometer uma linha que a tabela não mostra.
  const [grupos, rotulos, retired] = await Promise.all([
    prisma.asset.groupBy({ by: ['statusId'], where: SEM_BAIXA, _count: { _all: true } }),
    prisma.statusLabel.findMany({ select: { id: true, name: true, type: true } }),
    prisma.asset.count({ where: { retiredAt: { not: null } } }),
  ]);

  const contagem = new Map(grupos.map((grupo) => [grupo.statusId, grupo._count._all]));

  const byStatus = rotulos
    .map((rotulo) => ({ ...rotulo, total: contagem.get(rotulo.id) ?? 0 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));

  return {
    // `total` conta o que a listagem PADRÃO mostra, e ela exclui o baixado: o
    // cabeçalho é o cabeçalho DAQUELA lista, e prometer uma linha que a tabela
    // não mostra é o defeito que este contador existe para não ter.
    total: byStatus.reduce((soma, rotulo) => soma + rotulo.total, 0),
    byStatus,
    retired,
  };
}
