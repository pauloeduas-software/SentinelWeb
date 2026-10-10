import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';
import { assertStatusCoerenteComPosse } from './assert-status-posse.usecase';
import type { CreateAssetData } from './create-asset.usecase';

export type UpdateAssetData = Partial<CreateAssetData>;

const CAMPOS_AUDITADOS = [
  'assetTag', 'serial', 'name', 'notes', 'byod', 'requestable',
  'statusId', 'modelId', 'locationId', 'assignedToId',
  'orderNumber', 'purchaseDate', 'purchaseCost',
] as const;

/** `undefined` significa "não mexe"; qualquer outro valor, inclusive `null`, vence. */
function valorFinal<T>(novo: T | undefined, atual: T): T {
  return novo === undefined ? atual : novo;
}

export async function updateAsset(id: string, data: UpdateAssetData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.asset.findFirst({ where: { id }, select: ASSET_SELECT });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    await assertEtiquetaESerieLivres(tx, {
      assetTag: data.assetTag,
      serial: data.serial,
      ignorarId: id,
    });

    // Estado × posse: status de estoque (`DEPLOYABLE`) ou de fora de operação
    // (`ARCHIVED`) contradizem um ativo que está com alguém. A guarda entra
    // DENTRO da transação que já existe porque ela lê a assignment aberta —
    // fora dela, um checkout concorrente entre a checagem e o UPDATE passaria.
    //
    // Só quando o status MUDA: reenviar o mesmo status numa edição de outro
    // campo não é uma contradição nova, e recusar travaria a tela para o ativo
    // que já está entregue (o formulário reenvia todo campo a cada salvamento).
    const statusIdFinal = valorFinal(data.statusId, antes.statusId);
    if (statusIdFinal !== antes.statusId) {
      await assertStatusCoerenteComPosse(tx, id, statusIdFinal);
    }

    const depois = await tx.asset.update({
      where: { id },
      data: {
        assetTag: data.assetTag,
        statusId: data.statusId,
        modelId: data.modelId,
        serial: data.serial,
        name: data.name,
        notes: data.notes,
        byod: data.byod,
        requestable: data.requestable,
        locationId: data.locationId,
        // `assignedToId` NÃO está aqui de propósito: quem escreve nele é só o
        // checkout/checkin (docs/referencia/modelo-de-posse.md). Continua em
        // `CAMPOS_AUDITADOS` acima — o checkout grava, e o diff precisa pegar.
        orderNumber: data.orderNumber,
        purchaseDate: data.purchaseDate,
        purchaseCost: data.purchaseCost,
        // Autoria (D26). `createdById` NÃO entra aqui: quem criou não muda.
        updatedById: actorId,
      },
      select: ASSET_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);

    if (Object.keys(changes).length > 0) {
      await recordActivity(
        tx,
        { entityType: 'Asset', entityId: id, action: 'UPDATE', changes },
        actorId,
      );
    }

    return depois;
  });
}
