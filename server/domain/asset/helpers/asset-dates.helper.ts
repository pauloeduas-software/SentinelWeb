// Datas derivadas do ativo — funções puras, sem I/O.
//
// Garantia e fim de vida são CALCULADAS a partir da data de compra e do número
// de meses, nunca digitadas em duplicidade. Guardar as duas coisas e deixar o
// usuário preencher as duas é convite para elas divergirem.

/**
 * Soma meses a uma data, **grudando no último dia do mês** quando o dia não
 * existe no mês de destino.
 *
 * `setMonth` sozinho transborda: 31/01 + 1 mês vira 03/03, porque 31/02 não
 * existe e o JavaScript rola para a frente. Uma garantia comprada em 31/01 com
 * 1 mês venceria em março. Aqui ela vence em 28/02 — que é o que qualquer
 * contrato entende por "um mês depois".
 *
 * Tudo em UTC: data de compra é dia de calendário, não instante, e converter
 * para hora local moveria o dia num fuso a oeste de Greenwich.
 */
export function adicionarMeses(base: Date, meses: number): Date {
  const resultado = new Date(base.getTime());
  const diaOriginal = resultado.getUTCDate();

  // Ir para o dia 1 antes de mexer no mês é o que impede o transbordo durante
  // a própria operação.
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);

  // Dia 0 do mês seguinte = último dia deste mês.
  const ultimoDiaDoMes = new Date(
    Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0),
  ).getUTCDate();

  resultado.setUTCDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return resultado;
}

export interface EntradaDeDatas {
  purchaseDate?: Date | null;
  warrantyMonths?: number | null;
  eolMonths?: number | null;
  eolExplicit?: boolean;
  eolDate?: Date | null;
}

export interface DatasCalculadas {
  warrantyExpiresAt: Date | null;
  eolDate: Date | null;
}

/**
 * Sem data de compra não há de onde contar: as duas saem `null`, e é assim que
 * o Snipe-IT se comporta.
 *
 * `eolExplicit` é o escape: quando alguém digita a data de fim de vida à mão
 * (um equipamento herdado, um contrato fora do padrão), o cálculo para de
 * mexer nela.
 */
export function calcularDatas(entrada: EntradaDeDatas): DatasCalculadas {
  const { purchaseDate, warrantyMonths, eolMonths, eolExplicit, eolDate } = entrada;

  const warrantyExpiresAt =
    purchaseDate && warrantyMonths ? adicionarMeses(purchaseDate, warrantyMonths) : null;

  if (eolExplicit) return { warrantyExpiresAt, eolDate: eolDate ?? null };

  return {
    warrantyExpiresAt,
    eolDate: purchaseDate && eolMonths ? adicionarMeses(purchaseDate, eolMonths) : null,
  };
}

/**
 * A data como o Brasil a lê — para MENSAGEM, nunca para gravar.
 *
 * Em UTC pelo mesmo motivo de `adicionarMeses`: `retiredAt` e `purchaseDate`
 * são dia de calendário, e `toLocaleDateString` local devolveria o dia anterior
 * num fuso a oeste de Greenwich. O 409 diria a data errada.
 */
export function diaEmPortugues(data: Date): string {
  return data.toISOString().slice(0, 10).split('-').reverse().join('/');
}
