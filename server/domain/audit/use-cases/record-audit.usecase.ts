import { $Enums, type Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { resolverResponsaveisEmLote } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { AUDIT_SELECT } from '../helpers/audit-select.helper';
import {
  calcularDivergencias, localDepois, type PosseParaConferencia,
} from '../helpers/audit-divergence.helper';
import type { RecordAuditData } from '../schemas/audit.schema';

/** O cliente da transação, sem os `$`. Mesmo alias do resto dos domínios. */
export type ClienteAuditoria = Omit<typeof prisma, `$${string}`>;

/**
 * Posse NEUTRA — nenhum alvo, nenhum posto vago.
 *
 * Usada em dois casos que não são o mesmo e chegam ao mesmo lugar: o ativo sem
 * `Assignment` aberta (não há posse para divergir de), e o caminho `AGENTE`, que
 * não observa posse nenhuma. Nos dois, as duas flags saem `false` por não haver o
 * que afirmar.
 */
export const POSSE_NAO_INFORMADA: PosseParaConferencia = {
  targetType: null,
  targetLocationId: null,
  postoVago: false,
};

/** A linha como o `AUDIT_SELECT` a devolve. */
export type LinhaDeAuditoria = Prisma.AuditGetPayload<{ select: typeof AUDIT_SELECT }>;

interface AtivoConferido {
  id: string;
  assetTag: string;
  locationId: string | null;
}

export interface EntradaDoRegistro {
  ativo: AtivoConferido;
  /**
   * A posse aberta do ativo — e SÓ o caminho `MANUAL` a manda.
   *
   * Opcional porque as duas divergências que ela alimenta são OBSERVAÇÕES, e o
   * agente não observa nada (D124): ver o bloco em
   * `registrarAuditoriaNaTransacao`.
   */
  posse?: PosseParaConferencia;
  result: $Enums.AuditResult;
  locationIdFound: string | null;
  notes: string | null;
  method: $Enums.AuditMethod;
  auditedById: string | null;
}

/**
 * O CONTEXTO DE POSSE de N ativos — uma consulta em lote, não uma por ativo.
 *
 * `targetLocationId` sai de `assignments` direto porque a Camada 3 não o expõe
 * (ela devolve o RÓTULO do alvo, para a tela); `postoVago` sai da Camada 3 porque
 * é ela quem o define. São duas leituras e uma definição de cada coisa — em vez
 * de recalcular "posto sem ocupante" aqui e ter duas versões da mesma frase.
 */
export async function lerContextoDaPosse(
  client: ClienteAuditoria,
  assetIds: string[],
): Promise<Map<string, PosseParaConferencia>> {
  const [abertas, resolvidas] = await Promise.all([
    client.assignment.findMany({
      where: { assetId: { in: assetIds }, checkinAt: null },
      select: { assetId: true, targetType: true, targetLocationId: true },
    }),
    resolverResponsaveisEmLote(client, assetIds),
  ]);

  const porAtivo = new Map(abertas.map((posse) => [posse.assetId, posse]));

  const contexto = new Map<string, PosseParaConferencia>();
  for (const assetId of assetIds) {
    const aberta = porAtivo.get(assetId);
    contexto.set(assetId, {
      targetType: aberta?.targetType ?? null,
      targetLocationId: aberta?.targetLocationId ?? null,
      postoVago: resolvidas.get(assetId)?.postoVago ?? false,
    });
  }

  return contexto;
}

/**
 * O resultado informado bate com o que foi informado junto?
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O SISTEMA RECUSA A INCOERÊNCIA EM VEZ DE REINTERPRETAR.
 *
 * "Achei em outro lugar, resultado OK" é uma contradição, e há duas formas de
 * lidar: corrigir em silêncio para `DIVERGENTE`, ou recusar. Corrigir é pior
 * justamente porque funciona — o registro fica certo, e quem mandou continua
 * achando que `OK` com local diferente significa alguma coisa. A recusa ensina
 * uma vez e nunca mais.
 *
 * `NAO_LOCALIZADO` com local encontrado é a mesma contradição do outro lado: se
 * foi achado, foi localizado.
 * ═════════════════════════════════════════════════════════════════════════════
 */
function assertResultadoCoerente(
  result: $Enums.AuditResult,
  mudouDeLugar: boolean,
  locationIdFound: string | null,
): void {
  if (result === $Enums.AuditResult.NAO_LOCALIZADO && locationIdFound !== null) {
    throw new AppError(
      'Resultado NAO_LOCALIZADO não aceita local encontrado: se o ativo foi achado, ele foi localizado.',
      422,
      { campo: 'locationIdFound' },
    );
  }

  if (result === $Enums.AuditResult.OK && mudouDeLugar) {
    throw new AppError(
      'O ativo foi achado em outro local: o resultado é DIVERGENTE, não OK.',
      422,
      { campo: 'result', esperado: $Enums.AuditResult.DIVERGENTE },
    );
  }
}

/**
 * REGISTRA UMA CONFERÊNCIA — o coração da etapa, e o que o D52 restringe.
 *
 * ESCREVE em duas colunas e SÓ nelas: `Asset.locationId` (onde está) e
 * `Asset.lastAuditAt` (quando foi conferido). NÃO TOCA `assignments` — nem para
 * mover, nem para encerrar. O auditor observa um fato físico; mover a posse
 * transferiria responsabilidade a partir de um palpite (D52), e empréstimo de uma
 * tarde é indistinguível de mudança de posto pela observação.
 *
 * `lastAuditAt` avança até em `NAO_LOCALIZADO`: a conferência ACONTECEU, e é isso
 * que a coluna responde. Não avançar faria o ativo desaparecido aparecer no
 * relatório de "nunca conferidos" para sempre, escondendo o problema real atrás
 * de um problema de dado.
 */
export async function registrarAuditoriaNaTransacao(
  tx: ClienteAuditoria,
  entrada: EntradaDoRegistro,
): Promise<LinhaDeAuditoria> {
  const { ativo, result, locationIdFound, notes, method, auditedById } = entrada;

  // ═══════════════════════════════════════════════════════════════════════════
  // AS DUAS DIVERGÊNCIAS SÃO OBSERVAÇÕES, E O AGENTE NÃO OBSERVA NADA (D124).
  //
  // A regra mora AQUI, e não em quem chama, porque quem chama é que erra: o
  // caminho do agente passava a posse lida do banco, `calcularDivergencias`
  // comparava `Asset.locationId` com o alvo da `Assignment`, e a linha diária
  // nascia afirmando `divergenciaDePosse` que NINGUÉM viu — derivada de estado de
  // cadastro, não de alguém tendo olhado a mesa. Era o D52 furado por dentro de um
  // job, que é o pior lugar para descobrir isso.
  //
  // O que o `AGENTE` afirma é uma coisa só: esta máquina respondeu e o número de
  // série dela é o que está no cadastro. Daí `result: OK`, `lastAuditAt` avança, e
  // as duas flags ficam em `false` — que é a verdade, não um padrão.
  // ═══════════════════════════════════════════════════════════════════════════
  const observadoPorPessoa = method === $Enums.AuditMethod.MANUAL;

  const divergencias = calcularDivergencias({
    localAtual: ativo.locationId,
    localEncontrado: locationIdFound,
    posse: observadoPorPessoa
      ? entrada.posse ?? POSSE_NAO_INFORMADA
      : POSSE_NAO_INFORMADA,
  });

  assertResultadoCoerente(result, divergencias.mudouDeLugar, locationIdFound);

  const auditedAt = new Date();

  await tx.asset.update({
    where: { id: ativo.id },
    data: {
      lastAuditAt: auditedAt,
      // `undefined` é "não mexe": conferência sem mudança de lugar não reescreve
      // a coluna nem suja a página no Postgres.
      locationId: divergencias.mudouDeLugar ? locationIdFound : undefined,
    },
  });

  const auditoria = await tx.audit.create({
    data: {
      assetId: ativo.id,
      auditedAt,
      result,
      method,
      // O ANTERIOR só é gravado quando houve mudança: preenchê-lo sempre faria
      // "de onde para onde" mentir na conferência que não moveu nada.
      locationIdBefore: divergencias.mudouDeLugar ? ativo.locationId : null,
      locationIdFound,
      divergenciaDePosse: divergencias.divergenciaDePosse,
      postoVago: divergencias.postoVago,
      notes,
      auditedById,
    },
    select: AUDIT_SELECT,
  });

  // SÓ A MANUAL VAI PARA A TRILHA (ver o comentário do `AUDIT` em
  // record-activity): a automática roda para toda máquina vinculada, todo dia, e
  // uma linha de log por ativo por dia afogaria o histórico inteiro.
  if (method === $Enums.AuditMethod.MANUAL) {
    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: ativo.id,
      action: 'AUDIT',
      changes: {
        result,
        locationIdBefore: auditoria.locationIdBefore,
        locationIdFound: auditoria.locationIdFound,
        divergenciaDePosse: auditoria.divergenciaDePosse,
        postoVago: auditoria.postoVago,
      },
    }, auditedById);
  }

  return auditoria;
}

/** O ativo existe e não está na lixeira. `findFirst` para a extension agir. */
export async function carregarAtivoConferido(
  client: ClienteAuditoria,
  assetId: string,
): Promise<AtivoConferido> {
  const ativo = await client.asset.findFirst({
    where: { id: assetId },
    select: { id: true, assetTag: true, locationId: true },
  });

  if (!ativo) throw new AppError('Ativo não encontrado.', 404);
  return ativo;
}

/** O local informado existe? 404 com o nome do que faltou, nunca P2003. */
async function assertLocalEncontrado(
  client: ClienteAuditoria,
  locationId: string | null,
): Promise<void> {
  if (!locationId) return;

  const local = await client.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!local) throw new AppError('Local encontrado não existe no cadastro.', 404);
}

/** A conferência de UM ativo — `POST /api/assets/:id/audit`. */
export async function recordAudit(
  assetId: string,
  data: RecordAuditData,
  actorId: string | null,
): Promise<LinhaDeAuditoria> {
  return prisma.$transaction(async (tx) => {
    const ativo = await carregarAtivoConferido(tx, assetId);
    await assertLocalEncontrado(tx, data.locationIdFound ?? null);

    const contexto = await lerContextoDaPosse(tx, [assetId]);

    return registrarAuditoriaNaTransacao(tx, {
      ativo,
      posse: contexto.get(assetId) ?? POSSE_NAO_INFORMADA,
      result: data.result,
      // `localDepois` não entra aqui: o que se GRAVA em `locationIdFound` é o que
      // o auditor informou, e nada mais. Preencher com o local atual quando ele
      // não informou nada inventaria uma observação que ninguém fez.
      locationIdFound: data.locationIdFound ?? null,
      notes: data.notes ?? null,
      method: $Enums.AuditMethod.MANUAL,
      auditedById: actorId,
    });
  });
}

// Exportado para o use-case do posto, que precisa da mesma conta antes de
// montar a resposta — sem reimplementar a regra.
export { localDepois };
