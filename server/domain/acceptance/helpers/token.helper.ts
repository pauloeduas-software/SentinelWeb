import crypto from 'crypto';

// O TOKEN DA URL PÚBLICA `/aceite/:token`.
//
// Esta é a ÚNICA rota do sistema, além do login e do hub do agente, que
// dispensa sessão — então o token é a credencial inteira, e ele precisa
// aguentar ser a única coisa entre um estranho e um documento com o nome, o
// e-mail e o equipamento de um colaborador.
//
// 32 bytes de `randomBytes` = 256 bits. Não é `randomUUID` (122 bits de
// entropia e formato conhecido) nem `Math.random` (previsível por construção).
//
// `base64url` e não `hex`: mesma entropia em 43 caracteres em vez de 64, e sem
// `+`, `/` ou `=` — os três quebram quando o token viaja em URL, que é
// exatamente para onde ele vai.

const BYTES = 32;

/** Quanto tempo o link vale. Termo não assinado em 30 dias virou pendência. */
const VALIDADE_DIAS = 30;

export function gerarToken(): string {
  return crypto.randomBytes(BYTES).toString('base64url');
}

export function validadePadrao(): Date {
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + VALIDADE_DIAS);
  return prazo;
}

/**
 * O token expirou?
 *
 * EXPIRADO NÃO É RECUSADO. São estados diferentes: `declinedAt` é a pessoa
 * dizendo "não aceito"; `expiresAt` vencido é o prazo do link acabando. O
 * primeiro é uma decisão que precisa aparecer no relatório; o segundo é
 * operacional e se resolve reemitindo. Confundir os dois faria o relatório de
 * não aceitos esvaziar sozinho com o tempo.
 */
export function expirou(acceptance: { expiresAt: Date }): boolean {
  return acceptance.expiresAt.getTime() < Date.now();
}
