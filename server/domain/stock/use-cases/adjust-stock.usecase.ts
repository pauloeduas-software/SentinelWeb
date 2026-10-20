import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { comSaldo, contarForaDe, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { AdjustStockInput } from '../schemas/stock.schema';

// ENTRADA E BAIXA — a ÚNICA porta para o total do item.
//
// Quantidade é CONSEQUÊNCIA de movimentação, não atributo digitável: com a chave
// no schema de edição existiriam dois caminhos para mudá-la e só um gravaria o
// movimento — e o caminho silencioso seria justamente o `PUT` do formulário, o
// mais usado. A defesa não é uma checagem: é a chave não existir lá.
//
// DELTA, E NÃO O VALOR FINAL. "O total agora é 42" é ler-e-depois-escrever com
// outro nome: duas recontagens simultâneas gravariam números calculados a
// partir do mesmo estado antigo e uma sumiria sem erro. O delta é aplicado com
// `increment`/`decrement`, que o Postgres resolve dentro da linha já travada.

export async function adjustStock(itemId: string, data: AdjustStockInput) {
  return prisma.$transaction(async (tx) => {
    // A TRAVA antes de qualquer leitura, como em toda operação que compara um
    // número lido com o que vai gravar.
    await travarItemOuFalhar(tx, itemId);

    const antes = await tx.stockItem.findFirst({ where: { id: itemId }, select: { id: true, name: true, qty: true } });
    if (!antes) throw new AppError('Item de estoque não encontrado.', 404);

    const fora = await contarForaDe(tx, itemId);

    // BAIXA ABAIXO DO QUE ESTÁ FORA É RECUSADA, e este é o único `if` do ajuste.
    //
    // Sem ele, dar baixa de 10 num item com 8 unidades na rua gravaria `qty = 2`
    // e `disponivel = −6`. O negativo não quebra nada — o helper de saldo o
    // devolve de propósito —, mas aqui ele seria uma afirmação falsa sobre o
    // almoxarifado: as 8 unidades existem, estão com gente, e a baixa diz que
    // 10 sumiram. Quebrou o que está fora? Devolva e dê a baixa depois.
    if (data.kind === 'BAIXA' && antes.qty - data.qty < fora) {
      throw new AppError(
        `A baixa de ${data.qty} deixaria o total (${antes.qty}) abaixo do que está fora do estoque (${fora}). `
          + 'Devolva as unidades antes de dar baixa nelas.',
        409,
      );
    }

    const depois = await tx.stockItem.update({
      where: { id: itemId },
      data: { qty: data.kind === 'ENTRADA' ? { increment: data.qty } : { decrement: data.qty } },
      select: STOCK_ITEM_SELECT,
    });

    const movimento = await tx.stockMovement.create({
      data: { itemId, kind: data.kind, qty: data.qty, notes: data.notes ?? null },
      select: STOCK_MOVEMENT_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'StockItem',
      entityId: itemId,
      action: 'UPDATE',
      changes: { qty: { de: antes.qty, para: depois.qty }, movimento: { de: null, para: data.kind } },
    });

    return { item: comSaldo(depois, fora), movimento };
  });
}
