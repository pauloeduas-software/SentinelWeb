import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../infra/http/list-query';
import { filtroDeAtivo } from '../../shared/fields.schema';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';
import { listUsers } from '../use-cases/list-users.usecase';
import { getUserStats } from '../use-cases/user-stats.usecase';
import { createUser } from '../use-cases/create-user.usecase';
import { updateUser } from '../use-cases/update-user.usecase';
import { deleteUser } from '../use-cases/delete-user.usecase';
import { resetUserPassword } from '../use-cases/reset-user-password.usecase';

export const userController = {
  async list(request: FastifyRequest) {
    // `isActive` sai antes do `parseListQuery`, que é estrito e responderia 422 a
    // uma chave que não conhece.
    const { isActive, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;
    return listUsers(parseListQuery(paginacao), filtroDeAtivo.parse(isActive));
  },

  async stats() {
    return getUserStats();
  },

  /** A conta nasce com a senha temporária (AU), que sai uma vez, na resposta. */
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

  /** A senha temporária de outra conta (AR). Sai uma vez, na resposta. */
  async resetPassword(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return resetUserPassword(id, request.user.id, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteUser(id, request.user.id, atorDaRequisicao(request));
    return { success: true };
  },
};
