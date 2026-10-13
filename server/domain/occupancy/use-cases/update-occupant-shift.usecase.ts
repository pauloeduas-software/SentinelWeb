import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';

// O TURNO DE UMA OCUPAÇÃO ABERTA, corrigido.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE NÃO É "ENCERRAR E REABRIR".
//
// O caso real é o typo: alguém cadastrou "manha" e quer "manhã". As duas
// alternativas erradas:
//
//   encerrar e reabrir   fabricaria histórico falso — a tabela passaria a dizer
//                        que a pessoa SAIU do posto e VOLTOU no mesmo dia, por
//                        causa de um typo. E "quem respondia pela Mesa 1 em
//                        março?" ganharia um buraco onde não houve nenhum;
//
//   não oferecer saída   deixaria o cadastro com o turno errado para sempre, já
//                        que pessoa, posto e `startedAt` não são alteráveis.
//
// A terceira é esta: o turno é ATRIBUTO do vínculo aberto, e corrigi-lo é um
// `UPDATE` com trilha. A linha continua a mesma, com o mesmo `startedAt`.
//
// O `locationId` entra na consulta pelo mesmo motivo do encerramento: a rota é
// `/api/locations/:id/occupants/:occupantId`, e sem os dois juntos no `where`
// uma ocupação de OUTRO posto seria corrigida por esta URL — que passaria a
// descrever algo que não aconteceu.
// ═════════════════════════════════════════════════════════════════════════════

export async function updateOccupantShift(
  locationId: string,
  occupantId: string,
  shift: string | null,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.locationOccupant.findFirst({
      where: { id: occupantId, locationId },
      select: { id: true, shift: true, endedAt: true },
    });

    if (!antes) throw new AppError('Ocupação não encontrada.', 404);

    // Ocupação ENCERRADA não muda de turno: ela é histórico, e histórico que se
    // edita não serve para responder nada.
    if (antes.endedAt !== null) {
      throw new AppError('Esta ocupação já foi encerrada e não pode ser alterada.', 409);
    }

    const atualizada = await tx.locationOccupant.update({
      where: { id: occupantId },
      data: { shift },
      select: OCCUPANT_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'LocationOccupant',
      entityId: occupantId,
      action: 'UPDATE',
      changes: { shift: { de: antes.shift, para: shift } },
    }, actorId);

    return atualizada;
  });
}
