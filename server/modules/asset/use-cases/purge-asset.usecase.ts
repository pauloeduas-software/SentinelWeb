import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { rotuloDoComputador } from '../../stock/helpers/stock-select.helper';
import { ASSET_SELECT, CAMPOS_AUDITADOS_DO_ATIVO } from '../helpers/asset-select.helper';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

/**
 * Exclui DE VEZ — só da lixeira (DL). Dois passos, como o GLPI: excluir manda
 * para a lixeira, e daqui a linha sai do banco.
 *
 * O PASSADO SOLTA O COMPUTADOR, na regra do posto: a posse, a licença e o
 * componente já devolvidos perdem a ligação e guardam o rótulo por escrito
 * ("ATV-00042 — Dell Latitude"), e o histórico do colaborador e do posto
 * continua dizendo o que recebeu. Some a ficha dele, com o histórico próprio.
 *
 * Na lixeira nada está com ele: a lixeira recusa o entregue, a licença, o
 * componente e a máquina (AL, CL), e a entrega a um computador da lixeira é
 * 404. Só a linha FECHADA se solta, então a FK `Restrict` continua a rede: a
 * aberta de um banco antigo segura o `DELETE` e desfaz a transação inteira.
 *
 * NA ORDEM DO ID, como a exclusão do item e do posto: a exclusão de vez do
 * colaborador desliga algumas das mesmas linhas, e duas transações travando em
 * ordens diferentes se matariam (deadlock).
 */
export async function purgeAsset(id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A trava ANTES de ler, como a restauração: as duas disputam a mesma linha,
    // e a que chega depois relê a lixeira já decidida.
    await travarAtivoOuFalhar(tx, id);

    const naLixeira = await tx.asset.findFirst({ where: { id, deletedAt: { not: null } }, select: ASSET_SELECT });
    if (!naLixeira) throw new AppError('Computador não está na lixeira.', 404);
    const rotulo = rotuloDoComputador(naLixeira);

    await tx.$queryRaw`SELECT id FROM assignments WHERE "assetId" = ${id}::uuid ORDER BY id FOR UPDATE`;
    await tx.assignment.updateMany({
      where: { assetId: id, checkinAt: { not: null } },
      data: { assetId: null, assetLabel: rotulo },
    });

    await tx.$queryRaw`SELECT id FROM license_checkouts WHERE "assignedAssetId" = ${id}::uuid ORDER BY id FOR UPDATE`;
    await tx.licenseCheckout.updateMany({
      where: { assignedAssetId: id, checkinAt: { not: null } },
      data: { assignedAssetId: null, assignedAssetLabel: rotulo },
    });

    await tx.$queryRaw`SELECT id FROM stock_movements WHERE "targetAssetId" = ${id}::uuid ORDER BY id FOR UPDATE`;
    await tx.stockMovement.updateMany({
      where: { targetAssetId: id, returnedAt: { not: null } },
      data: { targetAssetId: null, targetAssetLabel: rotulo },
    });

    // `deletedAt` explícito: a extension de soft delete escopa o `delete` também.
    await tx.asset.delete({ where: { id, deletedAt: { not: null } } });

    // O retrato é o que sobra de que o computador existiu.
    await recordAudit(tx, {
      entityType: 'Asset',
      entityId: id,
      entityLabel: naLixeira.assetTag,
      action: 'PURGE',
      changes: buildSnapshot(naLixeira, CAMPOS_AUDITADOS_DO_ATIVO),
    }, ator);
  });
}
