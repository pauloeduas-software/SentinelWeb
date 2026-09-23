import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { OCCUPANT_ORDER_BY, buildViewWhere, type OccupancyView } from '../helpers/occupancy-filters.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';

/**
 * Os postos que uma pessoa ocupa — a mesma tabela da listagem por localização,
 * lida pelo outro lado.
 *
 * É metade da resposta de "quais ativos a Laura responde?"
 * (docs/MODELO-POSSE.md): a outra metade são as assignments com alvo USER dela.
 * Esta rota devolve os POSTOS, não os ativos — quem junta os dois é a Camada 3,
 * e é ela que precisa desta consulta indexada por `userId`.
 *
 * O índice `("userId", "endedAt")` existe exatamente para este acesso: sem ele
 * a pergunta vira varredura da tabela de ocupações inteira.
 */
export async function listUserOccupancies(userId: string, view: OccupancyView) {
  // `findFirst`, não `findUnique`: só o primeiro recebe o escopo da lixeira da
  // extension (core/database/soft-delete.extension.ts), porque o `where` do
  // `findUnique` só admite campo único. Colaborador na lixeira responde 404 —
  // as ocupações dele continuam gravadas (o histórico é append-only), mas
  // ninguém as consulta por um cadastro que foi excluído.
  const pessoa = await prisma.user.findFirst({ where: { id: userId }, select: { id: true } });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  return prisma.locationOccupant.findMany({
    where: { userId, ...buildViewWhere(view) },
    select: OCCUPANT_SELECT,
    orderBy: OCCUPANT_ORDER_BY,
  });
}
