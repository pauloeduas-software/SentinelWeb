import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { CAMPOS_AUDITADOS_DA_LICENCA, LICENSE_SELECT } from '../helpers/license-select.helper';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * EXCLUIR DE VEZ — só a licença que NUNCA FOI ENTREGUE: o cadastro errado (AA).
 *
 * A que já foi entregue alguma vez tem passado — o histórico do computador e o
 * do colaborador contam por onde ela andou —, e por isso não se exclui:
 * encerra. Sem lixeira e sem nome guardado por escrito: como nenhuma entrega
 * fica sem licença, a FK `Restrict` de `license_checkouts` é a rede, e esta
 * conferência existe para responder a frase que manda encerrar.
 */
export async function deleteLicense(id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A trava antes da contagem: sem ela, uma entrega simultânea nasceria
    // depois deste `count`, e a FK recusaria o DELETE com uma frase genérica.
    await travarLicencaOuFalhar(tx, id);
    const licenca = await tx.license.findUniqueOrThrow({ where: { id }, select: LICENSE_SELECT });

    const entregas = await tx.licenseCheckout.count({ where: { licenseId: id } });
    if (entregas > 0) {
      throw new AppError(
        `"${licenca.name}" já foi entregue e não pode ser excluída: o histórico de quem a usou `
        + 'depende dela. Encerre-a em vez de excluir.',
        409,
      );
    }

    await tx.license.delete({ where: { id } });

    // A exclusão é DE VERDADE: o retrato é o que sobra de que a licença existiu.
    await recordAudit(tx, {
      entityType: 'License',
      entityId: id,
      entityLabel: licenca.name,
      action: 'DELETE',
      changes: buildSnapshot(licenca, CAMPOS_AUDITADOS_DA_LICENCA),
    }, ator);
  });
}
