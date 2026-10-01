import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';

const CAMPOS_AUDITADOS = ['locationId', 'userId', 'shift', 'startedAt', 'endedAt', 'notes'] as const;

/**
 * ENCERRA uma ocupação. Não apaga.
 *
 * A linha continua na tabela e só ganha `endedAt`. É a mesma razão do
 * `ActivityLog` ser append-only: "quem respondia pela Mesa 1 em março?" precisa
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
 */
export async function endLocationOccupancy(
  locationId: string,
  occupantId: string,
  actorId: string | null,
  /**
   * QUANDO a pessoa saiu do posto. Ausente, é agora (o caso da tela).
   *
   * Existe pela mesma razão do `checkoutAt` da entrega (F10, D131): a carga
   * inicial de uma empresa traz saídas que aconteceram meses atrás, e encerrar
   * tudo com a data de hoje faria o histórico de ocupação nascer mentindo —
   * "quem respondia pela Mesa 1 em março?" passaria a responder errado para
   * todo o período entre a saída real e a importação.
   *
   * Só o importador passa isto. A rota da tela não aceita a data: tirar alguém
   * de um posto pela interface é um evento de AGORA.
   */
  endedAt?: Date | null,
) {
  return prisma.$transaction(async (tx) => {
    // `locationId` entra no `where` junto com o id: a ocupação é encerrada
    // DENTRO do posto a que pertence. Sem ele, um id de ocupação de outro local
    // seria encerrado por esta URL e a rota deixaria de descrever o que fez.
    const { count } = await tx.locationOccupant.updateMany({
      where: {
        id: occupantId,
        locationId,
        endedAt: null,
        // A SAÍDA NÃO PODE SER ANTES DA ENTRADA, e a guarda está no `where` de
        // propósito: lida e conferida antes, duas chamadas simultâneas passariam
        // as duas. Aqui, a linha simplesmente não casa e o bloco abaixo escolhe
        // a mensagem — que é a mesma rede do `endedAt: null`.
        ...(endedAt ? { startedAt: { lte: endedAt } } : {}),
      },
      data: { endedAt: endedAt ?? new Date() },
    });

    if (count === 0) {
      const existe = await tx.locationOccupant.findFirst({
        where: { id: occupantId, locationId },
        select: { id: true, endedAt: true, startedAt: true },
      });

      if (existe && existe.endedAt === null && endedAt && existe.startedAt > endedAt) {
        throw new AppError(
          `A saída (${endedAt.toISOString().slice(0, 10)}) é anterior à entrada `
            + `(${existe.startedAt.toISOString().slice(0, 10)}).`,
          422,
        );
      }

      throw existe
        ? new AppError('Esta ocupação já foi encerrada.', 409)
        : new AppError('Ocupação não encontrada.', 404);
    }

    const encerrada = await tx.locationOccupant.findFirstOrThrow({
      where: { id: occupantId },
      select: OCCUPANT_SELECT,
    });

    // Retrato inteiro, não só o `endedAt`: esta é a linha do histórico que
    // responde "quem saiu de onde, e desde quando estava lá". Um log com
    // apenas a data de saída obrigaria a cruzar com a tabela para entender o
    // evento — e a tabela pode ser corrigida depois, o log não.
    await recordActivity(tx, {
      entityType: 'LocationOccupant',
      entityId: occupantId,
      action: 'END',
      changes: buildSnapshot(encerrada, CAMPOS_AUDITADOS),
    }, actorId);

    // Devolve a ocupação encerrada, e não `{ success: true }` como o DELETE do
    // ativo: lá a linha some, aqui ela continua existindo em outro estado — e é
    // esse estado (o `endedAt` que o banco carimbou) que a tela precisa para
    // atualizar a linha sem recarregar a lista.
    return encerrada;
  });
}
