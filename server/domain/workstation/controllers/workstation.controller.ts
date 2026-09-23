import type { FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import { workstationViewQuerySchema } from '../schemas/workstation.schema';
import { WORKSTATION_SORTABLE } from '../helpers/workstation-filters.helper';
import { listWorkstations } from '../use-cases/list-workstations.usecase';
import { getWorkstation } from '../use-cases/get-workstation.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e o `AppError` do
// use-case (404) sai por lá também, com a mensagem que ele escreveu.
export const workstationController = {
  async list(request: FastifyRequest) {
    // A query tem DOIS donos e por isso é separada antes de qualquer `parse`:
    // `view` é nosso (todos|vagos|ocupados) e o resto é do `parseListQuery`,
    // que é `strictObject` e recusaria uma chave que não conhece. Entregar a
    // query inteira a qualquer um dos dois daria 422 numa requisição válida.
    const { view: visaoCrua, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;

    const { view } = workstationViewQuerySchema.parse(
      visaoCrua === undefined ? {} : { view: visaoCrua },
    );

    const query = parseListQuery(paginacao, {
      sortable: WORKSTATION_SORTABLE,
      // Posto é lista para consultar, não fila de novidades: ordena por nome,
      // como o catálogo. E sem `trashable` — localização não tem lixeira (D8).
      defaultSort: 'name',
      defaultOrder: 'asc',
    });

    return listWorkstations(query, view);
  },

  async detail(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getWorkstation(id);
  },
};
