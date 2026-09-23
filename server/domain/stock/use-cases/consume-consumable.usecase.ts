import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import {
  assertDisponivel, contarEmUsoDe, travarItemOuFalhar,
} from '../helpers/stock-balance.helper';
import { consumableSpec } from '../helpers/stock-kind.helper';
import { CONSUMABLE_CHECKOUT_SELECT } from '../helpers/stock-select.helper';
import type { ConsumeData } from '../schemas/consumable.schema';

/**
 * O CONSUMO — a saída que não volta.
 *
 * Não existe função de devolução neste arquivo, nem rota no maestro, nem coluna
 * no banco (D37). A irreversibilidade é ESTRUTURAL, não uma regra a lembrar:
 * `POST /api/consumables/checkouts/:id/checkin` responde 404 do ROTEADOR, e
 * implementar a devolução exigiria uma migração — que é o tipo de mudança que
 * alguém revisa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO SE TRAVA A LINHA DO USUÁRIO AQUI, se a entrega de acessório trava.
 *
 * Lá a trava existe para o `offboard` não perder uma entrega que nasce durante
 * a leitura dele — o desligado terminaria com unidade ABERTA na mão. Aqui não
 * há nada aberto: o consumo não tem estado a fechar, e o desligamento não o
 * procura. O pior caso da corrida é uma resma registrada no nome de quem foi
 * desligado no mesmo segundo — um fato do mundo, gravado com o nome certo, que
 * nenhuma operação futura precisa desfazer.
 *
 * Travar à toa aqui só aumentaria a chance de deadlock com o caminho que
 * realmente precisa da trava.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function consumeConsumable(
  consumableId: string,
  data: ConsumeData,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // A TRAVA DA LINHA-PAI, pelo mesmo motivo da entrega: contar não é travar.
    await travarItemOuFalhar(tx, 'CONSUMABLE', consumableSpec.rotulo, consumableId);

    const consumivel = await tx.consumable.findFirst({
      where: { id: consumableId },
      select: { id: true, name: true, qty: true },
    });
    if (!consumivel) throw new AppError('Nenhum consumível com este identificador.', 404);

    const pessoa = await tx.user.findFirst({
      where: { id: data.userId },
      select: { id: true, name: true, isActive: true },
    });
    if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);
    if (!pessoa.isActive) {
      throw new AppError(`${pessoa.name} está desligado(a) e não pode retirar material.`, 409);
    }

    const emUso = await contarEmUsoDe(tx, 'CONSUMABLE', consumableId);
    assertDisponivel(consumableSpec.rotulo, data.qty, consumivel.qty, emUso);

    const consumo = await tx.consumableCheckout.create({
      data: {
        consumableId,
        userId: pessoa.id,
        // O NOME COPIADO NO ATO, pelo mesmo motivo do EULA do `Acceptance`
        // (D29): o consumo de março precisa continuar legível depois que a
        // pessoa sai — e o `SetNull` da FK zera `userId` sem avisar ninguém.
        userNameSnapshot: pessoa.name,
        qty: data.qty,
        notes: data.notes ?? null,
        consumedById: actorId,
      },
      select: CONSUMABLE_CHECKOUT_SELECT,
    });

    await recordActivity(tx, {
      entityType: consumableSpec.entityType,
      entityId: consumableId,
      action: 'CHECKOUT',
      changes: {
        consumoId: consumo.id,
        userId: pessoa.id,
        qty: data.qty,
        disponivel: consumivel.qty - emUso - data.qty,
      },
    }, actorId);

    return consumo;
  });
}
