import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { OCCUPANT_SELECT, rotuloDaOcupacao } from '../helpers/occupant-select.helper';

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
// O `workstationId` entra na consulta pelo mesmo motivo do encerramento: a rota é
// `/api/workstations/:id/occupants/:occupantId`, e sem os dois juntos no `where`
// uma ocupação de OUTRO posto seria corrigida por esta URL — que passaria a
// descrever algo que não aconteceu.
// ═════════════════════════════════════════════════════════════════════════════

export async function updateOccupantShift(
  workstationId: string,
  occupantId: string,
  shift: string | null,
  ator: Ator,
) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.workstationOccupant.findFirst({
      where: { id: occupantId, workstationId },
      select: { id: true, shift: true, endedAt: true },
    });

    if (!antes) throw new AppError('Ocupação não encontrada.', 404);

    // Ocupação ENCERRADA não muda de turno: ela é histórico, e histórico que se
    // edita não serve para responder nada.
    const ENCERRADA = 'Esta ocupação já foi encerrada e não pode ser alterada.';
    if (antes.endedAt !== null) throw new AppError(ENCERRADA, 409);

    // O MESMO turno não é correção: sem escrita e sem linha no histórico — um
    // "de Manhã para Manhã" na trilha só faria barulho.
    if (antes.shift === shift) {
      return tx.workstationOccupant.findUniqueOrThrow({ where: { id: occupantId }, select: OCCUPANT_SELECT });
    }

    // `updateMany` com `endedAt: null` no WHERE, e não `update` por id: é o
    // mesmo padrão atômico do encerramento. Se ela foi encerrada entre a
    // leitura acima e esta escrita, a linha não casa, e o turno de uma ocupação
    // já fechada não é reescrito.
    const { count } = await tx.workstationOccupant.updateMany({
      where: { id: occupantId, workstationId, endedAt: null },
      data: { shift },
    });
    if (count === 0) throw new AppError(ENCERRADA, 409);

    const atualizada = await tx.workstationOccupant.findUniqueOrThrow({
      where: { id: occupantId },
      select: OCCUPANT_SELECT,
    });

    await recordAudit(tx, {
      entityType: 'WorkstationOccupant',
      entityId: occupantId,
      entityLabel: rotuloDaOcupacao(atualizada),
      action: 'UPDATE',
      changes: { shift: { de: antes.shift, para: shift } },
    }, ator);

    return atualizada;
  });
}
