import type { FastifyRequest } from 'fastify';
import { temCargo } from '../../access/helpers/require-permission';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { getPerson } from '../use-cases/get-person.usecase';
import { getPersonHistory } from '../use-cases/person-history.usecase';

export const personController = {
  // UM colaborador, para a ficha, com as unidades de estoque no nome dele. O
  // excluído abre só para quem vê a Lixeira (CF, AV).
  async get(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getPerson(id, temCargo(request, 'SUPERVISOR'));
  },

  // A LINHA DO TEMPO da pessoa. `limit` é opcional: o teto está no schema, o
  // padrão no use-case — quem não pede nada recebe os 100 mais recentes.
  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit, page } = historyQuerySchema.parse(request.query ?? {});
    return getPersonHistory(id, limit, page, temCargo(request, 'SUPERVISOR'));
  },
};
