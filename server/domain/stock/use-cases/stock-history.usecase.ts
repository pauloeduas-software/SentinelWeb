import type { StockTarget } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { rotuloDoComputador } from '../helpers/stock-select.helper';

// POR ONDE O ITEM PASSOU — o histórico do detalhe, como o da licença
// (`license-history.usecase.ts`).
//
// Só movimentação: cada entrega e cada devolução (no componente, a retirada do
// computador), com o nome de quem recebeu e a observação. Cadastro, edição (o total inclusive) e desativação não entram:
// ficam na auditoria (`audit_logs`, AB), que tela nenhuma lê.
//
// A ENTREGA É UMA SÓ, não uma por unidade: as N linhas do mesmo INSERT para o mesmo
// alvo são UM evento ("Entregue a Mesa 1 · 5 unidades"), e as que voltaram na
// mesma devolução (o mesmo `returnRecordedAt`) são UMA devolução — duas no mesmo
// dia são duas.

export interface EventoDoItem {
  /** Estável para a tela: a entrega e qual dos dois eventos dela. */
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  at: Date;
  unidades: number;
  targetType: StockTarget;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetAssetId: string | null;
  /** "Laura Souza", "Mesa 1", "ATV-00012" — o nome por escrito, quando o posto foi excluído. */
  targetLabel: string;
  /** A observação é da entrega; a devolução não tem a sua. */
  notes: string | null;
}

/** Uma linha da página, como o banco a corta. */
interface EventoNaPagina {
  action: EventoDoItem['action'];
  at: Date;
  lote: Date;
  /** O instante do registro: o da entrega (`createdAt`) ou o da devolução. */
  registro: Date;
  targetType: StockTarget;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetWorkstationName: string | null;
  targetAssetId: string | null;
  notes: string | null;
  unidades: number;
}

/**
 * Paginado NO BANCO, do mais recente para o mais antigo.
 *
 * As entregas e as devoluções são lidas lado a lado pelo `UNION ALL`, cada uma
 * já agrupada — a entrega pelo INSERT e pelo alvo, a devolução também pelo
 * instante em que foi registrada —, e o `LIMIT` corta a página já ordenada.
 *
 * No mesmo instante, a devolução vem antes da entrega ('CHECKIN' < 'CHECKOUT'),
 * como na licença. O registro, o lote e o alvo desempatam o resto — duas
 * devoluções no mesmo dia, a mais recente primeiro —, para a página não variar
 * entre duas leituras.
 */
export async function listStockHistory(
  itemId: string,
  query: Pick<ListQuery, 'skip' | 'take'>,
): Promise<ListEnvelope<EventoDoItem>> {
  const item = await prisma.stockItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const [contagem, pagina] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`
      SELECT (
        (SELECT count(*) FROM (
          SELECT 1 FROM stock_movements WHERE "itemId" = ${itemId}::uuid
           GROUP BY "createdAt", "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId"
        ) AS entregas)
        + (SELECT count(*) FROM (
          SELECT 1 FROM stock_movements WHERE "itemId" = ${itemId}::uuid AND "returnedAt" IS NOT NULL
           GROUP BY "createdAt", "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId", "returnRecordedAt"
        ) AS devolucoes)
      )::int AS total
    `,
    prisma.$queryRaw<EventoNaPagina[]>`
      SELECT * FROM (
        SELECT 'CHECKOUT' AS action, min("checkoutAt") AS at, "createdAt" AS lote, "createdAt" AS registro,
               "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId",
               min(notes) AS notes, count(*)::int AS unidades
          FROM stock_movements
         WHERE "itemId" = ${itemId}::uuid
         GROUP BY "createdAt", "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId"
        UNION ALL
        SELECT 'CHECKIN', min("returnedAt"), "createdAt", "returnRecordedAt",
               "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId",
               NULL, count(*)::int
          FROM stock_movements
         WHERE "itemId" = ${itemId}::uuid AND "returnedAt" IS NOT NULL
         GROUP BY "createdAt", "targetType", "targetPersonId", "targetWorkstationId", "targetWorkstationName", "targetAssetId", "returnRecordedAt"
      ) AS eventos
      ORDER BY at DESC, action ASC, registro DESC, lote DESC, "targetPersonId", "targetWorkstationId", "targetWorkstationName",
               "targetAssetId"
      LIMIT ${query.take}::int OFFSET ${query.skip}::bigint
    `,
  ]);

  // Os nomes de quem recebeu, numa ida por tipo de alvo. O colaborador e o
  // computador na lixeira continuam com nome: a entrega aconteceu.
  const pessoas = new Set(pagina.flatMap((evento) => (evento.targetPersonId ? [evento.targetPersonId] : [])));
  const postos = new Set(pagina.flatMap((evento) => (evento.targetWorkstationId ? [evento.targetWorkstationId] : [])));
  const computadores = new Set(pagina.flatMap((evento) => (evento.targetAssetId ? [evento.targetAssetId] : [])));
  const [comPessoa, comPosto, comComputador] = await Promise.all([
    prisma.person.findMany({ where: { id: { in: [...pessoas] }, ...INCLUINDO_LIXEIRA }, select: { id: true, name: true } }),
    prisma.workstation.findMany({ where: { id: { in: [...postos] } }, select: { id: true, name: true } }),
    prisma.asset.findMany({
      where: { id: { in: [...computadores] }, ...INCLUINDO_LIXEIRA }, select: { id: true, assetTag: true, name: true },
    }),
  ]);
  const nomes = new Map([
    ...[...comPessoa, ...comPosto].map((alvo) => [alvo.id, alvo.name] as const),
    ...comComputador.map((ativo) => [ativo.id, rotuloDoComputador(ativo)] as const),
  ]);

  return {
    total: contagem[0]?.total ?? 0,
    rows: pagina.map((evento) => ({
      id: [
        evento.action, evento.lote.getTime(), evento.targetPersonId ?? evento.targetWorkstationId
          ?? evento.targetAssetId ?? evento.targetWorkstationName, evento.registro.getTime(),
      ].join(':'),
      action: evento.action,
      at: evento.at,
      unidades: evento.unidades,
      targetType: evento.targetType,
      targetPersonId: evento.targetPersonId,
      targetWorkstationId: evento.targetWorkstationId,
      targetAssetId: evento.targetAssetId,
      targetLabel: nomes.get(evento.targetPersonId ?? evento.targetWorkstationId ?? evento.targetAssetId ?? '')
        ?? evento.targetWorkstationName ?? '—',
      notes: evento.notes,
    })),
  };
}
