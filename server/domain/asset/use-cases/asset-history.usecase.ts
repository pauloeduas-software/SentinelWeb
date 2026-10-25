import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { listAssetAssignments } from '../../assignment/use-cases/list-asset-assignments.usecase';
import { rotuloDoAlvo } from '../../assignment/helpers/target-label.helper';
import type { AlvoPosse } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { semCusto } from '../helpers/asset-select.helper';
import { buscarEntregasDoAtivo } from '../../license/use-cases/list-target-checkouts.usecase';
import { eventosDaEntregaDeLicenca, type EventoDeLicenca } from '../../license/helpers/license-events.helper';

// A LINHA DO TEMPO DE UM ATIVO — a aba Histórico da tela de detalhe.
//
// NÃO nasce tabela `AssetLog` (D18, docs/historico/fase-02-ativos.md). O `ActivityLog` já
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
type FonteDoEvento = 'ATIVIDADE' | 'POSSE' | 'LICENCA';

/** O que um evento de posse acrescenta ao que o `ActivityLog` já diria. */
interface EventoDePosse {
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
  changes: Prisma.JsonValue | null;
  posse: EventoDePosse | null;
  licenca: EventoDeLicenca | null;
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

function ehObjeto(valor: Prisma.JsonValue | null): valor is Prisma.JsonObject {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * O diff como a sessão pode vê-lo: sem o custo para quem não é `ADMIN` (D77) —
 * a mesma regra da leitura do ativo, que não devolve a coluna.
 *
 * Devolve `undefined` quando a edição só mexeu no custo: o evento some inteiro,
 * porque "editado, sem campo nenhum" ainda contaria que o valor mudou.
 */
function diffVisivel(changes: Prisma.JsonValue | null, podeVerCusto: boolean) {
  if (podeVerCusto || !ehObjeto(changes)) return changes;
  const visivel = semCusto(changes);
  return Object.keys(visivel).length === 0 && Object.keys(changes).length > 0 ? undefined : visivel;
}

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
    changes: null,
    posse: { ...alvo, notes: assignment.checkoutNotes },
    licenca: null,
  };

  if (!assignment.checkinAt) return [entrega];

  return [
    {
      id: `posse:${assignment.id}:devolucao`,
      fonte: 'POSSE',
      action: 'CHECKIN',
      at: assignment.checkinAt,
      changes: null,
      posse: { ...alvo, notes: assignment.checkinNotes },
      licenca: null,
    },
    entrega,
  ];
}

/**
 * Tudo que aconteceu com um ativo, do mais recente para o mais antigo.
 *
 * Três fontes, uma lista: o `ActivityLog` (cadastro, edição com o diff campo a
 * campo, lixeira, restauração, baixa), `assignments` (entregas e devoluções,
 * com o nome de quem recebeu) e `license_checkouts` (as licenças entregues A
 * ESTA MÁQUINA — as da pessoa que responde por ela ficam no histórico dela).
 * As fontes são disjuntas: a entrega de licença não vai para o log — só existe
 * na tabela dela.
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
  podeVerCusto: boolean,
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
  const [assignments, entregasDeLicenca, logs, totalDeLogs] = await Promise.all([
    listAssetAssignments(assetId),
    buscarEntregasDoAtivo(assetId, { abertas: false }),
    prisma.activityLog.findMany({
      where,
      select: { id: true, action: true, changes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limite,
    }),
    prisma.activityLog.count({ where }),
  ]);

  const doLog: EventoDoAtivo[] = logs.flatMap((linha) => {
    const changes = diffVisivel(linha.changes, podeVerCusto);
    if (changes === undefined) return [];
    return [{
      id: `log:${linha.id}`,
      fonte: 'ATIVIDADE',
      action: linha.action,
      at: linha.createdAt,
      changes,
      posse: null,
      licenca: null,
    }];
  });

  const daPosse = assignments.flatMap(eventosDaPosse);
  const daLicenca: EventoDoAtivo[] = entregasDeLicenca.flatMap((entrega) => eventosDaEntregaDeLicenca(entrega)
    .map((evento) => ({ ...evento, fonte: 'LICENCA' as const, changes: null, posse: null })));

  const eventos = [...doLog, ...daPosse, ...daLicenca].sort((a, b) => b.at.getTime() - a.at.getTime());

  // O `total` desconta as edições só de custo que sumiram para quem não é
  // ADMIN: contadas, a tela diria "N de N+1" e entregaria que houve um evento
  // escondido. O desconto vale para a janela lida (as `limite` mais recentes),
  // que é onde a tela compara total e linhas.
  const escondidos = logs.length - doLog.length;
  return { total: totalDeLogs - escondidos + daPosse.length + daLicenca.length, rows: eventos.slice(0, limite) };
}
