// AS BORDAS DE DATA DE TODO RELATÓRIO DE PRAZO.
//
// O RECORTE DO PARQUE (o D127) mudou de casa: ele é `ATIVO_NO_PARQUE`, em
// `asset/helpers/asset-scope.helper.ts`, porque a pergunta é do ATIVO — são as
// colunas dele — e porque a auditoria tinha escrito uma segunda versão, mais
// frouxa. Duas respostas para a mesma pergunta é o D16 numa constante.
//
// O QUE FICA DE FORA DO RECORTE, de propósito: o relatório de DEPRECIAÇÃO inclui
// o descomissionado do ano corrente? NÃO — valor contábil de equipamento que saiu
// do patrimônio não é patrimônio. Quem precisa do histórico contábil de um ativo
// vendido abre o ativo, que continua existindo.

export { ATIVO_NO_PARQUE } from '../../asset/helpers/asset-scope.helper';

/** Hoje à meia-noite UTC — a borda de "vence em N dias". */
export function hojeUTC(agora: Date = new Date()): Date {
  const hoje = new Date(agora.getTime());
  hoje.setUTCHours(0, 0, 0, 0);
  return hoje;
}

/** Daqui a N dias, à meia-noite UTC. O teto de "a vencer". */
export function emDiasUTC(dias: number, agora: Date = new Date()): Date {
  const limite = hojeUTC(agora);
  limite.setUTCDate(limite.getUTCDate() + dias);
  return limite;
}

/**
 * N dias ATRÁS, à meia-noite UTC — o piso de "a vencer".
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * A JANELA DE UM PRAZO É SIMÉTRICA, E O PISO NÃO É ZELO.
 *
 * "Garantia vencendo nos próximos 30 dias" sem piso nenhum no passado inclui toda
 * garantia que JÁ venceu. Com `take` na consulta e ordenação crescente, as vagas
 * são preenchidas pelas mais ANTIGAS — e um parque com cinco anos de histórico
 * mostra uma lista de "a vencer" em que nada vence: o que o relatório existe para
 * responder fica de fora, em silêncio.
 *
 * O job de alertas já nascera assim (`janelaDoPrazo`, em run-daily-alerts). O
 * relatório passou a usar a mesma janela, e por isso ela mora aqui — o limiar é o
 * mesmo, e dois pisos diferentes para o mesmo prazo fariam a tela e o sino
 * discordarem sobre o que está vencendo.
 *
 * O passado INTEIRO continua respondível: é a aba de auditorias e o filtro da
 * listagem de ativos que respondem "quantas já venceram", com o total contado —
 * não uma lista truncada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function haDiasUTC(dias: number, agora: Date = new Date()): Date {
  const piso = hojeUTC(agora);
  piso.setUTCDate(piso.getUTCDate() - dias);
  return piso;
}

/**
 * O CORTE DA AUDITORIA: antes desta data, o ativo está vencido.
 *
 * Calculado na aplicação a cada consulta, a partir de `auditIntervalMonths` —
 * nunca gravado numa coluna `nextAuditAt` (D53). No dia em que alguém trocar 12
 * meses por 6, esta conta já responde diferente; uma coluna precisaria de um
 * UPDATE em massa que ninguém vai lembrar de rodar.
 */
export function corteDaAuditoria(intervaloEmMeses: number, agora: Date = new Date()): Date {
  const corte = hojeUTC(agora);
  corte.setUTCMonth(corte.getUTCMonth() - intervaloEmMeses);
  return corte;
}
