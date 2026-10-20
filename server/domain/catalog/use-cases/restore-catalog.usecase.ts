import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import type { CatalogSpec } from '../specs/catalog-spec.types';

/**
 * Tira da lixeira — só nas tabelas que a têm (`spec.lixeira`).
 *
 * `deletedAt` explícito no `where` faz a extension de soft delete sair do
 * caminho (core/database/soft-delete.extension.ts): é assim que a restauração
 * alcança a linha que toda outra leitura esconde.
 */
export async function restoreCatalog(
  spec: CatalogSpec,
  id: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const naLixeira = await delegate.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
    if (!naLixeira) throw new AppError('Registro não está na lixeira.', 404);

    await spec.beforeRestore?.(tx, id);

    const depois = await delegate.update({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
      select: spec.select,
    });

    await recordActivity(tx, { entityType: spec.entityType, entityId: id, action: 'RESTORE' });

    return depois;
  });
}
