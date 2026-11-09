import { prisma } from '../../../infra/database/prismaClient';
import { INCLUINDO_LIXEIRA } from '../../../infra/database/soft-delete.extension';
import { AppError } from '../../../infra/errors/app-error';
import { OCCUPANT_ORDER_BY, buildViewWhere, type OccupancyView } from '../helpers/occupancy-filters.helper';
import { OCCUPANT_SELECT } from '../helpers/occupant-select.helper';

/**
 * Os postos que uma pessoa ocupa — a mesma tabela da listagem por posto,
 * lida pelo outro lado.
 *
 * É metade da resposta de "quais ativos a Laura responde?"
 * (docs/referencia/modelo-de-posse.md): a outra metade são as assignments com alvo PERSON dela.
 * Esta rota devolve os POSTOS, não os ativos — quem junta os dois é a Camada 3,
 * e é ela que precisa desta consulta indexada por `personId`.
 *
 * O índice `("personId", "endedAt")` existe exatamente para este acesso: sem ele
 * a pergunta vira varredura da tabela de ocupações inteira.
 */
export async function listPersonOccupancies(personId: string, view: OccupancyView, podeVerLixeira = false) {
  // `findFirst`, não `findUnique`: só o primeiro recebe o escopo da lixeira da
  // extension (infra/database/soft-delete.extension.ts). Colaborador na lixeira
  // responde 404, menos para quem vê a Lixeira: a ficha dele abre só para
  // consulta (CF).
  const pessoa = await prisma.person.findFirst({
    where: { id: personId, ...(podeVerLixeira ? INCLUINDO_LIXEIRA : {}) },
    select: { id: true },
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  return prisma.workstationOccupant.findMany({
    where: { personId, ...buildViewWhere(view) },
    select: OCCUPANT_SELECT,
    orderBy: OCCUPANT_ORDER_BY,
  });
}
