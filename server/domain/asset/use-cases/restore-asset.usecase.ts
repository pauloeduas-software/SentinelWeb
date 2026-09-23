import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';

export async function restoreAsset(id: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const naLixeira = await tx.asset.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { assetTag: true, serial: true },
    });

    if (!naLixeira) throw new AppError('Ativo não está na lixeira.', 404);

    // O índice único é PARCIAL (só entre os vivos), então a etiqueta pode ter
    // sido reaproveitada enquanto este ativo estava na lixeira. Restaurar às
    // cegas estouraria uma violação de unicidade crua vinda do banco.
    await assertEtiquetaESerieLivres(tx, {
      assetTag: naLixeira.assetTag,
      serial: naLixeira.serial,
      ignorarId: id,
    });

    await tx.asset.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'RESTORE' }, actorId);

    return tx.asset.findFirstOrThrow({ where: { id }, select: ASSET_SELECT });
  });
}
