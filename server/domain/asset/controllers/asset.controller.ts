import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { ASSET_SORTABLE, separarFiltrosDeAtivo } from '../helpers/asset-filters.helper';
import {
  createAssetSchema, retireAssetSchema,
  serialParamSchema, updateAssetSchema,
} from '../schemas/asset.schema';
import { listAssets } from '../use-cases/list-assets.usecase';
import { listAssetOptions } from '../use-cases/list-asset-options.usecase';
import { globalSearch } from '../use-cases/global-search.usecase';
import { resolveTags } from '../use-cases/resolve-tags.usecase';
import { getAssetStats } from '../use-cases/asset-stats.usecase';
import { createAsset } from '../use-cases/create-asset.usecase';
import { updateAsset } from '../use-cases/update-asset.usecase';
import { deleteAsset } from '../use-cases/delete-asset.usecase';
import { restoreAsset } from '../use-cases/restore-asset.usecase';
import { findAssetBySerial } from '../use-cases/find-asset-by-serial.usecase';
import { findAssetById } from '../use-cases/find-asset-by-id.usecase';
// A BORDA é quem sabe quem está pedindo (D23, mesma inversão do `actorId`): o
// use-case recebe um booleano e não conhece `request`.
import { temPapel } from '../../access/helpers/require-permission';
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
});

/**
 * A BUSCA GLOBAL (F10, Etapa G) — só `q`, e ela é OBRIGATÓRIA.
 *
 * Teto de 300 caracteres e não os 200 da busca de listagem: aqui o campo também
 * recebe a URL inteira do QR, que num domínio longo passa dos 200 (D70).
 */
const buscaGlobalSchema = z.strictObject({
  q: z.string('informe o que buscar').trim().min(1, 'busca vazia').max(300, 'busca: máximo de 300 caracteres'),
});

/**
 * A lista bipada (F10, Etapa G).
 *
 * `POST` numa rota que só LÊ, pelo mesmo motivo do report builder: a entrada é
 * um ARRAY de até 500 termos, e isso não cabe numa query string.
 */
const resolveTagsSchema = z.strictObject({
  termos: z
    .array(z.string().trim().max(300, 'termo: máximo de 300 caracteres'), 'informe as etiquetas')
    .min(1, 'bipe ou cole ao menos uma etiqueta')
    .max(500, 'no máximo 500 etiquetas por vez'),
});

export const assetController = {
  async list(request: FastifyRequest) {
    // A vista e os filtros do ITAM saem PRIMEIRO. O parser do `core` valida com
    // `strictObject` e responderia 422 a `?statusId=`, `?relatorio=` ou
    // `?view=retired` — que ele, por decisão de camada, não conhece (D20).
    const { filtros, paraOCore } = separarFiltrosDeAtivo(request.query);

    const query = parseListQuery(paraOCore, {
      sortable: ASSET_SORTABLE,
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
      // `trashable` fica FALSO mesmo havendo lixeira: quem cuida de `?view=`
      // aqui é o domínio, que entende as três vistas em vez de duas. Ligado, o
      // `core` também declararia a chave e as duas validações brigariam pela
      // mesma palavra.
      trashable: false,
    });

    return listAssets(query, filtros, temPapel(request, 'ADMIN'));
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return findAssetById(id, temPapel(request, 'ADMIN'));
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

  /** Resolve uma lista de etiquetas/séries/QRs bipados (F10, Etapa G). */
  async resolveTags(request: FastifyRequest) {
    const { termos } = resolveTagsSchema.parse(request.body ?? {});
    return resolveTags(termos);
  },

  async options(request: FastifyRequest) {
    const { q } = optionsQuerySchema.parse(request.query ?? {});
    return listAssetOptions(q);
  },


  async bySerial(request: FastifyRequest) {
    const { serial } = serialParamSchema.parse(request.params);
    return findAssetBySerial(serial);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createAssetSchema.parse(request.body ?? {});
    // O ator vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const ativo = await createAsset(data, atorDaRequisicao(request));
    return reply.status(201).send(ativo);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateAssetSchema.parse(request.body ?? {});
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
