import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../infra/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { statsQuerySchema } from '../../shared/stats.schema';
import { separarFiltrosDeAtivo } from '../helpers/asset-filters.helper';
import { custoSoDoSupervisor } from '../helpers/asset-select.helper';
import { createAssetSchema, retireAssetSchema, updateAssetSchema } from '../schemas/asset.schema';
import { listAssets } from '../use-cases/list-assets.usecase';
import { listAssetOptions } from '../use-cases/list-asset-options.usecase';
import { getAssetStats } from '../use-cases/asset-stats.usecase';
import { createAsset } from '../use-cases/create-asset.usecase';
import { updateAsset } from '../use-cases/update-asset.usecase';
import { deleteAsset } from '../use-cases/delete-asset.usecase';
import { restoreAsset } from '../use-cases/restore-asset.usecase';
import { findAssetById } from '../use-cases/find-asset-by-id.usecase';
// A BORDA é quem sabe quem está pedindo: o use-case recebe um booleano e não
// conhece `request`.
import { exigirPermissao, temCargo } from '../../access/helpers/require-permission';
import { getAssetHistory } from '../use-cases/asset-history.usecase';
import { retireAsset } from '../use-cases/retire-asset.usecase';
import { unretireAsset } from '../use-cases/unretire-asset.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou.

// Mesmo schema do `/options` de usuário: só `q`, e `strictObject` recusa o
// resto em vez de ignorar em silêncio.
const optionsQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
  // `?maquina=sem`: só ativo SEM máquina vinculada — o seletor do vínculo em
  // `/descobertas`, onde ativo que já tem máquina é opção que o `@unique`
  // recusa. Enum de um valor, como o `?vinculo=` das máquinas: valor errado é
  // 422, não filtro ignorado.
  maquina: z.enum(['sem'], 'máquina: use sem').optional(),
});

export const assetController = {
  async list(request: FastifyRequest) {
    // A vista e os filtros do ITAM saem PRIMEIRO. O parser do `core` valida com
    // `strictObject` e responderia 422 a `?statusType=` ou
    // `?view=retired` — que ele, por decisão de camada, não conhece (D20).
    const { filtros, paraOCore } = separarFiltrosDeAtivo(request.query);
    // A LIXEIRA é `SUPERVISOR` (AV): a rota da listagem é do Técnico, e a vista
    // dela não se separa no mapa de rotas.
    if (filtros.view === 'trashed') exigirPermissao(request, 'SUPERVISOR');

    const query = parseListQuery(paraOCore, {
      // `trashable` fica FALSO mesmo havendo lixeira: quem cuida de `?view=`
      // aqui é o domínio, que entende as três vistas em vez de duas. Ligado, o
      // `core` também declararia a chave e as duas validações brigariam pela
      // mesma palavra.
      trashable: false,
    });

    return listAssets(query, filtros, temCargo(request, 'SUPERVISOR'));
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // O custo e a lixeira são os dois do Supervisor (D77, AV).
    const supervisor = temCargo(request, 'SUPERVISOR');
    return findAssetById(id, supervisor, supervisor);
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit, page } = historyQuerySchema.parse(request.query ?? {});
    return getAssetHistory(id, limit, page, temCargo(request, 'SUPERVISOR'));
  },

  async stats(request: FastifyRequest) {
    const { categoryId } = statsQuerySchema.parse(request.query ?? {});
    return getAssetStats(categoryId);
  },

  async options(request: FastifyRequest) {
    const { q, maquina } = optionsQuerySchema.parse(request.query ?? {});
    return listAssetOptions(q, { semMaquina: maquina === 'sem' });
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = custoSoDoSupervisor(createAssetSchema.parse(request.body ?? {}), temCargo(request, 'SUPERVISOR'));
    // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const ativo = await createAsset(data, atorDaRequisicao(request));
    return reply.status(201).send(ativo);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = custoSoDoSupervisor(updateAssetSchema.parse(request.body ?? {}), temCargo(request, 'SUPERVISOR'));
    return updateAsset(id, data, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteAsset(id, atorDaRequisicao(request));
    return { success: true };
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreAsset(id, atorDaRequisicao(request));
  },

  async retire(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = retireAssetSchema.parse(request.body ?? {});
    return retireAsset(id, data, atorDaRequisicao(request));
  },

  async unretire(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return unretireAsset(id, atorDaRequisicao(request));
  },
};
