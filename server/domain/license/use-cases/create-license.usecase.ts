import { randomUUID } from 'node:crypto';
import { prisma } from '../../../core/database/prismaClient';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { SEM_USO } from '../helpers/license-count.helper';
import { assertDatasNaoAntecedemACompra } from '../helpers/license-dates.helper';
import {
  CAMPOS_AUDITADOS_DA_LICENCA, LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { CreateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { gravarChaves } from './license-keys.usecase';

/**
 * O CADASTRO DE UMA LICENÇA.
 *
 * O `id` é gerado aqui, e não pelo Prisma: `License.id` não tem default no
 * schema.
 */
export async function createLicense(data: CreateLicenseData, ator: Ator): Promise<LicencaNaResposta> {
  const id = randomUUID();
  const { keys, ...campos } = data;

  assertDatasNaoAntecedemACompra({
    purchaseDate: data.purchaseDate ?? null,
    expirationDate: data.expirationDate ?? null,
    terminationDate: data.terminationDate ?? null,
  });

  const criada = await prisma.$transaction(async (tx) => {
    await assertReferenciasDaLicenca(tx, data);

    const licenca = await tx.license.create({
      data: { ...campos, id },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    // As chaves (AC): só quantas, nunca o texto.
    const chaves = keys?.length ? await gravarChaves(tx, licenca, keys) : null;

    await recordAudit(tx, {
      entityType: 'License',
      entityId: id,
      entityLabel: licenca.name,
      action: 'CREATE',
      changes: {
        ...buildSnapshot(licenca, CAMPOS_AUDITADOS_DA_LICENCA),
        ...(chaves ? { chaves } : {}),
      },
    }, ator);

    return licenca;
  });

  // Recém-criada: nada em uso. A conta sai do mesmo caminho da listagem, para a
  // resposta ter exatamente a forma que a listagem tem.
  return paraResposta(criada, SEM_USO);
}
