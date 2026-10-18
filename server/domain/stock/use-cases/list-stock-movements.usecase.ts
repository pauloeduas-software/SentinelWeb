import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';

// A MOVIMENTAÇÃO DE UM ITEM — a linha do tempo, montada na LEITURA.
//
// A tabela é uma só, mas uma SAIDA rende DOIS eventos em datas diferentes: a
// saída, em `createdAt`, e a devolução, em `returnedAt`. A união acontece aqui,
// em memória, e é barata — o resultado é uma página, não a tabela.
//
// ═════════════════════════════════════════════════════════════════════════════
// E É POR ISSO QUE A TABELA É LIDA POR DUAS ORDENAÇÕES.
//
// A saída de janeiro devolvida hoje é o evento MAIS RECENTE do item, e a linha
// dela é uma das MAIS ANTIGAS por `createdAt`. Com uma consulta só, ordenada
// pela data de saída, essa linha não entra no `take` — e a devolução de hoje
// simplesmente não aparece numa lista que promete "mais recente primeiro".
// Some sem erro, e o que fica no topo é plausível.
//
// A saída é ler o topo por CADA data e unir: as `limite` linhas mais recentes
// por `createdAt` MAIS as `limite` mais recentes por `returnedAt`. Qualquer
// evento que caiba no corte final está em uma das duas.
// ═════════════════════════════════════════════════════════════════════════════

type Movimento = Prisma.StockMovementGetPayload<{ select: typeof STOCK_MOVEMENT_SELECT }>;

export type AcaoDoMovimento = 'ENTRADA' | 'BAIXA' | 'SAIDA' | 'DEVOLUCAO';

export interface EventoDeEstoque {
  /**
   * Chave ESTÁVEL para a tela, com prefixo: uma saída rende dois eventos (a
   * saída e a devolução), que colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  movementId: string;
  action: AcaoDoMovimento;
  at: Date;
  /**
   * Quantas unidades o evento moveu. Na SAIDA é o tamanho do LOTE: as N linhas
   * de uma mesma saída (mesmo instante, mesmo alvo, mesmo autor) viram um
   * evento só — "5 mouses para a Mesa 1", não cinco linhas de um. A devolução
   * é por unidade, e fica por unidade.
   */
  qty: number;
  /** "Laura Souza", "Mesa 1". Nulo na entrada e na baixa. */
  targetLabel: string | null;
  targetType: Movimento['targetType'];
  targetUserId: string | null;
  targetLocationId: string | null;
  notes: string | null;
  actorId: string | null;
}

const LIMITE_PADRAO = 100;

function rotuloDoAlvo(movimento: Movimento): string | null {
  if (movimento.targetType === 'USER') return movimento.targetUser?.name ?? null;
  if (movimento.targetType === 'LOCATION') return movimento.targetLocation?.name ?? null;
  return null;
}

/** Uma linha vira um ou dois eventos. */
function eventosDe(movimento: Movimento): EventoDeEstoque[] {
  const base = {
    movementId: movimento.id,
    targetLabel: rotuloDoAlvo(movimento),
    targetType: movimento.targetType,
    targetUserId: movimento.targetUserId,
    targetLocationId: movimento.targetLocationId,
  };

  const eventos: EventoDeEstoque[] = [{
    ...base,
    id: `${movimento.kind.toLowerCase()}:${movimento.id}`,
    action: movimento.kind,
    at: movimento.createdAt,
    qty: movimento.qty,
    notes: movimento.notes,
    actorId: movimento.createdById,
  }];

  if (movimento.kind === 'SAIDA' && movimento.returnedAt) {
    eventos.push({
      ...base,
      id: `devolucao:${movimento.id}`,
      action: 'DEVOLUCAO',
      at: movimento.returnedAt,
      qty: movimento.qty,
      // A devolução não leva observação: a da linha é a da SAÍDA.
      notes: null,
      actorId: movimento.returnedById,
    });
  }

  return eventos;
}

/** A chave do lote: o que faz N linhas de uma saída serem o MESMO evento. */
function chaveDoLote(evento: EventoDeEstoque): string {
  return [
    evento.action, evento.at.getTime(), evento.targetType, evento.targetUserId,
    evento.targetLocationId, evento.actorId, evento.notes,
  ].join('|');
}

/**
 * Junta as linhas de uma mesma saída num evento só.
 *
 * Só a SAIDA: ENTRADA e BAIXA já são uma linha por operação, e a DEVOLUCAO é por
 * unidade por desenho. O `createManyAndReturn` da saída grava as N linhas com o
 * mesmo `createdAt`, então a chave fecha o lote sem precisar de um id de lote na
 * tabela.
 */
function agruparSaidas(eventos: EventoDeEstoque[]): EventoDeEstoque[] {
  const lotes = new Map<string, EventoDeEstoque>();
  const resultado: EventoDeEstoque[] = [];

  for (const evento of eventos) {
    if (evento.action !== 'SAIDA') {
      resultado.push(evento);
      continue;
    }
    const lote = lotes.get(chaveDoLote(evento));
    if (lote) {
      lote.qty += evento.qty;
    } else {
      const copia = { ...evento };
      lotes.set(chaveDoLote(evento), copia);
      resultado.push(copia);
    }
  }

  return resultado;
}

export async function listStockMovements(itemId: string, limite = LIMITE_PADRAO) {
  // `findFirst` pelo escopo da lixeira, como o detalhe: a movimentação de um
  // item apagado se lê restaurando o item.
  const item = await prisma.stockItem.findFirst({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  // `id` desempata em todas as ordenações: as N linhas de uma saída nascem no
  // mesmo milissegundo, e sem o desempate a borda do `take` mudaria entre dois
  // GETs iguais.
  const [porSaida, porDevolucao, linhasNoBanco, devolvidas] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { itemId },
      select: STOCK_MOVEMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limite,
    }),
    prisma.stockMovement.findMany({
      // `kind: 'SAIDA'` junto: é o que o CHECK já garante, e é o que deixa o
      // índice `(itemId, kind, returnedAt)` servir filtro e ordenação.
      where: { itemId, kind: 'SAIDA', returnedAt: { not: null } },
      select: STOCK_MOVEMENT_SELECT,
      orderBy: [{ returnedAt: 'desc' }, { id: 'desc' }],
      take: limite,
    }),
    prisma.stockMovement.count({ where: { itemId } }),
    prisma.stockMovement.count({ where: { itemId, kind: 'SAIDA', returnedAt: { not: null } } }),
  ]);

  const linhas = new Map<string, Movimento>();
  for (const movimento of [...porSaida, ...porDevolucao]) linhas.set(movimento.id, movimento);

  const eventos = agruparSaidas(
    [...linhas.values()].flatMap(eventosDe)
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id)),
  ).slice(0, limite);

  // A QTY DE CADA SAIDA É RECONTADA NO BANCO, e não só a soma de quem apareceu
  // na janela. `porSaida`/`porDevolucao` cortam por LINHA (`take: limite`), e as
  // N linhas de um lote são contíguas na ordenação — mas um lote bem no limite
  // do corte pode ter só PARTE das linhas na janela, e a soma local subcontaria
  // em silêncio: um evento "saíram 37" quando saíram 100. A recontagem é pelo
  // MESMO discriminante do CHECK `stock_movements_forma` (ele garante que são as
  // colunas que fecham o lote), e só para os eventos que de fato vão à tela —
  // o resto da página nunca pede esta conta.
  await Promise.all(eventos.filter((e) => e.action === 'SAIDA').map(async (evento) => {
    evento.qty = await prisma.stockMovement.count({
      where: {
        itemId, kind: 'SAIDA', createdAt: evento.at,
        targetType: evento.targetType, targetUserId: evento.targetUserId,
        targetLocationId: evento.targetLocationId, createdById: evento.actorId, notes: evento.notes,
      },
    });
  }));

  // O total de EVENTOS ANTES do agrupamento: linhas mais devoluções. É o número
  // honesto para "há mais do que isto" — o lote só junta o que a tela mostra.
  return { total: linhasNoBanco + devolvidas, rows: eventos };
}
