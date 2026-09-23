import { prisma } from '../../../core/database/prismaClient';
import { buildAssetWhere } from '../helpers/asset-filters.helper';

// Mesmo teto e mesma forma dos outros `/options`: id e nome, sem envelope.
const MAX_OPCOES = 200;

export interface AssetOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta de ativos para `<select>` — hoje a aba **Ativo** do modal de
 * entrega, onde se prende um periférico a outro equipamento (a dock que segura
 * o notebook, o monitor ligado ao desktop).
 *
 * O `name` que sai daqui é COMPOSTO — `"ATV-00012 — Dell Latitude"` — e não a
 * coluna `name`, que é opcional e quase sempre nula. Num `<select>` de ativos,
 * uma lista de nomes vazios seria inútil; a etiqueta é o que identifica o
 * equipamento na prática, e o modelo é o que o torna reconhecível.
 *
 * A lixeira é respeitada sozinha: `Asset` tem `deletedAt` e a extension escopa
 * toda consulta de topo (core/database/soft-delete.extension.ts). Entregar um
 * ativo a outro que está na lixeira não é uma operação que deva existir.
 */
export async function listAssetOptions(q?: string): Promise<AssetOption[]> {
  const rows = await prisma.asset.findMany({
    where: buildAssetWhere(q),
    select: {
      id: true,
      assetTag: true,
      name: true,
      model: { select: { name: true } },
    },
    orderBy: { assetTag: 'asc' },
    take: MAX_OPCOES,
  });

  return rows.map((ativo) => ({
    id: ativo.id,
    name: `${ativo.assetTag} — ${ativo.name ?? ativo.model.name}`,
  }));
}
