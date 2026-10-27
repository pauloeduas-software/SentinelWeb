import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { contemTexto } from '../../shared/busca.helper';
import { agruparPorLote } from '../helpers/stock-lote.helper';
import { rotuloDoAlvo, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';

type Unidade = Prisma.StockMovementGetPayload<{ select: typeof STOCK_MOVEMENT_SELECT }>;

/** Uma linha de "Com quem está": uma entrega, com quantas unidades dela ainda estão fora. */
export interface EntregaAberta {
  /** Uma unidade da entrega — o `:id` da devolução. */
  id: string;
  targetType: Unidade['targetType'];
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetAssetId: string | null;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell do financeiro". */
  targetLabel: string;
  checkoutAt: Date;
  notes: string | null;
  /** Quantas desta entrega ainda estão com o alvo. */
  unidades: number;
}

/**
 * QUEM ESTÁ COM ESTE ITEM AGORA — a lista do detalhe, com o botão de devolver
 * em cada linha (o Retirar, no componente: a linha é o computador). O que já foi devolvido mora no histórico. É o "Com quem está"
 * da licença, com uma diferença que é do estoque: a linha é a ENTREGA ("Mesa 1 ·
 * 5 unidades"), não a unidade.
 *
 * Paginada e com busca pelo nome de quem recebeu — o colaborador, o posto, ou a
 * etiqueta e o nome do computador.
 *
 * AS ENTREGAS SÃO MONTADAS EM MEMÓRIA, e é barato: são só as unidades ABERTAS
 * deste item, e o total limita quantas existem.
 */
export async function listStockCheckouts(itemId: string, query: ListQuery): Promise<ListEnvelope<EntregaAberta>> {
  const item = await prisma.stockItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const contem = query.q ? contemTexto(query.q) : undefined;
  const unidades = await prisma.stockMovement.findMany({
    where: {
      itemId,
      returnedAt: null,
      ...(contem ? {
        OR: [
          { targetPerson: { name: contem } },
          { targetWorkstation: { name: contem } },
          { targetAsset: { assetTag: contem } },
          { targetAsset: { name: contem } },
        ],
      } : {}),
    },
    select: STOCK_MOVEMENT_SELECT,
    // A mais recente primeiro, como a licença. `createdAt` separa as entregas do
    // mesmo dia passado, e `id` fecha a ordem: a mesma linha não aparece em
    // duas páginas.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });

  const entregas = agruparPorLote(unidades).map(({ primeira, unidades: quantas }): EntregaAberta => ({
    id: primeira.id,
    targetType: primeira.targetType,
    targetPersonId: primeira.targetPersonId,
    targetWorkstationId: primeira.targetWorkstationId,
    targetAssetId: primeira.targetAssetId,
    targetLabel: rotuloDoAlvo(primeira),
    checkoutAt: primeira.checkoutAt,
    notes: primeira.notes,
    unidades: quantas,
  }));

  return { total: entregas.length, rows: entregas.slice(query.skip, query.skip + query.take) };
}
