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

export const LICENSE_STATUS = ['ATIVA', 'VENCENDO', 'EXPIRADA', 'ENCERRADA'] as const;
export type LicenseStatus = (typeof LICENSE_STATUS)[number];

/**
 * A janela do aviso de vencimento, em dias.
 *
 * 30 é o prazo em que dá para fazer alguma coisa: pedir orçamento, aprovar
 * compra, renovar. Um aviso de 7 dias chega junto com o problema; um de 90
 * some no meio da lista e ninguém age.
 */
export const DIAS_DE_AVISO = 30;

export interface DatasDaLicenca {
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
 * A comparação é contra MEIA-NOITE UTC de hoje, a mesma referência que o
 * `dataOpcional` usa para construir a data — `expirationDate` é dia de
 * calendário, não instante, e comparar contra `new Date()` faria uma licença
 * que vence hoje virar EXPIRADA às 00:00:01.
 */
export function statusDaLicenca(datas: DatasDaLicenca, hoje = meiaNoiteUTC()): LicenseStatus {
  if (datas.terminationDate && datas.terminationDate <= hoje) return 'ENCERRADA';
  if (!datas.expirationDate) return 'ATIVA';

  if (datas.expirationDate < hoje) return 'EXPIRADA';

  const aviso = new Date(hoje);
  aviso.setUTCDate(aviso.getUTCDate() + DIAS_DE_AVISO);
  return datas.expirationDate <= aviso ? 'VENCENDO' : 'ATIVA';
}

/**
 * Quantos dias faltam para vencer. Negativo = já venceu há tantos dias.
 *
 * Sai na resposta ao lado do status porque "VENCENDO" sozinho não diz se é
 * para agir hoje ou no mês que vem — e a tela não pode recalcular, porque o
 * "hoje" do navegador pode não ser o do servidor.
 */
export function diasParaVencer(expirationDate: Date | null, hoje = meiaNoiteUTC()): number | null {
  if (!expirationDate) return null;
  const DIA = 24 * 60 * 60 * 1000;
  return Math.round((expirationDate.getTime() - hoje.getTime()) / DIA);
}

/** Meia-noite UTC de hoje — a mesma referência do `shared/fields.schema.ts`. */
export function meiaNoiteUTC(): Date {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  return hoje;
}
