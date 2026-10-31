import { prisma } from '../../../infra/database/prismaClient';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { assertNomeLivre } from '../helpers/nome-unico.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

export async function createCatalog(
  spec: CatalogSpec,
  data: Record<string, unknown>,
  ator: Ator,
): Promise<Record<string, unknown>> {
  // O log entra na MESMA transação da gravação: fora dela, o histórico
  // registraria um cadastro que depois falhou.
  return prisma.$transaction(async (tx) => {
    await assertNomeLivre(spec, tx, null, data, null);
    await spec.beforeWrite?.(tx, null, data);

    const registro = await spec.delegate(tx).create({ data, select: spec.select });

    await recordAudit(tx, {
      entityType: spec.entityType,
      entityId: String(registro.id),
      entityLabel: String(registro.name),
      action: 'CREATE',
      changes: buildSnapshot(registro, spec.audited),
    }, ator);

    return registro;
  });
}
