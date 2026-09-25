import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarAssentosDe } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';

/**
 * Tirar da lixeira.
 *
 * `updateMany` com `deletedAt: { not: null }` no `where`, e não `update`: o
 * `where` explícito é o escape hatch da `softDeleteExtension` — sem a chave
 * `deletedAt` presente, a extension escoparia a consulta para as linhas VIVAS e
 * nenhuma restauração jamais encontraria o que restaurar.
 *
 * O NOME PODE TER SIDO TOMADO enquanto a licença estava na lixeira: a unicidade
 * é índice PARCIAL (`WHERE "deletedAt" IS NULL`), então nada impediu um
 * cadastro novo com o mesmo nome. O restore esbarra no índice, e o status certo
 * é 409 — mas a frase NÃO pode ser a genérica do error-handler ("Registro já
 * existe"), que num alerta disparado por um clique em "Restaurar" não diz o que
 * aconteceu nem o que fazer. Mesmo cuidado do `restoreStockItem`.
 */
export async function restoreLicense(
  id: string,
  actorId: string | null,
): Promise<LicencaNaResposta> {
  const licenca = await prisma.$transaction(async (tx) => {
    let count: number;
    try {
      ({ count } = await tx.license.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null },
      }));
    } catch (erro) {
      if (errorCode(erro) === 'P2002') {
        throw new AppError(
          'Já existe outra licença ativa com este nome. Renomeie uma das duas antes de restaurar.',
          409,
        );
      }
      throw erro;
    }

    if (count === 0) throw new AppError('Nenhuma licença na lixeira com este identificador.', 404);

    await recordActivity(tx, { entityType: 'License', entityId: id, action: 'RESTORE' }, actorId);

    return await tx.license.findFirst({ where: { id }, select: LICENSE_SELECT }) as LinhaDeLicenca;
  });

  return paraResposta(licenca, await contarAssentosDe(prisma, id), { comMascara: true });
}
