import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ACCESSORY_CHECKOUT_SELECT } from '../helpers/stock-select.helper';

/**
 * As unidades deste acessório que estão FORA — quem tem o quê.
 *
 * Só as abertas: é a lista de onde se clica "devolver", e uma entrega já
 * fechada não tem botão. O histórico completo está na movimentação
 * (`list-item-movements.usecase.ts`), que une as duas fontes.
 *
 * NÃO resolve os responsáveis do posto aqui. A unidade entregue à Mesa 1 é do
 * POSTO (D33), e quem responde por ela são os ocupantes abertos — resolvidos
 * pela mesma Camada 3 da F4, na tela que precisar. Embutir a resolução nesta
 * lista faria a rota devolver 5 nomes para 1 unidade e convidaria alguém a
 * somá-los, que é exatamente a soma que o D33 proíbe.
 */
export async function listAccessoryCheckouts(accessoryId: string) {
  const acessorio = await prisma.accessory.findFirst({
    where: { id: accessoryId },
    select: { id: true },
  });
  if (!acessorio) throw new AppError('Nenhum acessório com este identificador.', 404);

  return prisma.accessoryCheckout.findMany({
    where: { accessoryId, checkedInAt: null },
    select: ACCESSORY_CHECKOUT_SELECT,
    orderBy: { checkedOutAt: 'asc' },
  });
}
