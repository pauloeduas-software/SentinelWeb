import { prisma } from '../../../core/database/prismaClient';
import { agruparPorLote, chaveDoLote } from './stock-lote.helper';

// A ENTREGA DE ESTOQUE COMO EVENTO DE HISTÓRICO — do colaborador e do computador.
//
// O histórico do colaborador lê o estoque no NOME dele; o do computador, os
// componentes instalados nele (AI). A forma do evento mora aqui para os dois
// não divergirem, como a da licença (`license-events.helper.ts`).

/**
 * O que um evento de estoque acrescenta: QUAL item e quantas unidades. É a
 * ENTREGA, não a unidade — "recebeu 3 Mouse USB", como o histórico do item.
 */
export interface EventoDeEstoque {
  /** Nulo quando o item foi excluído: o nome continua em `itemLabel` (AG). */
  itemId: string | null;
  itemLabel: string;
  unidades: number;
  /** A observação é da entrega; a devolução não tem a sua. */
  notes: string | null;
}

export interface EventoBaseDeEstoque {
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  at: Date;
  estoque: EventoDeEstoque;
}

/**
 * As unidades que já estiveram com o alvo — abertas e devolvidas. O item
 * desativado continua aparecendo: a entrega aconteceu.
 */
export function buscarUnidadesDoAlvo(alvo: { targetPersonId: string } | { targetAssetId: string }) {
  return prisma.stockMovement.findMany({
    where: alvo,
    select: {
      id: true,
      itemId: true,
      itemName: true,
      createdAt: true,
      checkoutAt: true,
      returnedAt: true,
      returnRecordedAt: true,
      notes: true,
      targetType: true,
      targetPersonId: true,
      targetWorkstationId: true,
      targetWorkstationName: true,
      targetAssetId: true,
      item: { select: { name: true } },
    },
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });
}

/**
 * As unidades viram eventos POR ENTREGA, como no histórico do item: a entrega é
 * um evento com todas as unidades; cada devolução, as unidades dela registradas juntas (o mesmo
 * `returnRecordedAt` — duas devoluções no mesmo dia são duas). No mesmo
 * instante, a devolução vem antes da entrega.
 */
export function eventosDasUnidades(
  unidades: Awaited<ReturnType<typeof buscarUnidadesDoAlvo>>,
): EventoBaseDeEstoque[] {
  const eventos: EventoBaseDeEstoque[] = [];
  for (const { primeira, unidades: quantas } of agruparPorLote(unidades)) {
    const doLote = unidades.filter((unidade) => chaveDoLote(unidade) === chaveDoLote(primeira));
    // O item excluído deixa o nome por escrito na entrega (AG).
    const base = { itemId: primeira.itemId, itemLabel: primeira.item?.name ?? primeira.itemName ?? '—' };

    // Chave: o instante do registro; valor: o dia da devolução e quantas.
    const devolucoes = new Map<number, { at: Date; devolvidas: number }>();
    for (const unidade of doLote) {
      if (!unidade.returnedAt || !unidade.returnRecordedAt) continue;
      const registro = unidade.returnRecordedAt.getTime();
      const devolucao = devolucoes.get(registro);
      if (devolucao) devolucao.devolvidas += 1;
      else devolucoes.set(registro, { at: unidade.returnedAt, devolvidas: 1 });
    }
    // A mais recente primeiro: no mesmo dia, o `sort` estável do merge mantém
    // esta ordem.
    for (const [registro, { at, devolvidas }] of [...devolucoes].sort(([a], [b]) => b - a)) {
      eventos.push({
        id: `estoque:${primeira.id}:devolucao:${registro}`,
        action: 'CHECKIN',
        at,
        estoque: { ...base, unidades: devolvidas, notes: null },
      });
    }

    eventos.push({
      id: `estoque:${primeira.id}:entrega`,
      action: 'CHECKOUT',
      at: primeira.checkoutAt,
      estoque: { ...base, unidades: quantas, notes: primeira.notes },
    });
  }
  return eventos;
}
