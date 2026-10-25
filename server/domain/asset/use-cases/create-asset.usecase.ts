import { randomUUID } from 'node:crypto';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { nextAssetTag } from '../../settings/use-cases/app-settings.usecase';
import {
  assertEscolhaAtiva, assertLocalRecebe, lerModeloTravado, lerStatusTravado,
} from '../../catalog/helpers/catalog-lock.helper';
import { buildSnapshot } from '../../shared/diff.helper';
import { ASSET_SELECT, CAMPOS_AUDITADOS_DO_ATIVO, semCusto } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';

export interface CreateAssetData {
  assetTag?: string;
  statusId: string;
  modelId: string;
  serial?: string | null;
  name?: string | null;
  notes?: string | null;
  locationId?: string | null;
  orderNumber?: string | null;
  purchaseDate?: Date | null;
  purchaseCost?: string | null;
}

export async function createAsset(data: CreateAssetData, ator: Ator) {
  // Tudo numa transação: a etiqueta é consumida de um contador global, e se a
  // criação falhar depois disso o número precisa voltar — senão a sequência
  // ganha um buraco a cada erro de validação.
  return prisma.$transaction(async (tx) => {
    // O modelo, o status e o local pelas portas do catálogo: 404 com nome no
    // lugar do P2003 genérico, e o DESATIVADO recusado — ativo novo não escolhe
    // modelo nem status que saíram de linha, nem nasce num local fechado.
    const modelo = await lerModeloTravado(tx, data.modelId);
    if (!modelo) throw new AppError('Modelo não encontrado.', 404);
    assertEscolhaAtiva(modelo, { rotulo: 'O modelo' });

    assertEscolhaAtiva(await lerStatusTravado(tx, data.statusId), { rotulo: 'O status' });
    if (data.locationId) await assertLocalRecebe(tx, data.locationId, 'ativo novo');

    const assetTag = data.assetTag ?? (await nextAssetTag(tx));
    await assertEtiquetaESerieLivres(tx, { assetTag, serial: data.serial });

    // ── O ID VEM DA APLICAÇÃO, NÃO DO `@default(uuid())` DO BANCO ───────────
    //
    // Era o preço do item 3 do D81: o id entrava no AAD do valor cifrado dos
    // campos customizados, e precisava existir ANTES do INSERT. Os campos saíram
    // (D145) e o motivo original com eles — mas o id continua vindo daqui, porque
    // gerá-lo em dois lugares conforme o payload seria a pior forma de economizar
    // um `randomUUID`.
    const id = randomUUID();

    const ativo = await tx.asset.create({
      data: {
        id,
        assetTag,
        statusId: data.statusId,
        modelId: data.modelId,
        serial: data.serial ?? null,
        name: data.name ?? null,
        notes: data.notes ?? null,
        locationId: data.locationId ?? null,
        // Ativo que já está com alguém entra pelo cadastro e recebe um checkout
        // em seguida — a operação que existe para isso e que deixa histórico
        // (docs/referencia/modelo-de-posse.md).
        orderNumber: data.orderNumber ?? null,
        purchaseDate: data.purchaseDate ?? null,
        purchaseCost: data.purchaseCost ?? null,
      },
      select: ASSET_SELECT,
    });

    await recordAudit(
      tx,
      {
        entityType: 'Asset',
        entityId: ativo.id,
        entityLabel: ativo.assetTag,
        action: 'CREATE',
        changes: buildSnapshot(ativo, CAMPOS_AUDITADOS_DO_ATIVO),
      },
      ator,
    );

    // O custo é lido porque o retrato o audita; a resposta não o leva (D77),
    // como na edição.
    return semCusto(ativo);
  });
}
