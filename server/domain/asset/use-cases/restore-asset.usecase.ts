import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { ASSET_WRITE_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

export async function restoreAsset(id: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    // A trava ANTES de ler: sem ela, um duplo clique restaurava duas vezes e o
    // histórico ganhava dois RESTORE para um fato só. A trava é sobre a LINHA
    // e não filtra a lixeira (`lock-asset.usecase.ts`).
    await travarAtivoOuFalhar(tx, id);

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

    // Sem porta de posto: o ativo entregue não vai para a lixeira (AL), então
    // o que volta dela não aponta para mesa nem pessoa nenhuma.
    const { count } = await tx.asset.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    if (count === 0) throw new AppError('Ativo não está na lixeira.', 404);
    await recordAudit(tx, { entityType: 'Asset', entityId: id, entityLabel: naLixeira.assetTag, action: 'RESTORE' }, ator);

    return tx.asset.findFirstOrThrow({ where: { id }, select: ASSET_WRITE_SELECT });
  });
}
