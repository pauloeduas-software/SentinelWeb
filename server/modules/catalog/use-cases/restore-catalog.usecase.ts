import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import type { CatalogSpec } from '../specs/catalog-spec.types';

/**
 * Tira da lixeira — só nas tabelas que a têm (`spec.lixeira`).
 *
 * `deletedAt` explícito no `where` faz a extension de soft delete sair do
 * caminho (infra/database/soft-delete.extension.ts): é assim que a restauração
 * alcança a linha que toda outra leitura esconde.
 */
export async function restoreCatalog(
  spec: CatalogSpec,
  id: string,
  ator: Ator,
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

    await recordAudit(tx, {
      entityType: spec.entityType, entityId: id, entityLabel: String(depois.name), action: 'RESTORE',
    }, ator);

    return depois;
  });
}
