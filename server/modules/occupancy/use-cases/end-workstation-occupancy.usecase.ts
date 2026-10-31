import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';
import { OCCUPANT_SELECT, rotuloDaOcupacao } from '../helpers/occupant-select.helper';

const CAMPOS_AUDITADOS = ['workstationId', 'personId', 'shift', 'startedAt', 'endedAt', 'notes'] as const;

/**
 * ENCERRA uma ocupação. Não apaga.
 *
 * A linha continua na tabela e só ganha `endedAt`. É a mesma razão do
 * `AuditLog` ser append-only: "quem respondia pela Mesa 1 em março?" precisa
 * continuar respondível depois que a Laura saiu do posto, e um `DELETE` de
 * verdade apagaria a única linha que sabe disso. A rota é `DELETE` porque é o
 * verbo de "tira esta pessoa daqui" na tela — o que ele faz com a linha é
 * decisão do domínio, não do método HTTP.
 *
 * O `updateMany` com `endedAt: null` no `where` é o que torna a regra ATÔMICA:
 * ler primeiro e atualizar depois deixa dois cliques simultâneos passarem os
 * dois, e o segundo sobrescreveria o `endedAt` do primeiro — mexendo na data em
 * que a pessoa saiu do posto sem ninguém ver erro nenhum. É o mesmo padrão do
 * `delete-user.usecase.ts`.
 *
 * Quando o `updateMany` não pega nada, a segunda consulta existe só para
 * escolher a resposta certa: 404 se a ocupação não existe NESTE posto, 409 se
 * existe e já estava encerrada. Sem ela, encerrar duas vezes responderia "não
 * encontrado" para uma linha que está lá.
 *
 * O DIA do fim (AM), como a devolução: ausente é agora; um dia passado vira o
 * meio-dia de Brasília (`instanteDoDia`), e não vem antes do dia do início —
 * no mesmo dia, nunca antes da hora real dele.
 */
export async function endWorkstationOccupancy(
  workstationId: string,
  occupantId: string,
  dia: Date | undefined,
  ator: Ator,
) {
  return prisma.$transaction(async (tx) => {
    let endedAt = new Date();
    if (dia) {
      const aberta = await tx.workstationOccupant.findFirst({
        where: { id: occupantId, workstationId, endedAt: null },
        select: { startedAt: true },
      });
      if (aberta) {
        const inicio = hojeNoBrasil(aberta.startedAt);
        if (dia < inicio) {
          throw new AppError(
            `O fim da ocupação (${diaEmPortugues(dia)}) não pode ser antes do início (${diaEmPortugues(inicio)}).`,
            422,
          );
        }
        const instante = instanteDoDia(dia);
        endedAt = instante < aberta.startedAt ? aberta.startedAt : instante;
      }
    }

    // `workstationId` entra no `where` junto com o id: a ocupação é encerrada
    // DENTRO do posto a que pertence. Sem ele, um id de ocupação de outro posto
    // seria encerrado por esta URL e a rota deixaria de descrever o que fez.
    const { count } = await tx.workstationOccupant.updateMany({
      where: {
        id: occupantId,
        workstationId,
        endedAt: null,
      },
      data: { endedAt },
    });

    if (count === 0) {
      const existe = await tx.workstationOccupant.findFirst({
        where: { id: occupantId, workstationId },
        select: { id: true },
      });

      throw existe
        ? new AppError('Esta ocupação já foi encerrada.', 409)
        : new AppError('Ocupação não encontrada.', 404);
    }

    const encerrada = await tx.workstationOccupant.findFirstOrThrow({
      where: { id: occupantId },
      select: OCCUPANT_SELECT,
    });

    // Retrato inteiro, não só o `endedAt`: esta é a linha do histórico que
    // responde "quem saiu de onde, e desde quando estava lá". Um log com
    // apenas a data de saída obrigaria a cruzar com a tabela para entender o
    // evento — e a tabela pode ser corrigida depois, o log não.
    await recordAudit(tx, {
      entityType: 'WorkstationOccupant',
      entityId: occupantId,
      entityLabel: rotuloDaOcupacao(encerrada),
      action: 'END',
      changes: buildSnapshot(encerrada, CAMPOS_AUDITADOS),
    }, ator);

    // Devolve a ocupação encerrada, e não `{ success: true }` como o DELETE do
    // ativo: lá a linha some, aqui ela continua existindo em outro estado — e é
    // esse estado (o `endedAt` que o banco carimbou) que a tela precisa para
    // atualizar a linha sem recarregar a lista.
    return encerrada;
  });
}
