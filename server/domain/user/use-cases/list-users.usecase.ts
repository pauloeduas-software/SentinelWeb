import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { USER_LIST_SELECT } from '../helpers/user-select.helper';
import { buildUserWhere } from '../helpers/user-filters.helper';

type LinhaCrua = Awaited<ReturnType<typeof buscarPagina>>[number];
type UserRow = LinhaCrua;

function buscarPagina(where: object, query: ListQuery) {
  return prisma.user.findMany({
    where,
    // `USER_LIST_SELECT` e não o público: a listagem de pessoas mostra colunas
    // que não têm o que fazer no select que viaja embutido em toda posse e toda
    // ocupação (D135).
    select: USER_LIST_SELECT,
    // Por NOME: é como se procura uma pessoa numa lista. O `id` desempata
    // homônimos, para a paginação não repetir nem pular ninguém.
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: query.skip,
    take: query.take,
  });
}

export async function listUsers(query: ListQuery): Promise<ListEnvelope<UserRow>> {
  const where = buildUserWhere(query.q);

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    buscarPagina(where, query),
  ]);

  return { total, rows };
}
