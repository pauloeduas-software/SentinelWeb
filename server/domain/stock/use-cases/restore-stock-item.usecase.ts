import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { comSaldo, contarEmUsoDe } from '../helpers/stock-balance.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import type { ItemComSaldo, ItemDeEstoque } from './list-stock.usecase';

/**
 * Tirar da lixeira.
 *
 * `updateMany` com `deletedAt: { not: null }` no `where`, e não `update`: o
 * `where` explícito é o escape hatch da `softDeleteExtension` — sem a chave
 * `deletedAt` presente, a extension escoparia a consulta para as linhas VIVAS e
 * nenhuma restauração jamais encontraria o que restaurar.
 *
 * O NOME PODE TER SIDO TOMADO enquanto o item estava na lixeira: a unicidade é
 * índice PARCIAL (`WHERE "deletedAt" IS NULL`), então nada impediu um cadastro
 * novo com o mesmo nome. O restore esbarra no índice, e o status certo é 409.
 *
 * MAS A FRASE NÃO PODE SER A GENÉRICA. Deixado ao error-handler, o P2002 vira
 * "Registro já existe" — que num `alert` disparado por um clique em "Restaurar"
 * não diz o que aconteceu nem o que fazer. Quem restaura precisa saber que
 * existe OUTRO item vivo com aquele nome e que um dos dois tem que ser
 * renomeado; o sistema não tem como escolher qual.
 *
 * É o mesmo cuidado que o checkout tem com o `JA_ENTREGUE` — e o débito que o
 * `INVARIANTES.md` registra para a invariante 1, pago aqui.
 */
export async function restoreStockItem(
  spec: StockKindSpec,
  id: string,
  actorId: string | null,
): Promise<ItemComSaldo> {
  const item = await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    let count: number;
    try {
      ({ count } = await delegate.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null },
      }));
    } catch (erro) {
      if (errorCode(erro) === 'P2002') {
        throw new AppError(
          `Já existe outro ${spec.rotulo} com este nome. Renomeie um dos dois antes de restaurar.`,
          409,
        );
      }
      throw erro;
    }

    if (count === 0) throw new AppError(`Nenhum ${spec.rotulo} na lixeira com este identificador.`, 404);

    await recordActivity(tx, { entityType: spec.entityType, entityId: id, action: 'RESTORE' }, actorId);

    return await delegate.findFirst({ where: { id }, select: spec.select }) as ItemDeEstoque;
  });

  return comSaldo(item, await contarEmUsoDe(prisma, spec.kind, id));
}
