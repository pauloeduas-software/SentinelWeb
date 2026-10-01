import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { prisma } from '../../../core/database/prismaClient';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { fieldsetQuerySchema, revealParamsSchema } from '../../custom-field/schemas/custom-field.schema';
import { resolveFieldset } from '../../custom-field/use-cases/resolve-fieldset.usecase';
import { revealCustomField } from '../../custom-field/use-cases/reveal-custom-field.usecase';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { ASSET_SORTABLE, separarFiltrosDeAtivo } from '../helpers/asset-filters.helper';
import {
  bulkAssetsSchema, createAssetSchema, retireAssetSchema,
  serialParamSchema, updateAssetSchema,
} from '../schemas/asset.schema';
import { listAssets } from '../use-cases/list-assets.usecase';
import { listAssetOptions } from '../use-cases/list-asset-options.usecase';
import { getAssetStats } from '../use-cases/asset-stats.usecase';
import { createAsset } from '../use-cases/create-asset.usecase';
import { updateAsset } from '../use-cases/update-asset.usecase';
import { deleteAsset } from '../use-cases/delete-asset.usecase';
import { restoreAsset } from '../use-cases/restore-asset.usecase';
import { findAssetBySerial } from '../use-cases/find-asset-by-serial.usecase';
import { findAssetById } from '../use-cases/find-asset-by-id.usecase';
import { getAssetHistory } from '../use-cases/asset-history.usecase';
import { retireAsset } from '../use-cases/retire-asset.usecase';
import { unretireAsset } from '../use-cases/unretire-asset.usecase';
import { bulkUpdateAssets } from '../use-cases/bulk-update-assets.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou.

// Mesmo schema do `/options` de usuário: só `q`, e `strictObject` recusa o
// resto em vez de ignorar em silêncio.
const optionsQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
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

    return listAssets(query, filtros);
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return findAssetById(id);
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return getAssetHistory(id, limit);
  },

  async stats() {
    return getAssetStats();
  },

  async options(request: FastifyRequest) {
    const { q } = optionsQuerySchema.parse(request.query ?? {});
    return listAssetOptions(q);
  },

  async bySerial(request: FastifyRequest) {
    const { serial } = serialParamSchema.parse(request.params);
    return findAssetBySerial(serial);
  },

  /**
   * O CONJUNTO DE CAMPOS CUSTOMIZADOS de um modelo (F9, D58).
   *
   * Por `?modelId=` e não por ativo: o formulário precisa dos campos no instante
   * em que o usuário escolhe o modelo no `<select>`, ANTES de o ativo existir. É
   * no cadastro que os campos obrigatórios mais importam.
   */
  async fieldset(request: FastifyRequest) {
    const { modelId } = fieldsetQuerySchema.parse(request.query ?? {});
    return resolveFieldset(prisma, modelId);
  },

  /**
   * REVELAR um campo cifrado (F9, D62). GET, como o `/product-key` da F6.
   *
   * ⚠️ Ela GRAVA `ActivityLog` — é o ponto do sistema em que uma LEITURA é o
   * fato auditável, porque um segredo revelado não pode ser "des-revelado". Um
   * GET que escreve contraria o hábito de propósito, e a razão é a mesma da F6:
   * a tela pede um valor, e a resposta certa a "quem viu isto?" só existe se o
   * registro acontecer no mesmo caminho.
   */
  async revealCustomField(request: FastifyRequest) {
    const { id, slug } = revealParamsSchema.parse(request.params);
    return revealCustomField(id, slug, atorDaRequisicao(request));
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

  async bulk(request: FastifyRequest) {
    // A união discriminada devolve 422 quando a operação não existe ou quando
    // falta o campo que ELA exige — o controller não decide nada disso.
    const data = bulkAssetsSchema.parse(request.body ?? {});
    return bulkUpdateAssets(data, atorDaRequisicao(request));
  },
};
