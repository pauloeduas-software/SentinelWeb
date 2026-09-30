import { prisma } from '../../../core/database/prismaClient';
import {
  chavesIgnoradas, lerConfiguracaoDaDescoberta, type ConfiguracaoDaDescoberta,
} from '../helpers/discovery-settings.helper';
import { proporSugestao } from './upsert-suggestion.usecase';
import { recorrentes, resumirObservacoes, type PresencaObservada } from './summarize-observations.usecase';

// ═════════════════════════════════════════════════════════════════════════════
// O USUÁRIO LOGADO SUGERE **POSSE OU OCUPAÇÃO** — o D47, e o item desta fase que
// só existe porque o modelo de posse existe.
//
// A observação é sempre a mesma: a pessoa U está logada na máquina E, que é o
// ativo A. O que ela SIGNIFICA depende de para quem A está entregue:
//
//   A sem posse aberta        → sugere CHECKOUT de A para U     (o caso do Snipe-IT)
//   A entregue a U            → nada: o cadastro já bate
//   A entregue a outra pessoa → sugere REATRIBUIÇÃO
//   A entregue a um POSTO     → U não é dono de A. Sugere OCUPAÇÃO do posto  ← o novo
//   A entregue a outro ATIVO  → ignora: quem responde é o hospedeiro
//
// POR QUE O RAMO DO POSTO É O QUE IMPORTA: a sugestão errada aqui DESFAZ
// CADASTRO CERTO. Se o desktop da Mesa 1 está corretamente entregue ao posto e o
// sistema sugere "atribuir para a Ana", aceitar isso fecha a posse do posto e
// transforma um ativo compartilhado em ativo pessoal — perdendo a Laura, o turno
// dela e a responsabilidade solidária. O operador clica em "aceitar" achando que
// está corrigindo o inventário, e está degradando o modelo.
//
// É por isso que a sugestão de CHECKOUT não é apenas escondida quando a posse é
// do posto: ela NÃO É GERADA.
// ═════════════════════════════════════════════════════════════════════════════

const SELECT_POSSE_ABERTA = {
  id: true,
  targetType: true,
  targetUserId: true,
  targetLocationId: true,
} as const;

function evidenciaDaPresenca(presenca: PresencaObservada, extra: Record<string, unknown> = {}) {
  return {
    conta: presenca.userKey,
    dias: presenca.dias,
    amostras: presenca.amostras,
    horas: presenca.horas,
    primeiroDia: presenca.primeiroDia.toISOString().slice(0, 10),
    ultimoDia: presenca.ultimoDia.toISOString().slice(0, 10),
    ...extra,
  };
}

/**
 * Propõe posse ou ocupação para UMA máquina vinculada.
 *
 * Devolve quantas sugestões nasceram — o job soma e loga.
 *
 * **Com duas ou mais pessoas recorrentes, este use-case não faz nada**: o caso
 * é de posto compartilhado e quem responde é o `detect-shared-post` (D48).
 * Sugerir a posse para a mais frequente seria escolher um vencedor entre Laura e
 * Ana, que é exatamente o comportamento que a fase existe para não ter.
 */
export async function sugerirPosseOuOcupacao(
  endpointId: string,
  /**
   * A configuração da RODADA. O job a lê uma vez e passa adiante: o
   * `lerConfiguracao` faz `upsert`, então uma chamada por endpoint era uma
   * ESCRITA por endpoint na linha única do singleton, de hora em hora.
   */
  configuracaoDaRodada?: ConfiguracaoDaDescoberta,
): Promise<number> {
  const endpoint = await prisma.endpoint.findUnique({
    where: { id: endpointId },
    select: { id: true, hostname: true, assetId: true, mergedIntoId: true },
  });
  // Sem vínculo não há ativo sobre o qual falar: a máquina ainda é Shadow IT, e
  // a conversa é outra (vincular primeiro).
  if (!endpoint?.assetId || endpoint.mergedIntoId) return 0;

  const configuracao = configuracaoDaRodada ?? (await lerConfiguracaoDaDescoberta());
  const presencas = recorrentes(await resumirObservacoes(endpointId, chavesIgnoradas(configuracao), configuracao.timezone));

  if (presencas.length === 0) return 0;
  if (presencas.length > 1) return 0;

  const presenca = presencas[0];
  // Conta que não casou com ninguém: a linha existe (é ela que denuncia a conta
  // de serviço), mas não dá para sugerir posse para uma pessoa desconhecida.
  if (!presenca.userId) return 0;

  const posse = await prisma.assignment.findFirst({
    where: { assetId: endpoint.assetId, checkinAt: null },
    select: SELECT_POSSE_ABERTA,
  });

  // ── O ativo é de OUTRO ATIVO: quem responde é o hospedeiro ────────────────
  if (posse?.targetType === 'ASSET') return 0;

  // ── O ativo é do POSTO: a pessoa é OCUPANTE, não dona ─────────────────────
  if (posse?.targetType === 'LOCATION' && posse.targetLocationId) {
    const jaOcupa = await prisma.locationOccupant.findFirst({
      where: { locationId: posse.targetLocationId, userId: presenca.userId, endedAt: null },
      select: { id: true },
    });
    if (jaOcupa) return 0;

    await proporSugestao({
      kind: 'OCCUPANCY',
      endpointId,
      assetId: endpoint.assetId,
      targetUserId: presenca.userId,
      targetLocationId: posse.targetLocationId,
      score: 85,
      shift: presenca.turnoSugerido,
      evidence: evidenciaDaPresenca(presenca, {
        motivo: 'O ativo está entregue a um posto, e esta pessoa usa a máquina com recorrência.',
        turnoInferido: presenca.turnoSugerido,
        hostname: endpoint.hostname,
      }),
      // A AFIRMAÇÃO: "esta conta, que é esta pessoa, ocupa este posto". Os dias,
      // as amostras e as horas ficam na evidência e FORA daqui — eles crescem
      // sozinhos, e o hash tem que sobreviver ao calendário (D109). O turno
      // também fica fora: é palpite que uma pessoa corrige.
      afirmacao: { conta: presenca.userKey, userId: presenca.userId, locationId: posse.targetLocationId },
    });
    return 1;
  }

  // ── O ativo já é da pessoa: o cadastro bate, nada a sugerir ───────────────
  if (posse?.targetType === 'USER' && posse.targetUserId === presenca.userId) return 0;

  // ── Sem posse, ou com posse de OUTRA pessoa: CHECKOUT ─────────────────────
  const reatribuicao = posse?.targetType === 'USER';

  await proporSugestao({
    kind: 'CHECKOUT',
    endpointId,
    assetId: endpoint.assetId,
    targetUserId: presenca.userId,
    score: reatribuicao ? 70 : 85,
    evidence: evidenciaDaPresenca(presenca, {
      motivo: reatribuicao
        ? 'O ativo está entregue a outra pessoa, e quem usa a máquina com recorrência é esta.'
        : 'O ativo não está entregue a ninguém, e esta pessoa usa a máquina com recorrência.',
      reatribuicao,
      hostname: endpoint.hostname,
    }),
    // "Entregar este ativo a esta pessoa" é a mesma afirmação no terceiro e no
    // trigésimo dia de presença. `reatribuicao` entra porque muda a frase: tirar
    // de alguém para dar a outro é uma proposta diferente de entregar o que não
    // está com ninguém, e quem recusou uma não recusou a outra.
    afirmacao: { conta: presenca.userKey, userId: presenca.userId, reatribuicao },
  });
  return 1;
}
