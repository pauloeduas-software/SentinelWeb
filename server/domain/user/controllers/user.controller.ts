import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';
import { listUsers } from '../use-cases/list-users.usecase';
import { createUser } from '../use-cases/create-user.usecase';
import { updateUser } from '../use-cases/update-user.usecase';
import { deleteUser } from '../use-cases/delete-user.usecase';

export const userController = {
  async list(request: FastifyRequest) {
    return listUsers(parseListQuery(request.query));
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createUserSchema.parse(request.body ?? {});
    const user = await createUser(data, atorDaRequisicao(request));
    return reply.status(201).send(user);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateUserSchema.parse(request.body ?? {});
    // Quem pede vem da SESSÃO, nunca do corpo: é o que a regra da própria conta
    // compara (W).
    return updateUser(id, data, request.user.id, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteUser(id, request.user.id, atorDaRequisicao(request));
    return { success: true };
  },
};
