import type { FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { getPerson } from '../use-cases/get-person.usecase';
import { getPersonHistory } from '../use-cases/person-history.usecase';

export const personController = {
  // UM colaborador, para a ficha, com as unidades de estoque no nome dele.
  async get(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getPerson(id);
  },

  // A LINHA DO TEMPO da pessoa. `limit` é opcional: o teto está no schema, o
  // padrão no use-case — quem não pede nada recebe os 100 mais recentes.
  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return getPersonHistory(id, limit);
  },
};
