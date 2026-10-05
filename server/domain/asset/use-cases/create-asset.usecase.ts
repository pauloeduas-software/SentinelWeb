import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { nextAssetTag } from '../../settings/use-cases/app-settings.usecase';
import { resolveFieldset } from '../../custom-field/use-cases/resolve-fieldset.usecase';
import { validarCamposCustomizados } from '../../custom-field/use-cases/validate-custom-fields.usecase';
import { diffDeCampos } from '../../custom-field/helpers/custom-field-value.helper';
import { calcularDatas } from '../helpers/asset-dates.helper';
import { ASSET_SELECT_COM_CAMPOS, comCamposMascarados } from '../helpers/asset-select.helper';
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
  /** Campo customizado: `slug` → valor cru. Validado no use-case, não na borda. */
  customFields?: Record<string, unknown>;
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

    // ── O ID VEM DA APLICAÇÃO, NÃO DO `@default(uuid())` DO BANCO ───────────
    //
    // É o preço declarado do item 3 do D81: o id da linha entra no AAD de todo
    // valor cifrado (`assets:customFields.<slug>:<id>`), e é ele que impede
    // alguém com acesso ao banco copiar um segredo de um ativo para outro e o
    // sistema revelá-lo como legítimo. Para entrar na cifra, ele precisa existir
    // ANTES do INSERT.
    //
    // Uma linha a mais, e ela vale para o ativo SEM campo cifrado também: um id
    // gerado em dois lugares diferentes conforme o payload seria a pior forma de
    // economizar um `randomUUID`.
    const id = randomUUID();

    // O conjunto de campos vem do MODELO (D58) — `Asset` não tem `categoryId`.
    const conjunto = await resolveFieldset(tx, data.modelId);
    const campos = validarCamposCustomizados({
      conjunto,
      recebido: data.customFields,
      // Criação: nada gravado ainda, e é aqui que o `defaultValue` do vínculo
      // entra (só aqui — ver o use-case).
      gravados: {},
      assetId: id,
      criando: true,
    });

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
        id,
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
        // (docs/referencia/modelo-de-posse.md). Ativo que já está com alguém entra pelo
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
        // `DbNull` e NUNCA `JsonNull`: o segundo grava o literal JSON `null`
        // DENTRO da coluna, e `customFields IS NULL` para de achar o ativo — a
        // contagem de "sem campos preenchidos" passaria a mentir, em silêncio.
        customFields: campos.valores ?? Prisma.DbNull,
        // Autoria (D26). Duas colunas SÓ aqui, para a tela de detalhe não
        // consultar o `ActivityLog` por linha. `createdById` nunca muda depois.
        createdById: actorId,
        updatedById: actorId,
      },
      select: ASSET_SELECT_COM_CAMPOS,
    });

    // O retrato do CREATE ganha os campos customizados preenchidos — e o
    // `diffDeCampos` é quem os põe ali, nunca o objeto cru: valor cifrado NÃO
    // entra no `ActivityLog` (D62), nem mascarado por acidente. Partir de `{}`
    // faz o diff virar o retrato, com as chaves já prefixadas por `cf.`.
    const camposNoLog = diffDeCampos({}, campos.valores ?? {});

    await recordActivity(
      tx,
      {
        entityType: 'Asset',
        entityId: ativo.id,
        action: 'CREATE',
        changes: {
          assetTag: ativo.assetTag, serial: ativo.serial, modelId: ativo.modelId, statusId: ativo.statusId,
          // Espalhado, não aninhado: ver a nota do `update-asset.usecase.ts`.
          ...camposNoLog,
        },
      },
      actorId,
    );

    // A máscara é a ÚNICA saída de uma linha com `customFields`: o formulário
    // recebe de volta o que salvou, com o segredo como `••••••`.
    return comCamposMascarados(ativo);
  });
}
