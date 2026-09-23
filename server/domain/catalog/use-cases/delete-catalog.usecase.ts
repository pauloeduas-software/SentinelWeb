import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

/**
 * Apaga de verdade — o catálogo não tem lixeira (docs/FASE-1-PLANO-ITAM.md, D8).
 *
 * A proteção é o `countUsages`: linha referenciada por alguém não é apagada, e
 * o cliente recebe 409 dizendo por quantos. É o que o Snipe-IT faz ao recusar
 * apagar uma categoria com item associado.
 *
 * O `ActivityLog` guarda o retrato da linha em `changes`, então um apagão
 * acidental continua recuperável à mão.
 */
export async function deleteCatalog(spec: CatalogSpec, id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const antes = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    const emUso = await spec.countUsages(tx, id);
    if (emUso > 0) {
      throw new AppError(
        `Não é possível excluir: ${spec.rotulo} em uso por ${emUso} ${emUso === 1 ? 'registro' : 'registros'}.`,
        409,
        { emUso },
      );
    }

    await delegate.delete({ where: { id } });

    await recordActivity(tx, {
      entityType: spec.entityType,
      entityId: id,
      action: 'DELETE',
      changes: buildSnapshot(antes, spec.audited),
    }, actorId);
  });
}
