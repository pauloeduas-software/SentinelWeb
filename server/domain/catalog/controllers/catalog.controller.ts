import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { listCatalog } from '../use-cases/list-catalog.usecase';
import { listCatalogOptions } from '../use-cases/list-catalog-options.usecase';
import { createCatalog } from '../use-cases/create-catalog.usecase';
import { updateCatalog } from '../use-cases/update-catalog.usecase';
import { deleteCatalog } from '../use-cases/delete-catalog.usecase';
import type { CatalogSpec } from '../specs/catalog-spec.types';

// O schema do /options é montado a partir da spec: a tabela que não declara
// `optionFilter` nem aceita a chave — `?type=` nela vira 422 em vez de ser
// ignorado em silêncio, como no resto do sistema.
function buildOptionsQuerySchema(spec: CatalogSpec) {
  return z.strictObject({
    q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
      .transform((valor) => valor || undefined),
    ...(spec.optionFilter
      ? {
          [spec.optionFilter.campo]: z
            .enum(spec.optionFilter.valores, `${spec.optionFilter.campo}: valor inválido`)
            .optional(),
        }
      : {}),
  });
}

// Só HTTP. Sem try/catch e sem conversão na mão: o `parse` do schema rejeita e a
// rejeição cai no errorHandler, que devolve 422 com o campo que falhou.
//
// É uma FÁBRICA, não um objeto: cada tabela de catálogo recebe o seu conjunto de
// handlers já amarrado à própria spec, então nenhuma rota precisa descobrir em
// tempo de execução de qual tabela está falando.
export function createCatalogController(spec: CatalogSpec) {
  const optionsQuerySchema = buildOptionsQuerySchema(spec);

  return {
    async list(request: FastifyRequest) {
      const query = parseListQuery(request.query, {
        sortable: spec.sortable,
        defaultSort: spec.defaultSort,
        // Catálogo ordena por nome, não por data: é lista para consultar, não
        // fila de novidades. E `trashable` fica de fora — aqui não há lixeira (D8).
        defaultOrder: 'asc',
      });
      return listCatalog(spec, query);
    },

    async options(request: FastifyRequest) {
      const query = optionsQuerySchema.parse(request.query ?? {}) as Record<string, string | undefined>;
      const filtro = spec.optionFilter ? query[spec.optionFilter.campo] : undefined;
      return listCatalogOptions(spec, query.q, filtro);
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const data = spec.createSchema.parse(request.body ?? {}) as Record<string, unknown>;
      const registro = await createCatalog(spec, data, atorDaRequisicao(request));
      return reply.status(201).send(registro);
    },

    async update(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      const data = spec.updateSchema.parse(request.body ?? {}) as Record<string, unknown>;
      return updateCatalog(spec, id, data, atorDaRequisicao(request));
    },

    async remove(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      await deleteCatalog(spec, id, atorDaRequisicao(request));
      return { success: true };
    },
  };
}
