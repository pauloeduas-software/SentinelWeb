import { $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';

// Contadores do cabeçalho da tela de ativos. Rota própria porque, com paginação,
// `rows.length` conta só a página atual — a agregação roda FORA do skip/take.
export interface AssetStats {
  /** O que a listagem PADRÃO mostra: nem descomissionado, nem arquivado. */
  total: number;
  byStatus: {
    id: string;
    name: string;
    color: string | null;
    showInNav: boolean;
    /** O tipo do rótulo — é ele que diz à tela que este contador é de arquivo. */
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
  /**
   * Quantos saíram da OPERAÇÃO (`status.type = ARCHIVED`) — a vista
   * `?view=archived`, e a outra metade do que `total` deixou de contar.
   *
   * São duas colunas com dois significados (D19): o descomissionado é fato
   * contábil e não volta; o arquivado é decisão reversível, e volta trocando o
   * status. Somar os dois num contador só apagaria essa diferença exatamente
   * onde ela é operacional.
   */
  archived: number;
}

/**
 * Quais status aparecem no cabeçalho:
 *
 *   - os marcados como destaque (`showInNav`), MESMO com zero ativos — é isso
 *     que dá efeito visível ao campo, e um contador em zero é informação: "não
 *     há nada danificado" vale tanto quanto o número;
 *   - mais qualquer status que tenha ativo, marcado ou não — senão um status
 *     esquecido sumiria do painel escondendo equipamento.
 */
export async function getAssetStats(): Promise<AssetStats> {
  // `retiredAt: null` no agrupamento porque a listagem padrão também o exclui:
  // o contador do cabeçalho é o cabeçalho DAQUELA lista, e contar o notebook
  // vendido aqui faria o badge prometer uma linha que a tabela não mostra.
  const [grupos, rotulos, retired] = await Promise.all([
    prisma.asset.groupBy({ by: ['statusId'], where: { retiredAt: null }, _count: { _all: true } }),
    prisma.statusLabel.findMany({ select: { id: true, name: true, color: true, showInNav: true, type: true } }),
    prisma.asset.count({ where: { retiredAt: { not: null } } }),
  ]);

  const contagem = new Map(grupos.map((grupo) => [grupo.statusId, grupo._count._all]));

  const comTotal = rotulos.map((rotulo) => ({ ...rotulo, total: contagem.get(rotulo.id) ?? 0 }));

  const byStatus = comTotal
    .filter((rotulo) => rotulo.showInNav || rotulo.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));

  const ehArquivo = (tipo: $Enums.StatusLabelType) => tipo === $Enums.StatusLabelType.ARCHIVED;

  // A soma sai de `comTotal`, não de `byStatus`: o filtro acima é de EXIBIÇÃO
  // (esconde o rótulo zerado que ninguém marcou como destaque), e um contador
  // que dependesse dele mudaria de valor quando alguém desmarcasse o destaque.
  const somar = (arquivo: boolean) =>
    comTotal.reduce((soma, rotulo) => (ehArquivo(rotulo.type) === arquivo ? soma + rotulo.total : soma), 0);

  return {
    // `total` conta o que a listagem PADRÃO mostra, e ela passou a excluir o
    // arquivado junto com o descomissionado: o cabeçalho é o cabeçalho DAQUELA
    // lista, e prometer uma linha que a tabela não mostra é o defeito que este
    // contador existe para não ter.
    total: somar(false),
    byStatus,
    retired,
    archived: somar(true),
  };
}
