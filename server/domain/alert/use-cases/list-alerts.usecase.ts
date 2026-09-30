import { $Enums, type Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { rotuloDoTipo, type PayloadDoAlerta } from '../helpers/alert-message.helper';

// A CENTRAL — o que o sino mostra.
//
// ═════════════════════════════════════════════════════════════════════════════
// A LISTAGEM FILTRA `asset.deletedAt` À MÃO, e a FK `Cascade` não substitui isso.
//
// `alerts.assetId` é `onDelete: Cascade`, o que resolve o `DELETE` FÍSICO — que
// nunca acontece com ativo: `deleteAsset` faz `UPDATE assets SET "deletedAt"`.
// O Postgres não vê `DELETE` nenhum, a cascata não dispara, e o alerta continua
// no sino falando de um ativo que está na lixeira. É o mesmo ponto cego do soft
// delete que o `deleteAsset` documenta, visto do outro lado.
//
// E `alerts` NÃO TEM `deletedAt`, então a extension também não a escopa — o
// filtro tem que ser escrito, e é este.
// ═════════════════════════════════════════════════════════════════════════════

const SELECT = {
  id: true,
  type: true,
  assetId: true,
  dueAt: true,
  payload: true,
  createdAt: true,
  readAt: true,
  notifiedAt: true,
  asset: { select: { id: true, assetTag: true, name: true } },
} as const;

/**
 * Alerta de ativo VIVO, ou alerta da frota (sem ativo).
 *
 * O `OR` com `assetId: null` é obrigatório: `asset: { deletedAt: null }` sozinho
 * descartaria os alertas da frota, que não têm ativo nenhum para satisfazer a
 * condição — e eles são justamente os que ninguém mais mostraria.
 */
const DE_ATIVO_VIVO: Prisma.AlertWhereInput = {
  OR: [{ assetId: null }, { asset: { deletedAt: null } }],
};

/**
 * O `payload` sai TIPADO, e é por isso que ele é substituído em vez de somado.
 *
 * O Prisma o devolve como `JsonValue` — que é honesto no banco e inútil na tela,
 * onde o campo tem forma conhecida (foi este código que o escreveu). O `Omit` é o
 * que permite trocar o tipo em vez de intersectá-lo: uma interseção de `JsonValue`
 * com `PayloadDoAlerta` não é atribuível em nenhuma das duas direções.
 */
export type AlertaNaResposta =
  Omit<Prisma.AlertGetPayload<{ select: typeof SELECT }>, 'payload'> & {
    rotulo: string;
    payload: PayloadDoAlerta | null;
  };

export interface CentralDeAlertas {
  /** Não lidos — o número do sino. */
  naoLidos: number;
  total: number;
  rows: AlertaNaResposta[];
  porTipo: { type: $Enums.AlertType; rotulo: string; naoLidos: number }[];
}

/** Quanto o sino carrega de uma vez. */
const TETO = 100;

export async function listAlerts(apenasNaoLidos = false): Promise<CentralDeAlertas> {
  const where: Prisma.AlertWhereInput = {
    ...DE_ATIVO_VIVO,
    ...(apenasNaoLidos ? { readAt: null } : {}),
  };

  const [linhas, naoLidos, total, agrupado] = await Promise.all([
    prisma.alert.findMany({
      where,
      select: SELECT,
      // Não lidos primeiro, e dentro deles o prazo mais apertado no topo: é a
      // ordem em que alguém agiria, não a ordem em que o job gravou.
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { dueAt: 'asc' }],
      take: TETO,
    }),
    prisma.alert.count({ where: { ...DE_ATIVO_VIVO, readAt: null } }),
    prisma.alert.count({ where: DE_ATIVO_VIVO }),
    prisma.alert.groupBy({
      by: ['type'],
      where: { ...DE_ATIVO_VIVO, readAt: null },
      _count: { _all: true },
    }),
  ]);

  return {
    naoLidos,
    total,
    rows: linhas.map((linha) => ({
      ...linha,
      rotulo: rotuloDoTipo(linha.type),
      payload: (linha.payload ?? null) as PayloadDoAlerta | null,
    })),
    porTipo: agrupado.map((grupo) => ({
      type: grupo.type,
      rotulo: rotuloDoTipo(grupo.type),
      naoLidos: grupo._count._all,
    })),
  };
}

/**
 * MARCA COMO LIDO — e "lido" não é "resolvido".
 *
 * O problema pode continuar: a garantia venceu de todo jeito. `readAt` diz que
 * alguém VIU, e é o que apaga o número do sino. Um campo `resolvedAt` seria outra
 * coisa e não cabe nesta fase: quem resolve a garantia vencida é uma compra, e o
 * sistema não sabe disso.
 */
export async function marcarAlertaComoLido(id: string): Promise<{ id: string; readAt: Date }> {
  const alerta = await prisma.alert.findUnique({ where: { id }, select: { id: true, readAt: true } });
  if (!alerta) throw new AppError('Alerta não encontrado.', 404);

  // Já lido: devolve o que já estava, sem reescrever. Duas abas abertas no sino
  // não devem fazer a data pular para a da segunda.
  if (alerta.readAt) return { id: alerta.id, readAt: alerta.readAt };

  const atualizado = await prisma.alert.update({
    where: { id },
    data: { readAt: new Date() },
    select: { id: true, readAt: true },
  });

  return { id: atualizado.id, readAt: atualizado.readAt! };
}

/**
 * Marca tudo que o sino mostra. O botão "limpar" de quem voltou das férias.
 *
 * `DE_ATIVO_VIVO` no `where`, e ele não é decorativo: sem ele a função marcava
 * também os alertas de ativo na LIXEIRA — que o sino esconde —, e devolvia um
 * `count` MAIOR que o `naoLidos` que a tela acabou de mostrar. "Limpar 7" com o
 * badge em 5 é a mesma família de erro dos indicadores truncados: o número é
 * plausível e não corresponde a nada que o usuário viu.
 *
 * O efeito de marcar o que está escondido também é errado por si: se o ativo for
 * restaurado da lixeira, os alertas dele voltam ao sino já lidos — por um clique
 * que nunca os mostrou.
 */
export async function marcarTodosComoLidos(): Promise<number> {
  const { count } = await prisma.alert.updateMany({
    where: { ...DE_ATIVO_VIVO, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
