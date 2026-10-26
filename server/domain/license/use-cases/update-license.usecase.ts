import { prisma } from '../../../core/database/prismaClient';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { AppError } from '../../../core/errors/app-error';
import { fraseDoPiso } from '../helpers/license-count.helper';
import { assertDatasNaoAntecedemACompra } from '../helpers/license-dates.helper';
import {
  CAMPOS_AUDITADOS_DA_LICENCA, LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { UpdateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { contarUsoDe } from './count-license-checkouts.usecase';
import { assertChavesCabem, gravarChaves, somaDasChaves } from './license-keys.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * A EDIÇÃO — e ela pode mudar a quantidade comprada.
 *
 * `seatsTotal` é o NÚMERO DO CONTRATO: alguém comprou mais, e digitar isso É a
 * operação. Aumentar sempre pode. Reduzir não passa do que está em uso
 * (invariante 22), nem do que as chaves cobrem (invariante 24).
 *
 * `keys` é a lista inteira das chaves como ficará (AC); ausente, elas ficam
 * como estão.
 *
 * A TRAVA DA LICENÇA vem primeiro e serializa a edição com a entrega: sem ela,
 * a edição contava "2 em uso", uma entrega gravava a terceira, e a quantidade
 * descia abaixo do que está na rua.
 */
export async function updateLicense(id: string, data: UpdateLicenseData, ator: Ator): Promise<LicencaNaResposta> {
  const { keys, ...campos } = data;

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
      // Sem lista nova no corpo, as chaves gravadas é que não podem passar do
      // número novo. Com a lista, quem confere é o `gravarChaves`, abaixo.
      if (!keys) assertChavesCabem(antes.name, data.seatsTotal, await somaDasChaves(tx, id), 409);
    }

    // O ENCERRAMENTO PELO FORMULÁRIO segue a regra do botão: passa mesmo com
    // alguém usando (`terminate-license.usecase.ts`), e a licença cai no
    // alerta "encerrada, ainda em uso".

    const depois = await tx.license.update({
      where: { id },
      data: campos,
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    // As chaves contra a quantidade como ficou. Na auditoria, só quantas
    // entraram, mudaram e saíram — nunca o texto.
    const chaves = keys ? await gravarChaves(tx, depois, keys) : {};
    const changes = {
      ...buildChanges(antes, depois, CAMPOS_AUDITADOS_DA_LICENCA),
      ...(Object.keys(chaves).length > 0 ? { chaves } : {}),
    };

    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        entityType: 'License', entityId: id, entityLabel: depois.name, action: 'UPDATE', changes,
      }, ator);
    }

    return depois;
  });

  return paraResposta(licenca, await contarUsoDe(prisma, id));
}
