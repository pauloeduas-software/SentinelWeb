import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { ASSET_SORTABLE, separarFiltrosDeAtivo } from '../helpers/asset-filters.helper';
import {
  bulkAssetsSchema, createAssetSchema, retireAssetSchema,
  serialParamSchema, updateAssetSchema,
} from '../schemas/asset.schema';
import { listAssets } from '../use-cases/list-assets.usecase';
import { listAssetOptions } from '../use-cases/list-asset-options.usecase';
import { exportAssets } from '../use-cases/export-assets.usecase';
import { globalSearch } from '../use-cases/global-search.usecase';
import { resolveTags } from '../use-cases/resolve-tags.usecase';
import { colunasDoExport } from '../helpers/asset-export-columns.helper';
import { cabecalhosDeCsv } from '../../shared/csv.helper';
import { lerConfiguracaoDoSistema } from '../../settings/helpers/system-settings.helper';
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
import { bulkUpdateAssets } from '../use-cases/bulk-update-assets.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou.

// Mesmo schema do `/options` de usuário: só `q`, e `strictObject` recusa o
// resto em vez de ignorar em silêncio.
const optionsQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
});

// O EXPORT (F10, Etapa C) — a busca e as colunas.
//
// `strictObject` sobre o que SOBROU depois de os filtros do ITAM saírem
// (`separarFiltrosDeAtivo`), e é ele que recusa `page`, `perPage` e `sort` com
// 422. A recusa é a resposta certa e não falta de zelo: exportar é levar tudo
// que o filtro alcança — paginar o arquivo não significa nada —, e a ordem é
// por `id` por causa do cursor (ver `export-assets.usecase.ts`). Aceitar os
// três em silêncio prometeria um recorte que o arquivo não tem.
const exportQuerySchema = z.strictObject({
  q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
    .transform((valor) => valor || undefined),
  columns: z.string().trim().max(1_000, 'columns: lista muito longa').optional(),
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

/** `?columns=assetTag,serial` → tokens. Vazio vira `undefined` (o padrão). */
function tokensDeColuna(columns: string | undefined): string[] | undefined {
  if (!columns) return undefined;
  const tokens = columns.split(',').map((token) => token.trim()).filter(Boolean);
  return tokens.length > 0 ? tokens : undefined;
}

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

  /**
   * O CSV da listagem, com os MESMOS filtros da tela (F10, Etapa C).
   *
   * `reply.send(stream)`: o arquivo não é montado em memória. O delimitador sai
   * da configuração (o Excel em português salva com `;`), e o BOM é escrito
   * pelo `csv.helper.ts` — sem ele todo acento sai quebrado.
   */
  async export(request: FastifyRequest, reply: FastifyReply) {
    const { filtros, paraOCore } = separarFiltrosDeAtivo(request.query);
    const { q, columns } = exportQuerySchema.parse(paraOCore);

    // A validação do token acontece ANTES de a resposta começar: depois do
    // primeiro byte não há mais como responder 422 — o cliente receberia um
    // arquivo truncado com status 200.
    // A ALLOWLIST DE COLUNAS PASSA A SER FILTRADA PELA PERMISSÃO (D77, a
    // obrigação cruzada): sem isto o CSV é a porta dos fundos do custo que a
    // listagem acabou de fechar.
    const escolhidas = colunasDoExport(
      tokensDeColuna(columns),
      (papel) => temPapel(request, papel as Parameters<typeof temPapel>[1]),
    );
    const { csvDelimiter } = await lerConfiguracaoDoSistema();

    return reply
      .headers(cabecalhosDeCsv('ativos'))
      .send(exportAssets(filtros, q, escolhidas, csvDelimiter));
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

  async bulk(request: FastifyRequest) {
    // A união discriminada devolve 422 quando a operação não existe ou quando
    // falta o campo que ELA exige — o controller não decide nada disso.
    const data = bulkAssetsSchema.parse(request.body ?? {});
    return bulkUpdateAssets(data, atorDaRequisicao(request));
  },
};
