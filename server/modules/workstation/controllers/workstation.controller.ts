import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../infra/http/list-query';
import { historyQuerySchema } from '../../shared/history.schema';
import { idParamSchema } from '../../shared/params.schema';
import { temCargo } from '../../access/helpers/require-permission';
import { workstationViewQuerySchema } from '../schemas/workstation.schema';
import { listWorkstations } from '../use-cases/list-workstations.usecase';
import { getWorkstation } from '../use-cases/get-workstation.usecase';
import { getWorkstationHistory } from '../use-cases/workstation-history.usecase';
import { getWorkstationStats } from '../use-cases/workstation-stats.usecase';
import { listWorkstationOptions } from '../use-cases/list-workstation-options.usecase';

// O `/options` do posto é o do catálogo com um recorte a mais, e por isso tem
// schema próprio, como o dos computadores (`asset.controller.ts`).
const optionsQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
  // `?computador=sem`: só posto SEM computador entregue. Enum de um valor, como o
  // `?maquina=` dos computadores: valor errado é 422, não filtro ignorado.
  computador: z.enum(['sem'], 'computador: use sem').optional(),
});

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e o `AppError` do
// use-case (404) sai por lá também, com a mensagem que ele escreveu.
export const workstationController = {
  async list(request: FastifyRequest) {
    // A query tem DOIS donos e por isso é separada antes de qualquer `parse`:
    // `view` é nosso (todos|vagos|ocupados|sem-uso) e o resto é do `parseListQuery`,
    // que é `strictObject` e recusaria uma chave que não conhece. Entregar a
    // query inteira a qualquer um dos dois daria 422 numa requisição válida.
    const { view: visaoCrua, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;

    const { view } = workstationViewQuerySchema.parse(
      visaoCrua === undefined ? {} : { view: visaoCrua },
    );

    // Sem `trashable` — o posto não tem lixeira.
    const query = parseListQuery(paginacao);

    return listWorkstations(query, view);
  },

  async stats() {
    return getWorkstationStats();
  },

  async options(request: FastifyRequest) {
    const { q, computador } = optionsQuerySchema.parse(request.query ?? {});
    return listWorkstationOptions(q, { semComputador: computador === 'sem' });
  },

  async detail(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // O CUSTO DOS ATIVOS DA MESA É DE `SUPERVISOR` (D77), e esta rota vazava.
    //
    // A ficha do posto devolve os ativos entregues com o `ASSET_SELECT`
    // completo, e `purchaseCost` está nele: quem não fosse `SUPERVISOR` e abrisse
    // `/postos/:id` recebia o custo de compra de cada equipamento da mesa —
    // exatamente o que `tests/invariantes/dado-sensivel.test.ts` prova que
    // `/api/assets` e `/api/assets/:id` não fazem. O vazamento era por falta de
    // uma terceira porta, não por decisão: quem lê filtra, e esta é a leitura
    // que faltava. Quem sabe quem está pedindo é a borda.
    return getWorkstation(id, temCargo(request, 'SUPERVISOR'));
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit, page } = historyQuerySchema.parse(request.query ?? {});
    return getWorkstationHistory(id, limit, page);
  },
};
