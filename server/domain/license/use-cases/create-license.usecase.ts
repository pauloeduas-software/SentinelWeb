import { randomUUID } from 'node:crypto';
import { prisma } from '../../../core/database/prismaClient';
import { SEM_USO } from '../helpers/license-count.helper';
import { assertDatasNaoAntecedemACompra } from '../helpers/license-dates.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { CreateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';

/**
 * O CADASTRO DE UMA LICENÇA.
 *
 * O `id` é gerado aqui, e não pelo Prisma: `License.id` não tem default no
 * schema.
 */
export async function createLicense(data: CreateLicenseData): Promise<LicencaNaResposta> {
  const id = randomUUID();

  assertDatasNaoAntecedemACompra({
    purchaseDate: data.purchaseDate ?? null,
    expirationDate: data.expirationDate ?? null,
    terminationDate: data.terminationDate ?? null,
  });

  const criada = await prisma.$transaction(async (tx) => {
    await assertReferenciasDaLicenca(tx, data);

    const licenca = await tx.license.create({
      data: { ...data, id },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    return licenca;
  });

  // Recém-criada: nada em uso. A conta sai do mesmo caminho da listagem, para a
  // resposta ter exatamente a forma que a listagem tem.
  return paraResposta(criada, SEM_USO);
}
