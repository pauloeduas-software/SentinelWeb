import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { accessorySpec } from '../helpers/stock-kind.helper';
import { ACCESSORY_CHECKOUT_SELECT } from '../helpers/stock-select.helper';
import type { CheckinAccessoryData } from '../schemas/accessory.schema';

/**
 * A DEVOLUÇÃO de uma unidade de acessório.
 *
 * Preenche `checkedInAt` e NUNCA apaga a linha — mesmo princípio do
 * `Assignment` e do `ActivityLog`: "quem estava com o mouse em março?" continua
 * respondível depois da devolução.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE AQUI NÃO HÁ `FOR UPDATE`, se a entrega tem.
 *
 * A trava da entrega existe porque ela COMPARA um número lido (`disponivel`)
 * antes de gravar — e a leitura fica velha entre o `if` e o `INSERT`. A
 * devolução não compara nada: ela fecha UMA linha específica, e o único risco é
 * duas requisições fecharem a mesma.
 *
 * Quem resolve isso é o `updateMany` com `checkedInAt: null` no WHERE: o
 * Postgres aplica a condição na hora do `UPDATE`, então a segunda transação
 * afeta ZERO linhas e recebe o 409 — sem lock, sem janela, e sem a leitura
 * prévia que criaria a janela.
 *
 * E devolução só AUMENTA o disponível: mesmo que as duas passassem, o estoque
 * não ficaria negativo. O erro que se evita aqui é de HISTÓRICO — duas
 * devoluções da mesma unidade —, não de saldo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function checkinAccessory(
  checkoutId: string,
  data: CheckinAccessoryData,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const devolvidoEm = new Date();

    // CONDICIONAL: `checkedInAt: null` no WHERE é o que serializa a devolução.
    const { count } = await tx.accessoryCheckout.updateMany({
      where: { id: checkoutId, checkedInAt: null },
      data: {
        checkedInAt: devolvidoEm,
        checkinNotes: data.notes ?? null,
        checkinById: actorId,
      },
    });

    if (count === 0) {
      // Zero linhas é "não existe" OU "já foi devolvida" — e as duas precisam
      // de respostas diferentes, senão o operador vê 404 para uma unidade que
      // está na tela dele. Só aqui vale a consulta extra: no caminho feliz ela
      // não acontece.
      const existente = await tx.accessoryCheckout.findUnique({
        where: { id: checkoutId },
        select: { checkedInAt: true },
      });
      if (!existente) throw new AppError('Nenhuma entrega com este identificador.', 404);

      throw new AppError('Esta unidade já foi devolvida.', 409, {
        checkedInAt: existente.checkedInAt?.toISOString() ?? null,
      });
    }

    const checkout = await tx.accessoryCheckout.findUniqueOrThrow({
      where: { id: checkoutId },
      select: ACCESSORY_CHECKOUT_SELECT,
    });

    await recordActivity(tx, {
      entityType: accessorySpec.entityType,
      entityId: checkout.accessoryId,
      action: 'CHECKIN',
      changes: {
        checkoutId: checkout.id,
        targetType: checkout.targetType,
        targetId: checkout.targetUserId ?? checkout.targetLocationId,
        checkedInAt: devolvidoEm.toISOString(),
      },
    }, actorId);

    return checkout;
  });
}
