import { $Enums, type Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ATIVO_NO_PARQUE } from '../../asset/helpers/asset-scope.helper';
import { ATIVO_DA_CONFERENCIA } from '../helpers/audit-select.helper';
import type { AuditLocationData } from '../schemas/audit.schema';
import {
  carregarAtivoConferido, lerContextoDaPosse, registrarAuditoriaNaTransacao,
  type ClienteAuditoria, type LinhaDeAuditoria,
} from './record-audit.usecase';

// AUDITAR POR POSTO — a forma prática de conferir localização no modelo novo.
//
// O POSTO É A UNIDADE DE TRABALHO; o registro continua sendo uma linha por ATIVO
// (D54). Alguém anda até a Mesa 1 uma vez e confere o que está lá; a pergunta
// *"quais ativos nunca foram auditados"* continua respondível porque cada ativo
// tem a sua linha.

type AtivoDaConferencia = Prisma.AssetGetPayload<{ select: typeof ATIVO_DA_CONFERENCIA }>;

export interface ItemDaConferencia {
  asset: AtivoDaConferencia;
  /** A `Assignment` aberta aponta para este posto: o ativo É deste posto. */
  daPosse: boolean;
  /** `Asset.locationId` é este posto: o ativo ESTÁ neste posto. */
  aqui: boolean;
}

export interface ConferenciaDoPosto {
  location: { id: string; name: string; isWorkstation: boolean };
  /** Ocupações ABERTAS do posto. Zero + ativo entregue ao posto = posto vago. */
  ocupantes: number;
  /**
   * O que É deste posto — a posse aberta aponta para cá.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * DUAS LISTAS, E A DIFERENÇA ENTRE ELAS *É* A DIVERGÊNCIA.
   *
   * Fundi-las numa só esconde exatamente o que a auditoria veio procurar:
   *
   *   está em `doPosto` e não em `noPosto` → sumiu da mesa
   *   está em `noPosto` e não em `doPosto` → é o mouse reserva da gaveta, caso
   *                                          LEGÍTIMO que a auditoria não deve
   *                                          transformar em posse (D52)
   *
   * Uma lista única com um selo "divergente" ao lado contaria a mesma coisa de
   * um jeito que ninguém lê: o segundo caso não é um problema, e apareceria
   * marcado como se fosse.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  doPosto: ItemDaConferencia[];
  /** O que ESTÁ neste posto — `locationId` é cá, seja de quem for. */
  noPosto: ItemDaConferencia[];
}

/** O posto existe? 404 antes de qualquer lista vazia enganosa. */
async function carregarPosto(client: ClienteAuditoria, locationId: string) {
  const local = await client.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, isWorkstation: true },
  });

  if (!local) throw new AppError('Localização não encontrada.', 404);
  return local;
}

// ATIVO FORA DO PARQUE NÃO ENTRA NA CONFERÊNCIA.
//
// Um notebook vendido em março não está na mesa e não deveria estar — cobrá-lo na
// conferência produziria um `NAO_LOCALIZADO` legítimo e inútil todo mês.
//
// O escopo é o `ATIVO_NO_PARQUE` do domínio do ativo, e IMPORTADO em vez de
// reescrito: a versão local daqui era só `retiredAt: null`, e a diferença tinha
// consequência — um ativo ARCHIVED entrava nas duas listas, era conferido, tinha
// `lastAuditAt` avançado e NUNCA aparecia no relatório de auditoria, que usa o
// escopo completo. Conferi-lo era trabalho que o relatório não via.

export async function lerConferenciaDoPosto(locationId: string): Promise<ConferenciaDoPosto> {
  const local = await carregarPosto(prisma, locationId);

  const [posses, presentes, ocupantes] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        targetType: $Enums.AssignmentTarget.LOCATION,
        targetLocationId: locationId,
        checkinAt: null,
        asset: ATIVO_NO_PARQUE,
      },
      select: { asset: { select: ATIVO_DA_CONFERENCIA } },
    }),
    prisma.asset.findMany({
      where: { locationId, ...ATIVO_NO_PARQUE },
      select: ATIVO_DA_CONFERENCIA,
      orderBy: { assetTag: 'asc' },
    }),
    prisma.locationOccupant.count({ where: { locationId, endedAt: null } }),
  ]);

  const dosQueSaoDaqui = posses.map((posse) => posse.asset);
  const idsDaqui = new Set(presentes.map((ativo) => ativo.id));
  const idsDaPosse = new Set(dosQueSaoDaqui.map((ativo) => ativo.id));

  return {
    location: local,
    ocupantes,
    doPosto: dosQueSaoDaqui
      .map((asset) => ({ asset, daPosse: true, aqui: idsDaqui.has(asset.id) }))
      .sort((a, b) => a.asset.assetTag.localeCompare(b.asset.assetTag)),
    noPosto: presentes.map((asset) => ({ asset, daPosse: idsDaPosse.has(asset.id), aqui: true })),
  };
}

export interface ResultadoDaConferencia {
  /** Uma linha de `Audit` por ativo (D54). */
  auditorias: LinhaDeAuditoria[];
  divergentes: number;
  naoLocalizados: number;
}

/**
 * CONFERE O POSTO — N ativos, UMA transação.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O RESULTADO DE CADA ATIVO É DEDUZIDO, NÃO RECEBIDO.
 *
 * A tela manda dois conjuntos de ids — quem estava lá e quem não apareceu —,
 * porque é isso que alguém sabe depois de andar até a mesa. Traduzir para
 * `OK`/`DIVERGENTE` é trabalho do servidor: a diferença entre os dois depende de
 * onde o ativo ESTAVA, que a tela não tem obrigação de saber e que muda enquanto
 * a conferência acontece.
 *
 * Achado aqui e já era daqui  → `OK`
 * Achado aqui e estava noutro → `DIVERGENTE`, e `locationId` passa a ser este
 * Não apareceu                → `NAO_LOCALIZADO`, e nada se move
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * TUDO OU NADA: uma transação para a conferência de vinte ativos não deixar dez
 * gravados e dez não — metade de uma conferência é pior que nenhuma, porque o
 * relatório de "nunca auditados" passaria a mentir para os dez que faltaram.
 */
export async function auditarPosto(
  locationId: string,
  data: AuditLocationData,
  actorId: string | null,
): Promise<ResultadoDaConferencia> {
  return prisma.$transaction(async (tx) => {
    await carregarPosto(tx, locationId);

    // ── DEDUPLICADO, e o `Set` não é defensivismo ──────────────────────────
    //
    // O schema recusa o mesmo ativo nas DUAS listas (é contradição: ele estava na
    // mesa ou não estava). O que ele não pega é o id repetido DENTRO de uma —
    // `encontrados: [X, X]`, que uma tela com dois cliques no mesmo cartão ou um
    // retry de rede produz sem esforço.
    //
    // Sem o `Set`, o laço abaixo grava DUAS linhas de `Audit` e duas de
    // `ActivityLog` para o mesmo ativo na mesma transação — e a segunda nasce
    // dizendo que o ativo veio do lugar onde a primeira acabou de o colocar.
    const ids = [...new Set([...data.encontrados, ...data.naoLocalizados])];
    const contexto = await lerContextoDaPosse(tx, ids);

    const auditorias: LinhaDeAuditoria[] = [];
    let divergentes = 0;

    for (const assetId of ids) {
      const ativo = await carregarAtivoConferido(tx, assetId);
      const encontrado = data.encontrados.includes(assetId);

      // Estava em outro lugar? Então a conferência move o ativo para cá e o
      // resultado é DIVERGENTE. `locationIdFound` só vai preenchido nesse caso:
      // "achei onde já estava" não é uma observação nova.
      const mudou = encontrado && ativo.locationId !== locationId;
      const result = !encontrado
        ? $Enums.AuditResult.NAO_LOCALIZADO
        : mudou
          ? $Enums.AuditResult.DIVERGENTE
          : $Enums.AuditResult.OK;

      if (mudou) divergentes += 1;

      auditorias.push(await registrarAuditoriaNaTransacao(tx, {
        ativo,
        posse: contexto.get(assetId) ?? { targetType: null, targetLocationId: null, postoVago: false },
        result,
        locationIdFound: mudou ? locationId : null,
        notes: data.notes ?? null,
        method: $Enums.AuditMethod.MANUAL,
        auditedById: actorId,
      }));
    }

    return { auditorias, divergentes, naoLocalizados: data.naoLocalizados.length };
  }, {
    // A conferência de um posto inteiro é mais longa que uma escrita comum: são
    // N atualizações de ativo, N inserções e N linhas de log. O teto padrão de 5 s
    // do Prisma derrubaria uma conferência grande no meio — e ela é tudo ou nada.
    timeout: 30_000,
  });
}
