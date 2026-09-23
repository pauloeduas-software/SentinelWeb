import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { USER_SORTABLE } from '../helpers/user-filters.helper';
import { createUserSchema, offboardUserSchema, updateUserSchema } from '../schemas/user.schema';
import { listUsers } from '../use-cases/list-users.usecase';
import { listUserOptions } from '../use-cases/list-user-options.usecase';
import { getUser } from '../use-cases/get-user.usecase';
import { getUserHistory } from '../use-cases/user-history.usecase';
import { createUser } from '../use-cases/create-user.usecase';
import { updateUser } from '../use-cases/update-user.usecase';
import { deleteUser } from '../use-cases/delete-user.usecase';
import { offboardUser } from '../use-cases/offboard-user.usecase';
import { restoreUser } from '../use-cases/restore-user.usecase';

const optionsQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
});

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

  // Lista enxuta para `<select>`: a listagem pagina com teto de 100, o que é
  // certo para tabela e errado para seletor.
  async options(request: FastifyRequest) {
    const { q } = optionsQuerySchema.parse(request.query ?? {});
    return listUserOptions(q);
  },

  // UM colaborador, para a tela de perfil. Vem com o placar de posse aberta
  // porque é dele que o botão de desligamento tira o que mostrar antes de
  // confirmar — e é o mesmo número do 409 do DELETE.
  async get(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getUser(id);
  },

  // A LINHA DO TEMPO da pessoa. `limit` é opcional: o teto está no schema, o
  // padrão no use-case — quem não pede nada recebe os 100 mais recentes.
  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return getUserHistory(id, limit);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createUserSchema.parse(request.body ?? {});
    // O ator vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const user = await createUser(data, atorDaRequisicao(request));
    return reply.status(201).send(user);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateUserSchema.parse(request.body ?? {});
    return updateUser(id, data, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteUser(id, atorDaRequisicao(request));
    return { success: true };
  },

  // DESLIGAMENTO — devolve os ativos diretos, encerra as ocupações de posto e
  // marca a saída, numa transação só (D32). 200, e não 201: nada é criado, e o
  // corpo é o relatório do que a operação fechou — que é o que a tela mostra
  // depois de confirmar.
  async offboard(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = offboardUserSchema.parse(request.body ?? {});
    return offboardUser(id, data, atorDaRequisicao(request));
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreUser(id, atorDaRequisicao(request));
  },
};
