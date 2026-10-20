import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { OCCUPANT_ORDER_BY, buildViewWhere, type OccupancyView } from '../helpers/occupancy-filters.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';

/**
 * Quem ocupa um posto de trabalho — a pergunta da Camada 2
 * (docs/referencia/modelo-de-posse.md) e a entrada da Camada 3: é daqui que sai "quem
 * responde pelo mouse da Mesa 1".
 *
 * SEM envelope e SEM paginação, ao contrário de `/api/assets` e `/api/people`.
 * O motivo não é preguiça: a lista é limitada pelo mundo real — são as pessoas
 * de UM posto, não a tabela inteira — e um teto com truncagem silenciosa seria
 * pior que devolver tudo, porque esconderia justamente o pedaço antigo do
 * histórico que a visão `all` existe para mostrar. É a mesma forma do
 * `/options` do catálogo: array puro.
 */
export async function listWorkstationOccupants(workstationId: string, view: OccupancyView) {
  // Checar o posto ANTES: sem isto, um uuid de posto inexistente
  // responderia `[]` — "este posto não tem ninguém" — em vez de 404. As duas
  // coisas são diferentes e a tela decide coisas diferentes com cada uma
  // (posto vago é sinal operacional; posto inexistente é erro de quem chamou).
  //
  // `findUnique` e não `findFirst`: `Workstation` não tem `deletedAt` — o posto
  // segue a regra do status, sem lixeira (decisão Y).
  const posto = await prisma.workstation.findUnique({ where: { id: workstationId }, select: { id: true } });
  if (!posto) throw new AppError('Posto não encontrado.', 404);

  return prisma.workstationOccupant.findMany({
    where: { workstationId, ...buildViewWhere(view) },
    select: OCCUPANT_SELECT,
    orderBy: OCCUPANT_ORDER_BY,
  });
}
