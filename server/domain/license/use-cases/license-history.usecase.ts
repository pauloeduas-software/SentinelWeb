import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

/**
 * A TRILHA DA LICENÇA — quem pegou, quem devolveu, quem viu a chave.
 *
 * Tudo sai do `ActivityLog` com `entityType: 'License'`: as edições, as
 * entregas, as devoluções, as queimas e os `VIEW_KEY`. Uma consulta, uma
 * ordenação — e é por isso que o checkout e o checkin gravam o log com o id da
 * LICENÇA, não o do assento: quem abre esta aba pergunta "o que aconteceu com
 * o Office 2024", não "o que aconteceu com o assento 7".
 */
const PADRAO = 50;

export async function listLicenseHistory(licenseId: string, limit = PADRAO) {
  const licenca = await prisma.license.findFirst({
    where: { id: licenseId },
    select: { id: true },
  });
  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  return prisma.activityLog.findMany({
    where: { entityType: 'License', entityId: licenseId },
    select: { id: true, action: true, changes: true, actorId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
