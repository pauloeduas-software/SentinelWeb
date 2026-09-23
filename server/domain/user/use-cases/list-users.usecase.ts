import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';
import { buildTrashWhere, buildUserWhere, type UserSortable } from '../helpers/user-filters.helper';

type UserRow = Awaited<ReturnType<typeof buscarPagina>>[number];

function buscarPagina(where: object, query: ListQuery<UserSortable>) {
  return prisma.user.findMany({
    where,
    select: USER_PUBLIC_SELECT,
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

  return { total, rows };
}
