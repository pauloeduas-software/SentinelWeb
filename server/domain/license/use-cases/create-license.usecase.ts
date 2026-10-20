import { randomUUID } from 'node:crypto';
import { prisma } from '../../../core/database/prismaClient';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { LICENSE_AUDITED } from '../helpers/license-audited.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { CreateLicenseData } from '../schemas/license.schema';
import { assertReferenciasDaLicenca } from './assert-license-references.usecase';
import { reconciliarAssentos } from './reconcile-seats.usecase';

/**
 * O CADASTRO DE UMA LICENÇA — o contrato e os assentos, numa transação.
 *
 * O `id` é gerado aqui, e não pelo Prisma: `License.id` não tem default no
 * schema.
 */
export async function createLicense(
  data: CreateLicenseData,
): Promise<LicencaNaResposta> {
  const campos = data;
  const id = randomUUID();

  const criada = await prisma.$transaction(async (tx) => {
    await assertReferenciasDaLicenca(tx, campos);

    const licenca = await tx.license.create({
      data: { ...campos, id },
      select: LICENSE_SELECT,
    }) as LinhaDeLicenca;

    // OS ASSENTOS NASCEM JUNTO, na mesma transação. Uma licença de 50 assentos
    // com zero linhas em `license_seats` passaria a invariante 11 a mentir no
    // primeiro instante de vida dela.
    await reconciliarAssentos(tx, id, data.seatsTotal);

    await recordActivity(tx, {
      entityType: 'License',
      entityId: id,
      action: 'CREATE',
      changes: buildSnapshot(licenca, LICENSE_AUDITED),
    });

    return licenca;
  });

  // Licença recém-criada: todos os assentos livres, nenhum ocupado. A conta sai
  // do mesmo caminho da listagem para a resposta ter exatamente a forma que a
  // listagem tem — uma tela que recebe `livres` em GET e não em POST é uma tela
  // com dois caminhos de renderização.
  return paraResposta(criada, {
    ocupados: 0, queimados: 0, aposentados: 0, livres: data.seatsTotal,
  });
}
