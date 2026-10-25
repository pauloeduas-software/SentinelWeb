import { AppError } from '../../../core/errors/app-error';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';

// AS DATAS DA LICENÇA NÃO ANTECEDEM A COMPRA.
//
// O vencimento e o encerramento são comparados com a data da compra, cada um só
// quando os dois lados da comparação estão preenchidos. O encerramento NÃO é
// comparado com o vencimento: dá para encerrar antes do fim do período pago.
//
// Os CHECKs `licenses_*_nao_antecede_compra` são a rede; esta função existe para
// responder 422 com as duas datas, em vez da mensagem do constraint.

interface DatasDaLicenca {
  purchaseDate: Date | null;
  expirationDate: Date | null;
  terminationDate: Date | null;
}

/**
 * Recebe as datas como ficarão DEPOIS da gravação: na edição, a que não veio no
 * corpo é a que já está no banco — mudar só a compra também pode inverter a
 * ordem.
 */
export function assertDatasNaoAntecedemACompra(datas: DatasDaLicenca): void {
  const { purchaseDate: compra } = datas;
  if (!compra) return;

  const comparadas = [
    { rotulo: 'O vencimento', data: datas.expirationDate },
    { rotulo: 'O encerramento', data: datas.terminationDate },
  ];
  for (const { rotulo, data } of comparadas) {
    if (data && data < compra) {
      throw new AppError(
        `${rotulo} (${diaEmPortugues(data)}) não pode ser antes da data da compra (${diaEmPortugues(compra)}).`,
        422,
      );
    }
  }
}
