import type { CheckinInput, CheckoutInput } from '../../../domain/assignment/assignment.queries';
import type { AlvoDaPosse, PosseResolvida, Responsavel } from '../../../domain/shared/posse.types';

// Leitura da posse para a tela — funções puras, fora do JSX
// (docs/ARQUITETURA.md: "cálculo sai do JSX").
//
// O contrato está em docs/MODELO-POSSE.md: a responsabilidade é DERIVADA, pode
// ser de VÁRIAS pessoas (os ocupantes de um posto) e pode ser de NINGUÉM mesmo
// com o ativo entregue (posto sem ocupante aberto). As três coisas aparecem numa
// célula de tabela, e é isto que este arquivo resolve.

/** O que a listagem mostra quando não há nada a mostrar. */
export const TRACO = '—';

/**
 * "Laura (Manhã)" — o turno entre parênteses, quando existe.
 *
 * O turno sai do banco como texto livre ("Manhã", "12x36 A") e é mostrado
 * EXATAMENTE como foi digitado: normalizar a caixa aqui estragaria "12x36 A" e
 * reescreveria texto que é do usuário, não nosso.
 */
export function nomeComTurno(responsavel: Responsavel): string {
  return responsavel.shift ? `${responsavel.name} (${responsavel.shift})` : responsavel.name;
}

/** "Laura (Manhã), Ana (Tarde)" — a Mesa 1 inteira numa linha. */
export function formatarResponsaveis(responsaveis: readonly Responsavel[]): string {
  return responsaveis.map(nomeComTurno).join(', ');
}

export interface ResumoPosse {
  /** Há posse ABERTA: o botão da linha é devolver, não entregar. */
  entregue: boolean;
  /** "Laura (Manhã), Ana (Tarde)". Vazio quando ninguém responde. */
  responsaveis: string;
  quantos: number;
  /** Para quem a posse aponta: a pessoa, o posto ou a etiqueta do outro ativo. */
  alvo: string | null;
  /**
   * De onde a responsabilidade veio, quando NÃO veio direto da pessoa.
   *
   * No caso `USER` fica nulo de propósito: o alvo e o responsável são a mesma
   * pessoa, e repetir o nome embaixo dele não informa nada.
   */
  detalheAlvo: string | null;
  /**
   * Entregue a um posto que não tem ninguém: equipamento parado em mesa vazia.
   * É sinal operacional — candidato a voltar ao estoque —, não erro de dado.
   */
  postoVago: boolean;
}

/**
 * A célula "Responsável" de uma linha da listagem.
 *
 * Aceita `undefined` porque o campo `posse` é da F4: enquanto o backend não
 * sobe, a listagem simplesmente não traz o campo, e a coluna deve mostrar um
 * traço em vez de quebrar a tela inteira.
 */
export function resumoDaPosse(posse: PosseResolvida | null | undefined): ResumoPosse {
  const responsaveis = posse?.responsaveis ?? [];

  return {
    entregue: posse?.assignmentId != null,
    responsaveis: formatarResponsaveis(responsaveis),
    quantos: responsaveis.length,
    alvo: posse?.targetLabel ?? null,
    detalheAlvo: detalheDoAlvo(posse),
    postoVago: posse?.postoVago === true,
  };
}

/** "no posto Mesa 1", "preso a ETI-0004" — vazio quando o alvo é a pessoa. */
function detalheDoAlvo(posse: PosseResolvida | null | undefined): string | null {
  if (!posse?.targetLabel) return null;

  switch (posse.targetType) {
    case 'LOCATION':
      return `no posto ${posse.targetLabel}`;
    case 'ASSET':
      return `preso a ${posse.targetLabel}`;
    default:
      return null;
  }
}

/**
 * O texto do botão e do título da operação da linha.
 *
 * Entregar e devolver são a MESMA porta (o `CheckoutModal`), porque são a mesma
 * decisão vista dos dois lados — e porque um ativo entregue não pode ser
 * entregue de novo sem passar pela devolução.
 */
export function rotuloDaOperacao(posse: PosseResolvida | null | undefined): string {
  return posse?.assignmentId != null ? 'Devolver' : 'Entregar';
}

/**
 * Formulário de entrega → corpo de `POST /assets/:id/checkout`.
 *
 * Mora aqui, e não no `onSubmit` do modal, por dois motivos concretos:
 *
 * 1. das três FKs de alvo, UMA vale — a que corresponde à aba escolhida. Mandar
 *    as outras (mesmo vazias) seria mandar um alvo que o usuário não escolheu;
 * 2. campo vazio precisa virar AUSENTE, não `''`: uma data vazia chegaria ao
 *    servidor como string inválida em vez de "não informado".
 */
export function montarEntrega(valores: {
  targetType: AlvoDaPosse;
  alvoId: string;
  statusId: string;
  expectedCheckinAt: string;
  checkoutNotes: string;
}): CheckoutInput {
  const corpo: CheckoutInput = { targetType: valores.targetType };

  if (valores.targetType === 'USER') corpo.targetUserId = valores.alvoId;
  if (valores.targetType === 'ASSET') corpo.targetAssetId = valores.alvoId;
  if (valores.targetType === 'LOCATION') corpo.targetLocationId = valores.alvoId;

  if (valores.statusId) corpo.statusId = valores.statusId;
  if (valores.expectedCheckinAt) corpo.expectedCheckinAt = valores.expectedCheckinAt;
  if (valores.checkoutNotes.trim()) corpo.checkoutNotes = valores.checkoutNotes.trim();

  return corpo;
}

/** Formulário de devolução → corpo de `POST /assets/:id/checkin`. */
export function montarDevolucao(valores: { statusId: string; checkinNotes: string }): CheckinInput {
  const corpo: CheckinInput = {};

  if (valores.statusId) corpo.statusId = valores.statusId;
  if (valores.checkinNotes.trim()) corpo.checkinNotes = valores.checkinNotes.trim();

  return corpo;
}
