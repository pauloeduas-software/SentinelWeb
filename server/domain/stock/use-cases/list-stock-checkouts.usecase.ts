import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { contemTexto } from '../../shared/busca.helper';
import { agruparPorLote } from '../helpers/stock-lote.helper';
import { rotuloDoAlvo, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';

type Unidade = Prisma.StockMovementGetPayload<{ select: typeof STOCK_MOVEMENT_SELECT }>;

/** Uma linha de "Com quem está": uma saída, com quantas unidades dela ainda estão fora. */
export interface SaidaAberta {
  /** Uma unidade da saída — o `:id` da devolução. */
  id: string;
  targetType: Unidade['targetType'];
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  /** "Laura Souza", "Mesa 1". */
  targetLabel: string;
  checkoutAt: Date;
  notes: string | null;
  /** Quantas desta saída ainda estão com o alvo. */
  unidades: number;
}

/**
 * QUEM ESTÁ COM ESTE ITEM AGORA — a lista do detalhe, com o botão de devolver
 * em cada linha. O que já foi devolvido mora no histórico. É o "Com quem está"
 * da licença, com uma diferença que é do estoque: a linha é a SAÍDA ("Mesa 1 ·
 * 5 unidades"), não a unidade.
 *
 * Paginada e com busca pelo nome de quem recebeu — o colaborador ou o posto.
 *
 * AS SAÍDAS SÃO MONTADAS EM MEMÓRIA, e é barato: são só as unidades ABERTAS
 * deste item, e o total limita quantas existem.
 */
export async function listStockCheckouts(itemId: string, query: ListQuery): Promise<ListEnvelope<SaidaAberta>> {
  const item = await prisma.stockItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const contem = query.q ? contemTexto(query.q) : undefined;
  const unidades = await prisma.stockMovement.findMany({
    where: {
      itemId,
      returnedAt: null,
      ...(contem ? { OR: [{ targetPerson: { name: contem } }, { targetWorkstation: { name: contem } }] } : {}),
    },
    select: STOCK_MOVEMENT_SELECT,
    // A mais recente primeiro, como a licença. `createdAt` separa as saídas do
    // mesmo dia passado, e `id` fecha a ordem: a mesma linha não aparece em
    // duas páginas.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });

  const saidas = agruparPorLote(unidades).map(({ primeira, unidades: quantas }): SaidaAberta => ({
    id: primeira.id,
    targetType: primeira.targetType,
    targetPersonId: primeira.targetPersonId,
    targetWorkstationId: primeira.targetWorkstationId,
    targetLabel: rotuloDoAlvo(primeira),
    checkoutAt: primeira.checkoutAt,
    notes: primeira.notes,
    unidades: quantas,
  }));

  return { total: saidas.length, rows: saidas.slice(query.skip, query.skip + query.take) };
}
