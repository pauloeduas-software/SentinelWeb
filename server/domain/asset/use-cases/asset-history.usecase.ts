import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { listAssetAssignments } from '../../assignment/use-cases/list-asset-assignments.usecase';
import { rotuloDoAlvo } from '../../assignment/helpers/target-label.helper';
import type { AlvoPosse } from '../../assignment/use-cases/resolve-responsibles.usecase';

// A LINHA DO TEMPO DE UM ATIVO — a aba Histórico da tela de detalhe.
//
// NÃO nasce tabela `AssetLog` (D18, docs/FASE-2-PLANO-ITAM.md). O `ActivityLog` já
// grava o diff em `changes` NA MESMA TRANSAÇÃO da operação, que é a garantia
// que uma segunda tabela teria de reconstruir — e com as duas, "por que o
// histórico não bate com a auditoria?" passa a ser uma pergunta possível. O que
// faltava era rota de leitura, e é isto aqui.
//
// O índice `@@index([entityType, entityId, createdAt])` do `ActivityLog` é
// exatamente esta consulta.

/**
 * De onde o evento veio. A tela usa para escolher o ícone e o que mostrar —
 * um diff de campos não se lê como uma entrega.
 */
export type FonteDoEvento = 'ATIVIDADE' | 'POSSE';

/** O que um evento de posse acrescenta ao que o `ActivityLog` já diria. */
export interface EventoDePosse {
  assignmentId: string;
  targetType: AlvoPosse;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell Latitude". */
  targetLabel: string | null;
  /** As observações da entrega ou da devolução, conforme o evento. */
  notes: string | null;
  expectedCheckinAt: Date | null;
}

export interface EventoDoAtivo {
  /**
   * Chave ESTÁVEL para a tela, com prefixo da fonte: os dois lados têm uuid
   * próprio e uma assignment rende DOIS eventos (a entrega e a devolução), que
   * colidiriam se a chave fosse só o id da linha.
   */
  id: string;
  fonte: FonteDoEvento;
  action: string;
  at: Date;
  actorId: string | null;
  changes: Prisma.JsonValue | null;
  posse: EventoDePosse | null;
}

/** Quanto a tela recebe quando não pede nada. O TETO é do schema, na borda. */
const LIMITE_PADRAO = 100;

/**
 * CHECKOUT e CHECKIN saem do `ActivityLog` desta leitura — e continuam sendo
 * gravados lá.
 *
 * Os mesmos dois eventos chegam pelo outro lado, vindos de `assignments`, com
 * o que o log não tem: o NOME de quem recebeu (o log guarda só o id), as
 * observações da entrega e a data prevista de devolução. Mostrar as duas fontes
 * seria contar a mesma entrega duas vezes, a segunda pior.
 *
 * O log permanece a prova: ele é quem fica se a linha de posse for para o
 * `Cascade` de um `DELETE` físico do ativo.
 */
const POSSE_VEM_DA_TABELA_DE_POSSE = ['CHECKOUT', 'CHECKIN'];

/** Uma posse vira UM ou DOIS eventos: a entrega sempre, a devolução se houve. */
function eventosDaPosse(assignment: Awaited<ReturnType<typeof listAssetAssignments>>[number]): EventoDoAtivo[] {
  const alvo = {
    assignmentId: assignment.id,
    targetType: assignment.targetType,
    targetLabel: rotuloDoAlvo(assignment),
    expectedCheckinAt: assignment.expectedCheckinAt,
  };

  const entrega: EventoDoAtivo = {
    id: `posse:${assignment.id}:entrega`,
    fonte: 'POSSE',
    action: 'CHECKOUT',
    at: assignment.checkoutAt,
    // Quem operou só existe a partir da F3 (mesmo caso do `ActivityLog.actorId`).
    actorId: null,
    changes: null,
    posse: { ...alvo, notes: assignment.checkoutNotes },
  };

  if (!assignment.checkinAt) return [entrega];

  return [
    {
      id: `posse:${assignment.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: assignment.checkinAt,
      actorId: null,
      changes: null,
      posse: { ...alvo, notes: assignment.checkinNotes },
    },
    entrega,
  ];
}

/**
 * Tudo que aconteceu com um ativo, do mais recente para o mais antigo.
 *
 * Duas fontes, uma lista: o `ActivityLog` (cadastro, edição com o diff campo a
 * campo, lixeira, restauração, descomissionamento) e `assignments` (entregas e
 * devoluções, com o nome de quem recebeu).
 *
 * O envelope é o `{ total, rows }` de toda listagem, mas `total` aqui conta os
 * eventos das DUAS fontes: é ele que diz à tela que existe história além do
 * teto — sem ele, uma lista cortada em 100 é indistinguível de um ativo com
 * exatamente 100 eventos.
 *
 * Buscar o topo de cada fonte e cortar depois do merge devolve o topo REAL: um
 * log que ficou fora da janela de 100 é, por construção, mais antigo que os 100
 * que entraram, e nenhum merge o traria de volta para dentro.
 */
export async function getAssetHistory(
  assetId: string,
  limite = LIMITE_PADRAO,
): Promise<ListEnvelope<EventoDoAtivo>> {
  const where = {
    entityType: 'Asset',
    entityId: assetId,
    action: { notIn: POSSE_VEM_DA_TABELA_DE_POSSE },
  };

  // `listAssetAssignments` é quem confere se o ativo existe (404) — o mesmo
  // 404 da tela de detalhe, escrito uma vez só. Importado do domínio de posse,
  // nunca recopiado: a leitura da posse é de lá.
  const [assignments, logs, totalDeLogs] = await Promise.all([
    listAssetAssignments(assetId),
    prisma.activityLog.findMany({
      where,
      select: { id: true, action: true, changes: true, actorId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limite,
    }),
    prisma.activityLog.count({ where }),
  ]);

  const doLog: EventoDoAtivo[] = logs.map((linha) => ({
    id: `log:${linha.id}`,
    fonte: 'ATIVIDADE',
    action: linha.action,
    at: linha.createdAt,
    actorId: linha.actorId,
    changes: linha.changes,
    posse: null,
  }));

  const daPosse = assignments.flatMap(eventosDaPosse);

  const eventos = [...doLog, ...daPosse].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { total: totalDeLogs + daPosse.length, rows: eventos.slice(0, limite) };
}
