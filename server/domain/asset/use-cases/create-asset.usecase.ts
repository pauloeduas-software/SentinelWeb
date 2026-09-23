import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { nextAssetTag } from '../../settings/use-cases/app-settings.usecase';
import { calcularDatas } from '../helpers/asset-dates.helper';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';

export interface CreateAssetData {
  assetTag?: string;
  statusId: string;
  modelId: string;
  serial?: string | null;
  name?: string | null;
  notes?: string | null;
  byod?: boolean;
  requestable?: boolean;
  locationId?: string | null;
  supplierId?: string | null;
  orderNumber?: string | null;
  purchaseDate?: Date | null;
  purchaseCost?: string | null;
  warrantyMonths?: number | null;
  eolMonths?: number | null;
  eolDate?: Date | null;
  eolExplicit?: boolean;
}

export async function createAsset(data: CreateAssetData, actorId: string | null) {
  // Tudo numa transação: a etiqueta é consumida de um contador global, e se a
  // criação falhar depois disso o número precisa voltar — senão a sequência
  // ganha um buraco a cada erro de validação.
  return prisma.$transaction(async (tx) => {
    const modelo = await tx.assetModel.findUnique({
      where: { id: data.modelId },
      select: { eolMonths: true },
    });
    if (!modelo) throw new AppError('Modelo não encontrado.', 404);

    const assetTag = data.assetTag ?? (await nextAssetTag(tx));
    await assertEtiquetaESerieLivres(tx, { assetTag, serial: data.serial });

    // A vida útil desce do modelo quando o ativo não define a sua: é o modelo
    // que sabe que um notebook dura 48 meses.
    const eolMonths = data.eolMonths ?? modelo.eolMonths ?? null;

    const { warrantyExpiresAt, eolDate } = calcularDatas({
      purchaseDate: data.purchaseDate,
      warrantyMonths: data.warrantyMonths,
      eolMonths,
      eolExplicit: data.eolExplicit,
      eolDate: data.eolDate,
    });

    const ativo = await tx.asset.create({
      data: {
        assetTag,
        statusId: data.statusId,
        modelId: data.modelId,
        serial: data.serial ?? null,
        name: data.name ?? null,
        notes: data.notes ?? null,
        byod: data.byod ?? false,
        requestable: data.requestable ?? false,
        locationId: data.locationId ?? null,
        supplierId: data.supplierId ?? null,
        // `assignedToId` nasce nulo e só o CHECKOUT o preenche
        // (docs/MODELO-POSSE.md). Ativo que já está com alguém entra pelo
        // cadastro e recebe um checkout em seguida — a operação que existe
        // para isso e que deixa histórico.
        orderNumber: data.orderNumber ?? null,
        purchaseDate: data.purchaseDate ?? null,
        purchaseCost: data.purchaseCost ?? null,
        warrantyMonths: data.warrantyMonths ?? null,
        warrantyExpiresAt,
        eolMonths,
        eolDate,
        eolExplicit: data.eolExplicit ?? false,
        // Autoria (D26). Duas colunas SÓ aqui, para a tela de detalhe não
        // consultar o `ActivityLog` por linha. `createdById` nunca muda depois.
        createdById: actorId,
        updatedById: actorId,
      },
      select: ASSET_SELECT,
    });

    await recordActivity(
      tx,
      {
        entityType: 'Asset',
        entityId: ativo.id,
        action: 'CREATE',
        changes: { assetTag: ativo.assetTag, serial: ativo.serial, modelId: ativo.modelId, statusId: ativo.statusId },
      },
      actorId,
    );

    return ativo;
  });
}
