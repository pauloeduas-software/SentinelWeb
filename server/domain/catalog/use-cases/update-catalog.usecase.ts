import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

export async function updateCatalog(
  spec: CatalogSpec,
  id: string,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const antes = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    await spec.beforeWrite?.(tx, id, data);

    const depois = await delegate.update({ where: { id }, data, select: spec.select });

    // Só o que REALMENTE mudou vai para o log: gravar o registro inteiro a cada
    // edição transformaria o histórico em cópia da tabela.
    const changes = buildChanges(antes, depois, spec.audited);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, {
        entityType: spec.entityType,
        entityId: id,
        action: 'UPDATE',
        changes,
      }, actorId);
    }

    return depois;
  });
}
