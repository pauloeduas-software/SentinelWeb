import { $Enums } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { SEM_BAIXA } from '../helpers/asset-filters.helper';

// Contadores do cabeçalho da tela de ativos. Rota própria porque, com paginação,
// `rows.length` conta só a página atual — a agregação roda FORA do skip/take.
export interface AssetStats {
  /** O que a listagem PADRÃO mostra: sem o baixado e sem a lixeira. */
  total: number;
  /** Quantos em cada TIPO de status, os zerados inclusive: é o tipo que vira cartão (BT). */
  byType: Record<$Enums.StatusLabelType, number>;
  /**
   * Quantos saíram do PATRIMÔNIO (`retiredAt`), que é o que a vista
   * `?view=retired` mostra e o que `total` NÃO conta.
   *
   * Vem junto porque o cabeçalho ficou clicável: cada contador virou filtro
   * (`?statusType=`), e um número que não bate com a lista que ele abre é pior
   * que número nenhum.
   */
  retired: number;
  /** Quantos em cada MOTIVO de baixa, os zerados inclusive: são os cartões da vista Baixados (BV). */
  byRetiredReason: { id: string; name: string; total: number }[];
}

/**
 * UM CARTÃO POR TIPO, E NÃO POR STATUS (BT): o status é cadastro livre, e cada um novo
 * seria mais um cartão. O tipo são quatro, sempre, e um zerado é informação: "não há nada
 * inutilizável" vale tanto quanto o número.
 */
export async function getAssetStats(): Promise<AssetStats> {
  // `SEM_BAIXA`, porque a listagem padrão o exclui: o contador do cabeçalho é o
  // cabeçalho DAQUELA lista, e contar aqui o notebook vendido faria o badge
  // prometer uma linha que a tabela não mostra.
  const porTipo = (type: $Enums.StatusLabelType) => prisma.asset.count({ where: { ...SEM_BAIXA, status: { type } } });

  const baixados = { retiredAt: { not: null } };

  const [DEPLOYABLE, IN_USE, PENDING, UNDEPLOYABLE, retired, grupos, motivos] = await Promise.all([
    porTipo('DEPLOYABLE'),
    porTipo('IN_USE'),
    porTipo('PENDING'),
    porTipo('UNDEPLOYABLE'),
    prisma.asset.count({ where: baixados }),
    prisma.asset.groupBy({ by: ['retiredReasonId'], where: baixados, _count: { _all: true } }),
    prisma.retireReason.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const porMotivo = new Map(grupos.map((grupo) => [grupo.retiredReasonId, grupo._count._all]));

  return {
    // `total` conta o que a listagem PADRÃO mostra, e ela exclui o baixado: o
    // cabeçalho é o cabeçalho DAQUELA lista, e prometer uma linha que a tabela
    // não mostra é o defeito que este contador existe para não ter.
    total: DEPLOYABLE + IN_USE + PENDING + UNDEPLOYABLE,
    byType: { DEPLOYABLE, IN_USE, PENDING, UNDEPLOYABLE },
    retired,
    byRetiredReason: motivos.map((motivo) => ({ ...motivo, total: porMotivo.get(motivo.id) ?? 0 })),
  };
}
