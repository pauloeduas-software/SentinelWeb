// Datas do ativo — funções puras, sem I/O.

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
