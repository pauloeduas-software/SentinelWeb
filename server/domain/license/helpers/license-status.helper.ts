// O STATUS DA LICENÇA — derivado, nunca coluna (D44).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE NÃO UMA COLUNA `status`
//
// O status muda PELA PASSAGEM DO TEMPO, sem ninguém escrever nada. Uma licença
// que vence amanhã está ATIVA hoje e EXPIRADA depois de amanhã, e entre os dois
// instantes não houve requisição nenhuma.
//
// Uma coluna exigiria um job diário para continuar verdadeira — e no dia em que
// o job falhasse, o inventário mentiria SEM SINTOMA: a tela mostraria "ATIVA"
// para uma licença vencida, e nada na aplicação discordaria, porque a coluna
// *é* a resposta.
//
// É o D16 aplicado ao tempo em vez de à posse, e o mesmo argumento do D34
// aplicado à contagem. Função pura sobre duas datas e o dia de hoje: não pode
// divergir de nada, porque não guarda nada.
// ═════════════════════════════════════════════════════════════════════════════

import { hojeNoBrasil, somarDias } from '../../shared/hoje.helper';

export type LicenseStatus = 'ATIVA' | 'VENCENDO' | 'EXPIRADA' | 'ENCERRADA';

/**
 * A janela do aviso de vencimento, em dias.
 *
 * 30 é o prazo em que dá para fazer alguma coisa: pedir orçamento, aprovar
 * compra, renovar. Um aviso de 7 dias chega junto com o problema; um de 90
 * some no meio da lista e ninguém age.
 */
export const DIAS_DE_AVISO = 30;

interface DatasDaLicenca {
  expirationDate: Date | null;
  terminationDate: Date | null;
}

/**
 * ENCERRADA vence tudo, e essa ordem é a regra.
 *
 * Um contrato rescindido não fica "vencendo": ele acabou por decisão, não por
 * calendário — e a licença cujo `terminationDate` está preenchido mas cujo
 * `expirationDate` ainda é futuro é exatamente o caso que uma ordem errada
 * mostraria como ATIVA. Os dois campos existem separados porque respondem a
 * perguntas diferentes: *"até quando eu posso usar"* e *"até quando eu paguei"*.
 *
 * A comparação é contra o DIA DE HOJE EM BRASÍLIA (`hojeNoBrasil`), no mesmo
 * formato em que o `dataOpcional` grava a data — `expirationDate` é dia de
 * calendário, não instante. Comparar com `new Date()` faria uma licença que
 * vence hoje virar EXPIRADA às 00:00:01, e com a meia-noite UTC, às 21h.
 *
 * O ENCERRAMENTO NO PRÓPRIO DIA JÁ ENCERRA (`<=`), e o vencimento no próprio dia
 * ainda vale (`<`). A diferença é de propósito: o botão Encerrar grava o dia de
 * hoje e a licença tem que sair da lista na hora; o vencimento é até quando o
 * contrato foi pago, e o dia pago ainda é dia de uso.
 */
export function statusDaLicenca(datas: DatasDaLicenca, hoje = hojeNoBrasil()): LicenseStatus {
  if (datas.terminationDate && datas.terminationDate <= hoje) return 'ENCERRADA';
  if (!datas.expirationDate) return 'ATIVA';

  if (datas.expirationDate < hoje) return 'EXPIRADA';

  return datas.expirationDate <= somarDias(hoje, DIAS_DE_AVISO) ? 'VENCENDO' : 'ATIVA';
}

/**
 * Quantos dias faltam para vencer. Negativo = já venceu há tantos dias.
 *
 * Sai na resposta ao lado do status porque "VENCENDO" sozinho não diz se é
 * para agir hoje ou no mês que vem — e a tela não pode recalcular, porque o
 * "hoje" do navegador pode não ser o do servidor.
 */
export function diasParaVencer(expirationDate: Date | null, hoje = hojeNoBrasil()): number | null {
  if (!expirationDate) return null;
  const DIA = 24 * 60 * 60 * 1000;
  return Math.round((expirationDate.getTime() - hoje.getTime()) / DIA);
}
