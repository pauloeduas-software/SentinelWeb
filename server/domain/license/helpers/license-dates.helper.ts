import { AppError } from '../../../core/errors/app-error';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil } from '../../shared/hoje.helper';
import type { ClienteLicenca } from '../use-cases/count-license-checkouts.usecase';

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

/**
 * ENCERRAR SÓ COM TUDO DEVOLVIDO — o padrão do sistema para o que depende de
 * outra coisa em uso: bloqueia, e diz o que fazer antes. Vale para o botão e
 * para a data do formulário. O arquivar do Snipe-IT recusa o acessório com
 * unidade entregue da mesma forma.
 */
export async function assertEncerraSemEntregaAberta(client: ClienteLicenca, licenseId: string, nome: string): Promise<void> {
  const abertas = await client.licenseCheckout.count({ where: { licenseId, checkinAt: null } });
  if (abertas === 0) return;
  throw new AppError(
    `"${nome}" tem ${abertas} ${abertas === 1 ? 'entrega aberta' : 'entregas abertas'} e não pode ser encerrada. `
    + 'Faça a devolução antes.',
    409,
  );
}

/**
 * AS DATAS DA LICENÇA CONTRA AS ENTREGAS QUE ELA JÁ TEM — a edição que muda a
 * compra ou o encerramento não deixa uma entrega fora do contrato:
 *
 * - a compra não fica DEPOIS da primeira entrega — a entrega já recusa o dia
 *   antes da compra, e a edição não pode desfazer isso por trás;
 * - o encerramento não fica ANTES da última devolução — o histórico diria
 *   "devolvido em 10/10" num contrato que acabou em 01/10. Com tudo devolvido
 *   (`assertEncerraSemEntregaAberta`), a última devolução vem depois de toda
 *   entrega.
 *
 * Só a data que MUDA é conferida: o formulário reenvia todas, e a licença
 * antiga com a ordem trocada continua editável nos outros campos. O Encerrar do
 * botão grava hoje, que nunca vem antes de devolução nenhuma.
 */
export async function assertDatasCobremAsEntregas(
  client: ClienteLicenca,
  licenseId: string,
  mudou: { purchaseDate?: Date | null; terminationDate?: Date | null },
): Promise<void> {
  const { purchaseDate: compra, terminationDate: encerramento } = mudou;
  if (compra) {
    const primeira = await client.licenseCheckout.findFirst({
      where: { licenseId }, orderBy: { checkoutAt: 'asc' }, select: { checkoutAt: true },
    });
    const dia = primeira && hojeNoBrasil(primeira.checkoutAt);
    if (dia && compra > dia) {
      throw new AppError(
        `A data da compra (${diaEmPortugues(compra)}) não pode ser depois da primeira entrega (${diaEmPortugues(dia)}).`,
        422,
      );
    }
  }
  if (encerramento) {
    const ultima = await client.licenseCheckout.findFirst({
      where: { licenseId, checkinAt: { not: null } }, orderBy: { checkinAt: 'desc' }, select: { checkinAt: true },
    });
    const dia = ultima?.checkinAt && hojeNoBrasil(ultima.checkinAt);
    if (dia && encerramento < dia) {
      throw new AppError(
        `O encerramento (${diaEmPortugues(encerramento)}) não pode ser antes da última devolução (${diaEmPortugues(dia)}).`,
        422,
      );
    }
  }
}
