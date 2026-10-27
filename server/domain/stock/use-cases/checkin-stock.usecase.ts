import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';
import { rotuloDoAlvo, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';
import type { CheckinStockInput } from '../schemas/stock.schema';

// A DEVOLUÇÃO DE UMA ENTREGA — N unidades dela, num dia. É a devolução da
// licença (`checkin-license.usecase.ts`), com quantidade.
//
// PELA ENTREGA, nunca pelo item ou pelo alvo: o `:id` é o de qualquer unidade da
// entrega, e é ela que diz QUAL (o mesmo INSERT, o mesmo alvo). É o que
// impede a tela velha de devolver a unidade errada: a entrega que já voltou
// responde 409, em vez de fechar a entrega que outra pessoa abriu depois — que
// é OUTRA entrega.
//
// Preenche `returnedAt` e NUNCA apaga a linha: "quem estava com o mouse em
// março?" continua respondível depois da devolução.
//
// TRAVA SÓ AS LINHAS DA ENTREGA. É o que impede a devolução dupla: a segunda
// espera, relê, e encontra menos unidades com o alvo. O item não é travado: a
// devolução só diminui o que está em uso, e uma entrega concorrente que conte
// antes dela só erra para o lado seguro (um 409 de "sem unidade" que um
// segundo depois não seria).

function quantas(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

export async function checkinStock(movementId: string, data: Partial<CheckinStockInput>, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    const unidade = await tx.stockMovement.findUnique({
      where: { id: movementId },
      select: { ...STOCK_MOVEMENT_SELECT, itemName: true, item: { select: { name: true } } },
    });
    if (!unidade) throw new AppError('Nenhuma entrega de estoque com este identificador.', 404);
    // O ITEM EXCLUÍDO (AG) só deixa entrega já devolvida — a em uso segura a
    // exclusão. A tela velha que ainda mostra a linha recebe o mesmo 409.
    const item = unidade.item;
    if (!item || !unidade.itemId) {
      throw new AppError(`Esta entrega de "${unidade.itemName ?? 'item excluído'}" para ${rotuloDoAlvo(unidade)} já foi devolvida.`, 409);
    }

    // AS UNIDADES DA ENTREGA QUE AINDA ESTÃO COM O ALVO — lidas pelo Prisma, que
    // compara o `createdAt` sem depender do fuso da sessão, e TRAVADAS em
    // seguida. A trava relê `returnedAt` depois de esperar: a devolução
    // simultânea que fechou parte delas tira essas linhas daqui. Todas, e não
    // `LIMIT qty`: com o limite, a segunda devolução ficaria com menos do que
    // existe — um 409 falso.
    const daEntrega = await tx.stockMovement.findMany({
      where: {
        itemId: unidade.itemId,
        createdAt: unidade.createdAt,
        targetType: unidade.targetType,
        targetPersonId: unidade.targetPersonId,
        targetWorkstationId: unidade.targetWorkstationId,
        returnedAt: null,
      },
      select: { id: true },
    });
    const abertas = daEntrega.length === 0 ? [] : await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM stock_movements
       WHERE id = ANY(${daEntrega.map((linha) => linha.id)}::uuid[]) AND "returnedAt" IS NULL
       ORDER BY id
       FOR UPDATE
    `;

    const alvo = rotuloDoAlvo(unidade);
    // 409 e não 404: a entrega existe, o ESTADO dela é que recusa.
    if (abertas.length === 0) {
      throw new AppError(`Esta entrega de "${item.name}" para ${alvo} já foi devolvida.`, 409);
    }
    const pedidas = data.qty ?? abertas.length;
    if (pedidas > abertas.length) {
      throw new AppError(
        `Só ${quantas(abertas.length, 'unidade', 'unidades')} desta entrega de "${item.name}" `
        + `${abertas.length === 1 ? 'ainda está' : 'ainda estão'} com ${alvo}.`,
        409,
      );
    }

    // O DIA da devolução não antecede o DIA da entrega — os dois no calendário
    // de Brasília, que é o que a tela mostra.
    const dia = data.checkinAt ?? hojeNoBrasil();
    const diaDaEntrega = hojeNoBrasil(unidade.checkoutAt);
    if (dia < diaDaEntrega) {
      throw new AppError(
        `A devolução (${diaEmPortugues(dia)}) não pode ser antes da entrega (${diaEmPortugues(diaDaEntrega)}).`,
        422,
      );
    }

    // No MESMO dia, o instante do dia passado (meio-dia) pode cair antes da hora
    // real da entrega — a feita às 23h. A devolução nunca fica antes dela: é o
    // CHECK `stock_movements_devolucao_nao_antecede_entrega`.
    const instante = instanteDoDia(dia);
    const returnedAt = instante < unidade.checkoutAt ? unidade.checkoutAt : instante;

    const ids = abertas.slice(0, pedidas).map((linha) => linha.id);
    // O DIA e o INSTANTE do registro: o instante é o que separa esta devolução
    // de outra da mesma entrega no mesmo dia — o dia passado é sempre o meio-dia.
    await tx.stockMovement.updateMany({ where: { id: { in: ids } }, data: { returnedAt, returnRecordedAt: new Date() } });

    await recordAudit(tx, {
      entityType: 'StockItem',
      entityId: unidade.itemId,
      entityLabel: item.name,
      action: 'CHECKIN',
      changes: {
        movementIds: ids,
        qty: ids.length,
        targetType: unidade.targetType,
        targetId: unidade.targetPersonId ?? unidade.targetWorkstationId,
        targetName: alvo,
        returnedAt: returnedAt.toISOString(),
      },
    }, ator);

    return { devolvidas: ids.length, ficaram: abertas.length - ids.length, returnedAt };
  });
}
