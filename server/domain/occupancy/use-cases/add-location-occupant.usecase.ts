import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { errorCode } from '../../../core/errors/error-shape';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';
import { travarUsuario } from '../../user/use-cases/lock-user.usecase';

export interface AddOccupantData {
  userId: string;
  shift?: string | null;
  notes?: string | null;
  startedAt?: Date | null;
}

const CAMPOS_AUDITADOS = ['locationId', 'userId', 'shift', 'startedAt', 'notes'] as const;

/** A mesma frase nos dois caminhos — ver a nota sobre a dupla guarda abaixo. */
const JA_OCUPA = 'Esta pessoa já ocupa este posto.';

/**
 * Coloca uma pessoa num posto de trabalho.
 *
 * As três guardas, na ordem em que importam:
 *
 * 1. **Posto e pessoa existem e estão vivos.** 404 separado para cada um, com
 *    mensagem própria: "não encontrado" genérico obrigaria quem chamou a
 *    adivinhar qual dos dois uuids estava errado.
 * 2. **Duplicata.** A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo
 *    tempo — dois vínculos abertos idênticos não significam nada e quebrariam
 *    a contagem de ocupantes da Camada 3.
 * 3. **Transação com o `ActivityLog`.** Gravado fora, o histórico registraria
 *    uma ocupação que depois falhou.
 *
 * SOBRE A DUPLA GUARDA DA DUPLICATA: a checagem em SQL e o `catch` do `P2002`
 * não são redundância. Entre o `findFirst` e o `create` cabe outra requisição —
 * é READ COMMITTED, não serializável —, então a checagem sozinha deixa passar a
 * corrida e o índice único parcial
 * `location_occupants_um_aberto_por_pessoa_local` é quem de fato garante a
 * regra. Mas o `P2002` cru vira "Registro já existe" no error-handler
 * (core/errors/error-handler.ts), que não diz nada a quem está na tela. Então:
 * a checagem é pela MENSAGEM, o índice é a GARANTIA, e o `catch` traduz o
 * segundo para a primeira.
 */
export async function addLocationOccupant(
  locationId: string,
  data: AddOccupantData,
  actorId: string | null,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // `findUnique`: `Location` não tem lixeira (o catálogo não tem, D8).
      const local = await tx.location.findUnique({ where: { id: locationId }, select: { id: true } });
      if (!local) throw new AppError('Localização não encontrada.', 404);

      // A TRAVA na linha do colaborador, antes de lê-lo. Ocupar um posto é
      // assumir responsabilidade derivada por tudo que está nele, então a
      // corrida com o desligamento é a mesma da entrega: sem a trava, a
      // ocupação nasce depois de o `offboard` ter encerrado a lista e o
      // desligado volta a responder pela Mesa 1 (`lock-user.usecase.ts`).
      await travarUsuario(tx, data.userId);

      // `findFirst`: só ele recebe o escopo da lixeira da extension — o `where`
      // do `findUnique` só admite campo único e por isso fica de fora
      // (core/database/soft-delete.extension.ts). Com `findUnique` aqui, um
      // colaborador excluído voltaria a ser posto num posto de trabalho. A
      // trava acima não substitui esta leitura: ela serializa, não filtra.
      const pessoa = await tx.user.findFirst({ where: { id: data.userId }, select: { id: true } });
      if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

      const aberta = await tx.locationOccupant.findFirst({
        where: { locationId, userId: data.userId, endedAt: null },
        select: { id: true },
      });
      if (aberta) throw new AppError(JA_OCUPA, 409);

      const ocupacao = await tx.locationOccupant.create({
        data: {
          locationId,
          userId: data.userId,
          shift: data.shift ?? null,
          notes: data.notes ?? null,
          // `undefined` faz o Prisma NÃO mandar a coluna, e aí quem preenche é
          // o `@default(now())` do banco. Trocar por `new Date()` colocaria o
          // relógio da aplicação no lugar do relógio do banco — que é o mesmo
          // que carimba o `endedAt`, e comparar os dois precisa da mesma fonte.
          startedAt: data.startedAt ?? undefined,
        },
        select: OCCUPANT_SELECT,
      });

      await recordActivity(tx, {
        entityType: 'LocationOccupant',
        entityId: ocupacao.id,
        action: 'CREATE',
        changes: buildSnapshot(ocupacao, CAMPOS_AUDITADOS),
      }, actorId);

      return ocupacao;
    });
  } catch (error) {
    if (errorCode(error) === 'P2002') throw new AppError(JA_OCUPA, 409);
    throw error;
  }
}
