import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { USER_LIST_SELECT } from '../helpers/user-select.helper';
import { buildTrashWhere, buildUserWhere, type UserSortable } from '../helpers/user-filters.helper';

type LinhaCrua = Awaited<ReturnType<typeof buscarPagina>>[number];
type UserRow = LinhaCrua;

function buscarPagina(where: object, query: ListQuery<UserSortable>) {
  return prisma.user.findMany({
    where,
    // `USER_LIST_SELECT` e não o público: esta é a ÚNICA listagem que mostra a
    // coluna Departamento, e o join dele não tem o que fazer no select que viaja
    // embutido em toda posse e toda ocupação (D135).
    select: USER_LIST_SELECT,
    orderBy: { [query.sort]: query.order },
    skip: query.skip,
    take: query.take,
  });
}

export async function listUsers(query: ListQuery<UserSortable>): Promise<ListEnvelope<UserRow>> {
  const where = { ...buildUserWhere(query.q), ...buildTrashWhere(query.view) };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    buscarPagina(where, query),
  ]);

  // Sem achatamento nenhum: com o `DROP COLUMN users.department` aplicado (Etapa
  // J), a relação voltou a se chamar `department` no schema e o `USER_LIST_SELECT`
  // já devolve `{ id, name }` — que é o que o contrato da API sempre prometeu.
  return { total, rows };
}
