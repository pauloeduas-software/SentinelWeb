import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import { USER_SORTABLE } from '../helpers/user-filters.helper';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';
import { listUsers } from '../use-cases/list-users.usecase';
import { createUser } from '../use-cases/create-user.usecase';
import { updateUser } from '../use-cases/update-user.usecase';
import { deleteUser } from '../use-cases/delete-user.usecase';
import { restoreUser } from '../use-cases/restore-user.usecase';

export const userController = {
  async list(request: FastifyRequest) {
    const query = parseListQuery(request.query, {
      sortable: USER_SORTABLE,
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
      trashable: true,
    });
    return listUsers(query);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createUserSchema.parse(request.body ?? {});
    const user = await createUser(data);
    return reply.status(201).send(user);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateUserSchema.parse(request.body ?? {});
    return updateUser(id, data);
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteUser(id);
    return { success: true };
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreUser(id);
  },
};
