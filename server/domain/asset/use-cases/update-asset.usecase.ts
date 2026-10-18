import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import {
  assertEscolhaAtiva, assertLocalRecebe, lerModeloTravado, lerStatusTravado,
} from '../../catalog/helpers/catalog-lock.helper';
import { ASSET_SELECT, semCusto } from '../helpers/asset-select.helper';
import { travarAtivoOuFalhar } from './lock-asset.usecase';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';
import { assertStatusCoerenteComPosse } from './assert-status-posse.usecase';
import type { CreateAssetData } from './create-asset.usecase';

type UpdateAssetData = Partial<CreateAssetData>;

const CAMPOS_AUDITADOS = [
  'assetTag', 'serial', 'name', 'notes',
  'statusId', 'modelId', 'locationId',
  'orderNumber', 'purchaseDate', 'purchaseCost',
] as const;

/** `undefined` significa "não mexe"; qualquer outro valor, inclusive `null`, vence. */
function valorFinal<T>(novo: T | undefined, atual: T): T {
  return novo === undefined ? atual : novo;
}

export async function updateAsset(id: string, data: UpdateAssetData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    // A TRAVA, antes de qualquer leitura. Estar dentro da transação não basta
    // para a guarda estado × posse abaixo: em READ COMMITTED a entrega
    // simultânea confirma a posse DEPOIS da guarda olhar, e o `UPDATE` daqui
    // grava o status de estoque por cima de um ativo já entregue. A entrega
    // trava o mesmo ativo, então as duas passam a ir uma de cada vez.
    await travarAtivoOuFalhar(tx, id);

    const antes = await tx.asset.findFirst({ where: { id }, select: ASSET_SELECT });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    await assertEtiquetaESerieLivres(tx, {
      assetTag: data.assetTag,
      serial: data.serial,
      ignorarId: id,
    });

    // Estado × posse: status de estoque (`DEPLOYABLE`) contradiz um ativo que
    // está com alguém. A guarda lê a assignment aberta com o ativo já travado
    // (acima), e o status travado `FOR SHARE` — a troca de tipo dele espera.
    //
    // Só quando o status MUDA: reenviar o mesmo status numa edição de outro
    // campo não é uma contradição nova, e recusar travaria a tela para o ativo
    // que já está entregue (o formulário reenvia todo campo a cada salvamento).
    const statusIdFinal = valorFinal(data.statusId, antes.statusId);
    if (statusIdFinal !== antes.statusId) {
      // Status desativado não é escolhido de novo — só aqui, quando MUDA: o
      // ativo que já estava nele continua editável.
      assertEscolhaAtiva(await lerStatusTravado(tx, statusIdFinal), { rotulo: 'O status' });
      await assertStatusCoerenteComPosse(tx, id, statusIdFinal);
    }

    // O modelo novo existe? A mesma conferência do cadastro: sem ela, o id
    // inexistente caía no P2003 e respondia "em uso por outro cadastro".
    if (data.modelId && data.modelId !== antes.modelId) {
      const modelo = await lerModeloTravado(tx, data.modelId);
      if (!modelo) throw new AppError('Modelo não encontrado.', 404);
      assertEscolhaAtiva(modelo, { rotulo: 'O modelo' });
    }

    // Local desativado não recebe ativo NOVO — só quando o local muda, pelo
    // mesmo motivo do status: o formulário reenvia todo campo.
    if (data.locationId && data.locationId !== antes.locationId) {
      await assertLocalRecebe(tx, data.locationId, 'ativo novo');
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
        locationId: data.locationId,
        orderNumber: data.orderNumber,
        purchaseDate: data.purchaseDate,
        purchaseCost: data.purchaseCost,
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

    // O custo é lido porque o diff o audita; a resposta não o leva, para cargo
    // nenhum (`ASSET_WRITE_SELECT`, D77).
    return semCusto(depois);
  });
}
