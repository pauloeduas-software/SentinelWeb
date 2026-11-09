import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import { contemTexto } from '../../shared/busca.helper';
import { agruparPorLote } from '../helpers/stock-lote.helper';
import { rotuloDoAlvo, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';

type Unidade = Prisma.StockMovementGetPayload<{ select: typeof STOCK_MOVEMENT_SELECT }>;

/** Quem está no posto agora: só o nome, sem o turno (BO). */
interface PessoaNoPosto {
  id: string;
  name: string;
}

/** Uma linha da aba Responsáveis: uma entrega, com quantas unidades dela ainda estão fora. */
export interface EntregaAberta {
  /** Uma unidade da entrega — o `:id` da devolução. */
  id: string;
  targetType: Unidade['targetType'];
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetAssetId: string | null;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell do financeiro". */
  targetLabel: string;
  /** O computador do componente, para a etiqueta sair em mono; nulo nos outros alvos. */
  targetAsset: Unidade['targetAsset'];
  /** Quem está no posto agora (BL); vazio fora do posto. */
  responsaveis: PessoaNoPosto[];
  checkoutAt: Date;
  notes: string | null;
  /** Quantas desta entrega ainda estão com o alvo. */
  unidades: number;
}

/**
 * QUEM ESTÁ COM ESTE ITEM AGORA — a lista do detalhe, com o botão de devolver
 * em cada linha (o Retirar, no componente: a linha é o computador). O que já foi devolvido mora no histórico. É a aba Responsáveis
 * da licença, com uma diferença que é do estoque: a linha é a ENTREGA ("Mesa 1 ·
 * 5 unidades"), não a unidade.
 *
 * Paginada e com busca pelo nome de quem recebeu — o colaborador, o posto ou quem
 * está nele agora, ou a etiqueta e o nome do computador. A busca acha o que a linha
 * mostra, como a do computador (`textoDaPosse`).
 *
 * AS ENTREGAS SÃO MONTADAS EM MEMÓRIA, e é barato: são só as unidades ABERTAS
 * deste item, e o total limita quantas existem.
 */
export async function listStockCheckouts(itemId: string, query: ListQuery): Promise<ListEnvelope<EntregaAberta>> {
  const item = await prisma.stockItem.findUnique({ where: { id: itemId }, select: { id: true } });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const contem = query.q ? contemTexto(query.q) : undefined;
  const unidades = await prisma.stockMovement.findMany({
    where: {
      itemId,
      returnedAt: null,
      ...(contem ? {
        OR: [
          { targetPerson: { name: contem } },
          { targetWorkstation: { name: contem } },
          { targetWorkstation: { occupants: { some: { endedAt: null, person: { name: contem } } } } },
          { targetAsset: { assetTag: contem } },
          { targetAsset: { name: contem } },
          { targetAsset: { serial: contem } },
        ],
      } : {}),
    },
    select: STOCK_MOVEMENT_SELECT,
    // A mais recente primeiro, como a licença. `createdAt` separa as entregas do
    // mesmo dia passado, e `id` fecha a ordem: a mesma linha não aparece em
    // duas páginas.
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });

  const entregas = agruparPorLote(unidades);
  const pagina = entregas.slice(query.skip, query.skip + query.take);
  const ocupantes = await quemEstaNosPostos(pagina.flatMap(({ primeira }) => primeira.targetWorkstationId ?? []));

  const rows = pagina.map(({ primeira, unidades: quantas }): EntregaAberta => ({
    id: primeira.id,
    targetType: primeira.targetType,
    targetPersonId: primeira.targetPersonId,
    targetWorkstationId: primeira.targetWorkstationId,
    targetAssetId: primeira.targetAssetId,
    targetLabel: rotuloDoAlvo(primeira),
    targetAsset: primeira.targetAsset,
    responsaveis: primeira.targetWorkstationId ? ocupantes.get(primeira.targetWorkstationId) ?? [] : [],
    checkoutAt: primeira.checkoutAt,
    notes: primeira.notes,
    unidades: quantas,
  }));

  return { total: entregas.length, rows };
}

/**
 * Quem ocupa cada posto agora, numa consulta só para as linhas da página. Turno e
 * depois antiguidade, a ordem do computador (`resolverResponsaveisEmLote`): a lista
 * sai igual a cada chamada.
 */
async function quemEstaNosPostos(idsDePosto: string[]): Promise<Map<string, PessoaNoPosto[]>> {
  const porPosto = new Map<string, PessoaNoPosto[]>();
  if (idsDePosto.length === 0) return porPosto;

  const ocupacoes = await prisma.workstationOccupant.findMany({
    where: { workstationId: { in: [...new Set(idsDePosto)] }, endedAt: null },
    select: { workstationId: true, person: { select: { id: true, name: true } } },
    orderBy: [{ shift: 'asc' }, { startedAt: 'asc' }],
  });
  for (const { workstationId, person } of ocupacoes) {
    // A ocupação aberta aponta sempre para o posto: o `if` é para o tipo.
    if (!workstationId) continue;
    porPosto.set(workstationId, [...(porPosto.get(workstationId) ?? []), person]);
  }
  return porPosto;
}
