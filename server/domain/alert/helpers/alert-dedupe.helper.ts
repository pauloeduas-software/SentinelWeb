import { $Enums } from '@prisma/client';

// A IDENTIDADE DE UM ALERTA — o D125, e é função pura.
//
// ═════════════════════════════════════════════════════════════════════════════
// UMA REGRA POR TIPO, E NÃO UMA FÓRMULA PARA OS QUATRO.
//
// A primeira versão do plano da fase dizia `${type}:${assetId}:${dueAt}` para
// todos. Ela falha em dois dos quatro casos, e falha para o lado ruim — o de
// repetir o mesmo aviso todo dia:
//
//   AUDITORIA_VENCIDA de ativo NUNCA conferido não tem `dueAt`. `lastAuditAt` é
//   nulo, e a única data à mão é a DO CORTE — que anda todo dia. A chave mudaria
//   diariamente e o alerta nasceria de novo diariamente, que é exatamente o que
//   o dedupe existe para impedir.
//
//   MANUTENCAO_EM_ABERTO não tem data-alvo: `completionDate` é nulo *por ela
//   estar aberta*. E a chave tem que ser da MANUTENÇÃO, não do ativo — um ativo
//   com duas manutenções abertas tem dois problemas, e uma chave por ativo
//   colapsaria os dois num aviso só, escondendo o segundo para sempre.
// ═════════════════════════════════════════════════════════════════════════════

/** Dia de calendário em `AAAA-MM-DD`, que é a granularidade de todo prazo aqui. */
function dia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * `assetId` é nulável no schema (alerta DA FROTA), e `null` interpolado numa
 * string viraria a palavra "null" — que funciona por acidente. `frota` é
 * explícito, e é legível no banco por quem estiver investigando.
 */
function alvo(assetId: string | null): string {
  return assetId ?? 'frota';
}

/** Garantia vencendo: a data do vencimento é estável — um alerta por prazo. */
export function chaveDeGarantia(assetId: string, vence: Date): string {
  return `${$Enums.AlertType.GARANTIA_VENCENDO}:${alvo(assetId)}:${dia(vence)}`;
}

/** Fim de vida: idem. Trocar `eolDate` à mão gera um alerta novo, e deve. */
export function chaveDeEol(assetId: string, vence: Date): string {
  return `${$Enums.AlertType.EOL_PROXIMO}:${alvo(assetId)}:${dia(vence)}`;
}

/**
 * Auditoria vencida: a chave carrega a ÚLTIMA conferência, não o corte.
 *
 * `nunca` para quem nunca foi conferido — um alerta, uma vez, até alguém
 * conferir. E quando conferirem, a chave muda **porque o fato mudou**: se
 * vencer de novo em doze meses, o alerta é outro e nasce de novo. É a
 * propriedade que a data do corte não tem.
 */
export function chaveDeAuditoria(assetId: string, lastAuditAt: Date | null): string {
  return `${$Enums.AlertType.AUDITORIA_VENCIDA}:${alvo(assetId)}:${lastAuditAt ? dia(lastAuditAt) : 'nunca'}`;
}

/** Manutenção em aberto: a chave é da MANUTENÇÃO, com a data de abertura. */
export function chaveDeManutencao(maintenanceId: string, startDate: Date): string {
  return `${$Enums.AlertType.MANUTENCAO_EM_ABERTO}:${maintenanceId}:${dia(startDate)}`;
}
