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
import { restoreCatalog } from '../use-cases/restore-catalog.usecase';
import type { CatalogSpec } from '../specs/catalog-spec.types';

// O schema do /options é montado a partir da spec: a tabela que não declara
// `optionFilter` nem aceita a chave — `?type=` nela vira 422 em vez de ser
// ignorado em silêncio, como no resto do sistema.
//
// Um valor ou vários, separados por vírgula: o item de estoque escolhe entre as
// categorias de Estoque, Componente e Consumível (`?type=STOCK,COMPONENT,CONSUMABLE`,
// AI e AJ).
function buildOptionsQuerySchema(spec: CatalogSpec) {
  return z.strictObject({
    q: z.string().trim().max(200, 'busca: máximo de 200 caracteres').optional()
      .transform((valor) => valor || undefined),
    // `?inativos=incluir`: o FILTRO de uma listagem precisa achar o desativado
    // (os notebooks antigos continuam na categoria que saiu de linha); o
    // `<select>` de um formulário, não. Um valor só, e não um booleano, para a
    // URL dizer o que faz.
    inativos: z.enum(['incluir'], 'inativos: use "incluir"').optional(),
    ...(spec.optionFilter
      ? {
          [spec.optionFilter.campo]: z
            .string()
            .transform((valor) => valor.split(','))
            .pipe(z.array(z.enum(spec.optionFilter.valores, `${spec.optionFilter.campo}: valor inválido`)))
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

  // O MESMO filtro do `/options`, com a mesma allowlist de valores, para a
  // listagem da tela de Configurações separar as categorias por tipo.
  const filtroDaLista = spec.optionFilter
    ? {
        campo: spec.optionFilter.campo,
        schema: z.enum(spec.optionFilter.valores, `${spec.optionFilter.campo}: valor inválido`).optional(),
      }
    : null;

  return {
    async list(request: FastifyRequest) {
      // O filtro da spec (`?type=` nas categorias) sai ANTES do `parseListQuery`,
      // que é estrito e não o conhece. Na tabela sem `optionFilter` nada sai, e
      // a chave continua sendo 422 lá dentro.
      const paginacao = { ...((request.query ?? {}) as Record<string, unknown>) };
      let filtro: string | undefined;
      if (filtroDaLista) {
        filtro = filtroDaLista.schema.parse(paginacao[filtroDaLista.campo]);
        delete paginacao[filtroDaLista.campo];
      }

      // Sem `trashable` — aqui não há lixeira (D8).
      // `?view=trashed` só existe na tabela com lixeira: nas outras, a chave é 422.
      const query = parseListQuery(paginacao, { trashable: spec.lixeira === true });
      return listCatalog(spec, query, filtro);
    },

    async options(request: FastifyRequest) {
      const query = optionsQuerySchema.parse(request.query ?? {}) as { q?: string; inativos?: string } & Record<string, unknown>;
      const filtro = spec.optionFilter ? query[spec.optionFilter.campo] as string[] | undefined : undefined;
      return listCatalogOptions(spec, query.q, filtro, query.inativos === 'incluir');
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const data = spec.createSchema.parse(request.body ?? {}) as Record<string, unknown>;
      // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
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

    async restore(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      return restoreCatalog(spec, id, atorDaRequisicao(request));
    },
  };
}
