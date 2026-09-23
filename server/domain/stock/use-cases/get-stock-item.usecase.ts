import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { comSaldo, contarEmUsoDe } from '../helpers/stock-balance.helper';
import type { ClienteEstoque, StockKindSpec } from '../helpers/stock-kind.helper';
import type { ItemComSaldo, ItemDeEstoque } from './list-stock.usecase';

/**
 * UM item, com o saldo já calculado.
 *
 * `findFirst` e nunca `findUnique`: o escopo da lixeira não alcança o
 * `findUnique` (`core/database/soft-delete.extension.ts`), e a tela de detalhe
 * de um item apagado abriria como se ele estivesse no estoque.
 *
 * Aceita o cliente de transação porque as operações de saída releem o item
 * DENTRO da transação, depois da trava — ler por fora seria ler um estado que a
 * trava existe justamente para congelar.
 */
export async function getStockItem(
  spec: StockKindSpec,
  id: string,
  client: ClienteEstoque = prisma,
): Promise<ItemComSaldo> {
  const item = await spec.delegate(client).findFirst({
    where: { id },
    select: spec.select,
  }) as ItemDeEstoque | null;

  if (!item) throw new AppError(`Nenhum ${spec.rotulo} com este identificador.`, 404);

  return comSaldo(item, await contarEmUsoDe(client, spec.kind, id));
}
