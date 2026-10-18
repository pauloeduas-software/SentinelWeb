import type { FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import { temCargo } from '../../access/helpers/require-permission';
import { workstationViewQuerySchema } from '../schemas/workstation.schema';
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

    // Sem `trashable` — localização não tem lixeira (D8).
    const query = parseListQuery(paginacao);

    return listWorkstations(query, view);
  },

  async detail(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // O CUSTO DOS ATIVOS DA MESA É DE `ADMIN` (D77), e esta rota vazava.
    //
    // A ficha do posto devolve os ativos entregues com o `ASSET_SELECT`
    // completo, e `purchaseCost` está nele: um `TECNICO` que abrisse
    // `/postos/:id` recebia o custo de compra de cada equipamento da mesa —
    // exatamente o que `tests/invariantes/dado-sensivel.test.ts` prova que
    // `/api/assets` e `/api/assets/:id` não fazem. O vazamento era por falta de
    // uma terceira porta, não por decisão: quem lê filtra, e esta é a leitura
    // que faltava. Mesma inversão do `actorId` (D23) — quem sabe quem está
    // pedindo é a borda.
    return getWorkstation(id, temCargo(request, 'ADMIN'));
  },
};
