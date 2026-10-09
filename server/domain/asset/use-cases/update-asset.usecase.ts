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
  'statusId', 'modelId', 'locationId', 'supplierId', 'assignedToId',
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
        supplierId: data.supplierId,
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

    // Chave a chave, e SEM o valor cifrado (D62): o que fica registrado é que o
    // segredo mudou e quando — nunca o que ele é.
    //
    // ESPALHADO no `changes`, com as chaves prefixadas por `cf.` — e as duas
    // coisas são deliberadas. O prefixo evita que um campo customizado chamado
    // `serial` sobrescreva o diff da COLUNA `serial` (o slug é do cliente, e
    // nada impede a colisão); o espalhamento mantém cada entrada no MESMO
    // formato `{ de, para }` das colunas nativas, que é como a aba Histórico
    // reconhece uma mudança. Aninhado, o leitor genérico o classificava como
    // "detalhe" e imprimia `[object Object]`.
    const changesCompleto = changes;

    if (Object.keys(changesCompleto).length > 0) {
      await recordActivity(
        tx,
        { entityType: 'Asset', entityId: id, action: 'UPDATE', changes: changesCompleto },
        actorId,
      );
    }

    return depois;
  });
}
