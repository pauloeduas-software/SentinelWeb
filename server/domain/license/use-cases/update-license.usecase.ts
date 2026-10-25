import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { fraseDoPiso } from '../helpers/license-count.helper';
import { assertDatasNaoAntecedemACompra } from '../helpers/license-dates.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { UpdateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { contarUsoDe } from './count-license-checkouts.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * A EDIÇÃO — e ela pode mudar a quantidade comprada.
 *
 * `seatsTotal` é o NÚMERO DO CONTRATO: alguém comprou mais, e digitar isso É a
 * operação. Aumentar sempre pode. Reduzir não passa do que está em uso
 * (invariante 22).
 *
 * A TRAVA DA LICENÇA vem primeiro e serializa a edição com a entrega: sem ela,
 * a edição contava "2 em uso", uma entrega gravava a terceira, e a quantidade
 * descia abaixo do que está na rua.
 */
export async function updateLicense(id: string, data: UpdateLicenseData): Promise<LicencaNaResposta> {
  const licenca = await prisma.$transaction(async (tx) => {
    await travarLicencaOuFalhar(tx, id);

    const antes = await tx.license.findUniqueOrThrow({ where: { id }, select: LICENSE_SELECT }) as LinhaDeLicenca;

    await assertReferenciasDaLicenca(tx, data, {
      categoryId: antes.categoryId as string,
      manufacturerId: antes.manufacturerId as string | null,
    });

    // As datas como ficarão: a que não veio no corpo é a que já está gravada.
    assertDatasNaoAntecedemACompra({
      purchaseDate: data.purchaseDate !== undefined ? data.purchaseDate : antes.purchaseDate,
      expirationDate: data.expirationDate !== undefined ? data.expirationDate : antes.expirationDate,
      terminationDate: data.terminationDate !== undefined ? data.terminationDate : antes.terminationDate,
    });

    if (data.seatsTotal !== undefined && data.seatsTotal < antes.seatsTotal) {
      const uso = await contarUsoDe(tx, id);
      if (data.seatsTotal < uso.emUso) {
        throw new AppError(fraseDoPiso(antes.name, data.seatsTotal, uso), 409);
      }
    }

    // O ENCERRAMENTO PELO FORMULÁRIO segue a regra do botão: passa mesmo com
    // alguém usando (`terminate-license.usecase.ts`), e a licença cai no
    // alerta "encerrada, ainda em uso".

    return tx.license.update({
      where: { id },
      data,
      select: LICENSE_SELECT,
    }) as Promise<LinhaDeLicenca>;
  });

  return paraResposta(licenca, await contarUsoDe(prisma, id));
}
