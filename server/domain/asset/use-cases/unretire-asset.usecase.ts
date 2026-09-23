import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import { ASSET_SELECT } from '../helpers/asset-select.helper';

/**
 * DESFAZER o descomissionamento — a venda não saiu, o equipamento "roubado"
 * apareceu, alguém clicou errado.
 *
 * Existe por simetria com a restauração da lixeira e pelo mesmo motivo: a
 * operação que só vai para um lado transforma um clique errado em um registro
 * que ninguém conserta sem `psql`.
 *
 * Limpa as DUAS colunas. `retiredAt` sem `retiredReason` seria "saiu do
 * patrimônio, não se sabe por quê", e o contrário seria um motivo de saída para
 * um ativo que não saiu — dois estados que nenhuma tela saberia mostrar.
 *
 * Não tem guarda de posse: um ativo que volta ao patrimônio não contradiz nada.
 * A guarda existe na ida (`assert-retire-posse.usecase.ts`), que é onde o
 * inventário perderia o rastro de quem está com o equipamento.
 */
export async function unretireAsset(id: string, actorId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.asset.findFirst({
      where: { id },
      select: { id: true, assetTag: true, retiredAt: true, retiredReason: true },
    });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    if (!antes.retiredAt) {
      throw new AppError(`${antes.assetTag} não está descomissionado.`, 409);
    }

    const depois = await tx.asset.update({
      where: { id },
      data: { retiredAt: null, retiredReason: null },
      select: ASSET_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: id,
      action: 'UNRETIRE',
      // O diff guarda DE ONDE ele voltou: sem isso, a aba Histórico mostraria
      // "voltou ao patrimônio" sem dizer como vendido ou como roubado ele
      // estava — e é justamente essa a pergunta de quem audita a reversão.
      changes: buildChanges(antes, depois, ['retiredAt', 'retiredReason']),
    }, actorId);

    return depois;
  });
}
