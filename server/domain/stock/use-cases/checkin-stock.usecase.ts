import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { CheckinStockInput } from '../schemas/stock.schema';

/**
 * A DEVOLUÇÃO de UMA unidade — a linha de SAIDA identificada.
 *
 * Preenche `returnedAt` e NUNCA apaga a linha: "quem estava com o mouse em
 * março?" continua respondível depois da devolução.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE AQUI NÃO HÁ `FOR UPDATE`, se a saída tem.
 *
 * A trava da saída existe porque ela COMPARA um número lido (`disponivel`)
 * antes de gravar — e a leitura fica velha entre o `if` e o `INSERT`. A
 * devolução não compara nada: ela fecha UMA linha específica, e o único risco é
 * duas requisições fecharem a mesma.
 *
 * Quem resolve isso é o `updateMany` com `returnedAt: null` no WHERE: o
 * Postgres aplica a condição na hora do `UPDATE`, então a segunda transação
 * afeta ZERO linhas e recebe o 409 — sem lock, sem janela. E devolução só
 * AUMENTA o disponível: o erro que se evita aqui é de HISTÓRICO (duas
 * devoluções da mesma unidade), não de saldo.
 *
 * E É POR ISSO QUE A FICHA DO POSTO NÃO PRECISA DE ESCOPO, ao contrário da
 * devolução de ativo: a unidade é identificada pelo id da linha. Uma ficha
 * velha devolve uma linha já devolvida e leva 409 — não fecha a unidade de
 * outra pessoa, porque uma unidade entregue de novo é OUTRA linha.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function checkinStock(movementId: string, data: CheckinStockInput, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const devolvidaEm = new Date();

    const { count } = await tx.stockMovement.updateMany({
      where: { id: movementId, kind: 'SAIDA', returnedAt: null },
      data: { returnedAt: devolvidaEm, returnNotes: data.notes ?? null, returnedById: actorId },
    });

    if (count === 0) {
      // Zero linhas é "não existe", "não é saída" OU "já foi devolvida" — e as
      // três precisam de respostas diferentes. Só aqui vale a consulta extra: no
      // caminho feliz ela não acontece.
      const existente = await tx.stockMovement.findUnique({
        where: { id: movementId },
        select: { kind: true, returnedAt: true },
      });
      if (!existente) throw new AppError('Nenhuma saída com este identificador.', 404);
      if (existente.kind !== 'SAIDA') throw new AppError('Este movimento não é uma saída: não há o que devolver.', 409);
      throw new AppError('Esta unidade já foi devolvida.', 409, {
        returnedAt: existente.returnedAt?.toISOString() ?? null,
      });
    }

    const unidade = await tx.stockMovement.findUniqueOrThrow({
      where: { id: movementId },
      select: STOCK_MOVEMENT_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'StockItem',
      entityId: unidade.itemId,
      action: 'CHECKIN',
      changes: {
        movementId: unidade.id,
        targetType: unidade.targetType,
        targetId: unidade.targetUserId ?? unidade.targetLocationId,
        returnedAt: devolvidaEm.toISOString(),
      },
    }, actorId);

    return unidade;
  });
}
