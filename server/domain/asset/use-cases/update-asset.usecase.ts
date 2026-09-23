import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { calcularDatas } from '../helpers/asset-dates.helper';
import { ASSET_SELECT } from '../helpers/asset-select.helper';
import { assertEtiquetaESerieLivres } from './assert-unique-asset.usecase';
import { assertStatusCoerenteComPosse } from './assert-status-posse.usecase';
import type { CreateAssetData } from './create-asset.usecase';

export type UpdateAssetData = Partial<CreateAssetData>;

const CAMPOS_AUDITADOS = [
  'assetTag', 'serial', 'name', 'notes', 'byod', 'requestable',
  'statusId', 'modelId', 'locationId', 'supplierId', 'assignedToId',
  'orderNumber', 'purchaseDate', 'purchaseCost',
  'warrantyMonths', 'warrantyExpiresAt', 'eolMonths', 'eolDate', 'eolExplicit',
] as const;

/** `undefined` significa "não mexe"; qualquer outro valor, inclusive `null`, vence. */
function valorFinal<T>(novo: T | undefined, atual: T): T {
  return novo === undefined ? atual : novo;
}

type ClienteComModelo = Pick<typeof prisma, 'assetModel'>;

/** O que a edição precisa saber do estado anterior para resolver a vida útil. */
interface EstadoAnterior {
  eolMonths: number | null;
  modelId: string;
  model: { eolMonths: number | null };
}

/**
 * Vida útil depois da edição.
 *
 * Na criação ela DESCE do modelo quando o ativo não define a sua
 * (`create-asset.usecase.ts`). Na edição isso precisa valer de novo quando o
 * MODELO muda — senão um ativo movido de um modelo de 48 meses para um de 12
 * fica com 48 para sempre, e a data de fim de vida calculada a partir dela
 * junto.
 *
 * O que distingue "herdado" de "digitado à mão" é só o VALOR: não existe coluna
 * marcando o override, e criar uma seria mais um dado para manter em sincronia.
 * Então a regra é: se o ativo carregava exatamente a vida útil do modelo
 * anterior, ele estava herdando e continua herdando, agora do modelo novo. Se
 * carregava outra coisa, alguém digitou aquilo e aquilo fica.
 *
 * Isto precisa morar no servidor, e não no formulário: a tela reenvia todo
 * campo a cada salvamento, então `data.eolMonths` chega preenchido mesmo quando
 * o usuário só trocou o modelo.
 */
async function resolverVidaUtil(
  client: ClienteComModelo,
  antes: EstadoAnterior,
  data: UpdateAssetData,
): Promise<number | null> {
  const escolhida = valorFinal(data.eolMonths, antes.eolMonths);

  const novoModelId = data.modelId;
  if (novoModelId === undefined || novoModelId === antes.modelId) return escolhida;

  const novoModelo = await client.assetModel.findUnique({
    where: { id: novoModelId },
    select: { eolMonths: true },
  });
  if (!novoModelo) throw new AppError('Modelo não encontrado.', 404);

  // A edição mudou a vida útil de propósito: escolha explícita vence o modelo.
  if (escolhida !== antes.eolMonths) return escolhida;

  // Só herda se estava mesmo herdando.
  return antes.eolMonths === antes.model.eolMonths ? novoModelo.eolMonths ?? null : escolhida;
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

    // As datas derivadas são recalculadas a partir do estado FINAL, não do que
    // chegou no corpo: mudar só a data de compra tem que mover o vencimento da
    // garantia, mesmo sem `warrantyMonths` no payload.
    const purchaseDate = valorFinal(data.purchaseDate, antes.purchaseDate);
    const warrantyMonths = valorFinal(data.warrantyMonths, antes.warrantyMonths);
    const eolExplicit = valorFinal(data.eolExplicit, antes.eolExplicit);
    // Trocar o modelo pode trocar a vida útil junto — ver `resolverVidaUtil`.
    const eolMonths = await resolverVidaUtil(tx, antes, data);

    const { warrantyExpiresAt, eolDate } = calcularDatas({
      purchaseDate,
      warrantyMonths,
      eolMonths,
      eolExplicit,
      eolDate: valorFinal(data.eolDate, antes.eolDate),
    });

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
        // checkout/checkin (docs/MODELO-POSSE.md). Continua em
        // `CAMPOS_AUDITADOS` acima — o checkout grava, e o diff precisa pegar.
        orderNumber: data.orderNumber,
        purchaseDate: data.purchaseDate,
        purchaseCost: data.purchaseCost,
        warrantyMonths: data.warrantyMonths,
        eolExplicit: data.eolExplicit,
        // Estes três são o estado FINAL calculado acima, não o que veio no
        // corpo: `eolMonths` pode ter sido herdado de um modelo novo, e as duas
        // datas saem dele e da data de compra.
        eolMonths,
        warrantyExpiresAt,
        eolDate,
        // Autoria (D26). `createdById` NÃO entra aqui: quem criou não muda.
        updatedById: actorId,
      },
      select: ASSET_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'UPDATE', changes }, actorId);
    }

    return depois;
  });
}
