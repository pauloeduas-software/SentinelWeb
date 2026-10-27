import { prisma } from '../../../core/database/prismaClient';
import { agruparPorLote } from '../helpers/stock-lote.helper';

// O ESTOQUE NUMA FICHA — a do posto e a do colaborador: o que está com ele
// AGORA, uma linha por ENTREGA ("Mouse USB · 3 unidades"), com o item e desde
// quando. A devolução mora no detalhe do item, como a da licença: a ficha
// mostra e aponta para lá.
//
// Consulta nas entregas, e não no item, de propósito: a pergunta é "o que está
// nesta mesa", e a resposta são as unidades abertas. O item desativado vem
// junto: a unidade continua na mesa até alguém devolvê-la.

const UNIDADE_DA_FICHA = {
  id: true,
  itemId: true,
  createdAt: true,
  checkoutAt: true,
  notes: true,
  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  targetWorkstationName: true,
  item: {
    select: {
      id: true, name: true, isActive: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const;

async function entregasAbertas(alvo: { targetWorkstationId: string } | { targetPersonId: string }) {
  const unidades = await prisma.stockMovement.findMany({
    where: { ...alvo, returnedAt: null },
    select: UNIDADE_DA_FICHA,
    // Agrupadas por item e, dentro dele, na ordem em que saíram.
    orderBy: [{ item: { name: 'asc' } }, { checkoutAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  return agruparPorLote(unidades).map(({ primeira, unidades: quantas }) => ({
    id: primeira.id,
    itemId: primeira.itemId,
    item: primeira.item,
    checkoutAt: primeira.checkoutAt,
    notes: primeira.notes,
    unidades: quantas,
  }));
}

/** O que está NESTA MESA — qualquer ocupante aberto dela responde por isto. */
export function listWorkstationStock(workstationId: string) {
  return entregasAbertas({ targetWorkstationId: workstationId });
}

/** O mesmo, para a PESSOA: as unidades no nome dela. */
export function listPersonStock(personId: string) {
  return entregasAbertas({ targetPersonId: personId });
}
