import { AppError } from '../../../infra/errors/app-error';

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

/**
 * O FIM DA GARANTIA NÃO ANTECEDE A COMPRA (CO), como o vencimento da licença
 * (`license-dates.helper.ts`). Recebe as datas como ficarão depois da gravação:
 * na edição, mudar só a compra também pode inverter a ordem. O CHECK
 * `assets_garantia_nao_antecede_compra` é a rede; esta função dá o 422 com as
 * duas datas.
 */
export function assertGarantiaNaoAntecedeACompra(
  { purchaseDate: compra, warrantyExpiresAt: garantia }: { purchaseDate: Date | null; warrantyExpiresAt: Date | null },
): void {
  if (compra && garantia && garantia < compra) {
    throw new AppError(
      `O fim da garantia (${diaEmPortugues(garantia)}) não pode ser antes da data da compra (${diaEmPortugues(compra)}).`,
      422,
    );
  }
}
