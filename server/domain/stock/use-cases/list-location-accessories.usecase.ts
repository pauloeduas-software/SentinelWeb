import { prisma } from '../../../core/database/prismaClient';
import { ACCESSORY_CHECKOUT_SELECT } from '../helpers/stock-select.helper';

/**
 * O QUE ESTE POSTO TEM, do lado do estoque — as unidades entregues a ele.
 *
 * Uma linha por UNIDADE, não uma por acessório com contagem: cada linha tem a
 * própria data de entrega e o próprio botão de devolver, e agrupar aqui tiraria
 * da tela a capacidade de devolver uma das cinco. A tela agrupa quando quiser
 * mostrar "Mouse ×5".
 *
 * NÃO resolve responsáveis. Quem responde pelas unidades são os OCUPANTES do
 * posto, que a mesma resposta já traz na lista `ocupantes` — repeti-los por
 * unidade daria cinco cópias dos mesmos dois nomes e convidaria à soma que o
 * D33 proíbe.
 */
export async function listLocationAccessories(locationId: string) {
  return prisma.accessoryCheckout.findMany({
    where: {
      targetType: 'LOCATION',
      targetLocationId: locationId,
      checkedInAt: null,
      // Acessório na lixeira não aparece na mesa: ele saiu do inventário, e a
      // tela não teria como abri-lo. Mesma escolha do `holdings` e do alerta.
      accessory: { deletedAt: null },
    },
    select: {
      ...ACCESSORY_CHECKOUT_SELECT,
      accessory: {
        select: {
          id: true, name: true, modelNumber: true,
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { checkedOutAt: 'asc' },
  });
}
