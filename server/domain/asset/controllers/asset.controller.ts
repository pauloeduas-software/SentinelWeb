import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { separarFiltrosDeAtivo } from '../helpers/asset-filters.helper';
import { custoSoDoAdmin } from '../helpers/asset-select.helper';
import { createAssetSchema, retireAssetSchema, updateAssetSchema } from '../schemas/asset.schema';
import { listAssets } from '../use-cases/list-assets.usecase';
import { listAssetOptions } from '../use-cases/list-asset-options.usecase';
import { globalSearch } from '../use-cases/global-search.usecase';
import { getAssetStats } from '../use-cases/asset-stats.usecase';
import { createAsset } from '../use-cases/create-asset.usecase';
import { updateAsset } from '../use-cases/update-asset.usecase';
import { deleteAsset } from '../use-cases/delete-asset.usecase';
import { restoreAsset } from '../use-cases/restore-asset.usecase';
import { findAssetById } from '../use-cases/find-asset-by-id.usecase';
// A BORDA é quem sabe quem está pedindo: o use-case recebe um booleano e não
// conhece `request`.
import { temCargo } from '../../access/helpers/require-permission';
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

/**
 * A BUSCA GLOBAL (F10, Etapa G) — só `q`, e ela é OBRIGATÓRIA.
 *
 * O teto de 300 caracteres é maior que os 200 da busca de listagem porque o
 * campo recebia a URL inteira do QR. O passo do QR saiu e o teto ficou: a
 * etiqueta vai até 200 caracteres (`shared/fields.schema.ts`) e a série até 150
 * (`asset.schema.ts`), então 300 não recusa nada que o banco consiga guardar.
 */
const buscaGlobalSchema = z.strictObject({
  q: z.string('informe o que buscar').trim().min(1, 'busca vazia').max(300, 'busca: máximo de 300 caracteres'),
});

export const assetController = {
  async list(request: FastifyRequest) {
    // A vista e os filtros do ITAM saem PRIMEIRO. O parser do `core` valida com
    // `strictObject` e responderia 422 a `?statusId=` ou
    // `?view=retired` — que ele, por decisão de camada, não conhece (D20).
    const { filtros, paraOCore } = separarFiltrosDeAtivo(request.query);

    const query = parseListQuery(paraOCore, {
      // `trashable` fica FALSO mesmo havendo lixeira: quem cuida de `?view=`
      // aqui é o domínio, que entende as três vistas em vez de duas. Ligado, o
      // `core` também declararia a chave e as duas validações brigariam pela
      // mesma palavra.
      trashable: false,
    });

    return listAssets(query, filtros, temCargo(request, 'ADMIN'));
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return findAssetById(id, temCargo(request, 'ADMIN'));
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return getAssetHistory(id, limit);
  },

  async stats() {
    return getAssetStats();
  },

  /**
   * A BUSCA DO LEITOR (F10, Etapa G).
   *
   * Mora no controller do ATIVO porque é ativo que ela procura — a rota é que é
   * global (`/api/search`), não o domínio. Pôr isto no domínio da etiqueta
   * faria o leitor de código depender de quem desenha adesivo.
   */
  async search(request: FastifyRequest) {
    const { q } = buscaGlobalSchema.parse(request.query ?? {});
    return globalSearch(q);
  },

  async options(request: FastifyRequest) {
    const { q, maquina } = optionsQuerySchema.parse(request.query ?? {});
    return listAssetOptions(q, { semMaquina: maquina === 'sem' });
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = custoSoDoAdmin(createAssetSchema.parse(request.body ?? {}), temCargo(request, 'ADMIN'));
    // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const ativo = await createAsset(data, atorDaRequisicao(request));
    return reply.status(201).send(ativo);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = custoSoDoAdmin(updateAssetSchema.parse(request.body ?? {}), temCargo(request, 'ADMIN'));
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
