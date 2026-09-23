import { prisma } from '../../../core/database/prismaClient';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

export async function createCatalog(
  spec: CatalogSpec,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<Record<string, unknown>> {
  // O log entra na MESMA transação da gravação: fora dela, o histórico
  // registraria um cadastro que depois falhou.
  return prisma.$transaction(async (tx) => {
    await spec.beforeWrite?.(tx, null, data);

    const registro = await spec.delegate(tx).create({ data, select: spec.select });

    await recordActivity(tx, {
      entityType: spec.entityType,
      entityId: String(registro.id),
      action: 'CREATE',
      changes: buildSnapshot(registro, spec.audited),
    }, actorId);

    return registro;
  });
}
