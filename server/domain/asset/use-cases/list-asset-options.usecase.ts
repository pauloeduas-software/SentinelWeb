import { prisma } from '../../../core/database/prismaClient';
import { buildAssetWhere } from '../helpers/asset-filters.helper';

// Mesmo teto e mesma forma dos outros `/options`: id e nome, sem envelope.
const MAX_OPCOES = 200;

interface AssetOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta de ativos para `<select>` — o seletor de máquina da entrega de
 * licença e o do vínculo em `/descobertas` (este com `semMaquina`).
 *
 * O `name` que sai daqui é COMPOSTO — `"ATV-00012 — Dell Latitude"` — e não a
 * coluna `name`, que é opcional e quase sempre nula. Num `<select>` de ativos,
 * uma lista de nomes vazios seria inútil; a etiqueta é o que identifica o
 * equipamento na prática, e o modelo é o que o torna reconhecível.
 *
 * A lixeira é respeitada sozinha: `Asset` tem `deletedAt` e a extension escopa
 * toda consulta de topo (core/database/soft-delete.extension.ts).
 */
interface FiltroDeOpcoesDeAtivo {
  /**
   * Só ativo SEM máquina vinculada. É o seletor de `/descobertas`: vincular a
   * máquina a um ativo que já tem outra é o que `endpoints.assetId @unique`
   * recusa, então a lista nem oferece.
   */
  semMaquina?: boolean;
}

export async function listAssetOptions(
  q?: string,
  filtro: FiltroDeOpcoesDeAtivo = {},
): Promise<AssetOption[]> {
  const rows = await prisma.asset.findMany({
    where: {
      ...buildAssetWhere(q),
      // Sem os BAIXADOS: os dois seletores que usam esta lista — a entrega de
      // licença e o vínculo de máquina — recusam o ativo que saiu do
      // patrimônio, então oferecê-lo seria oferecer um 409.
      retiredAt: null,
      ...(filtro.semMaquina ? { endpoint: null } : {}),
    },
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
