import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import { adjustQuantitySchema } from '../schemas/stock.schema';
import { listStock } from '../use-cases/list-stock.usecase';
import { getStockItem } from '../use-cases/get-stock-item.usecase';
import { createStockItem } from '../use-cases/create-stock-item.usecase';
import { updateStockItem } from '../use-cases/update-stock-item.usecase';
import { deleteStockItem } from '../use-cases/delete-stock-item.usecase';
import { restoreStockItem } from '../use-cases/restore-stock-item.usecase';
import { adjustQuantity } from '../use-cases/adjust-quantity.usecase';
import { listItemMovements } from '../use-cases/list-item-movements.usecase';
import type { ZodType } from 'zod';

// O CRUD dos três tipos, montado a partir da spec — sete handlers escritos uma
// vez em vez de vinte e um quase idênticos (D35).
//
// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e os `AppError` dos
// use-cases (409 de sem unidade, 404 de item inexistente) saem pelo mesmo
// caminho, sem ninguém montar resposta de erro na mão.

export interface SchemasDoTipo {
  create: ZodType;
  update: ZodType;
}

export function crudController(spec: StockKindSpec, schemas: SchemasDoTipo) {
  return {
    async list(request: FastifyRequest) {
      const query = parseListQuery(request.query, {
        sortable: spec.sortable,
        defaultSort: 'name',
        defaultOrder: 'asc',
        // Os três TÊM lixeira, ao contrário do catálogo (D36) — então `?view=`
        // é do `core` aqui, e não do domínio como em `/api/assets` (D20): não
        // existe uma terceira vista de estoque para o `core` não entender.
        trashable: true,
      });

      return listStock(spec, query);
    },

    async byId(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      return getStockItem(spec, id);
    },

    /** A movimentação: as saídas e os ajustes, unidos na leitura. */
    async movements(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      const { limit } = historyQuerySchema.parse(request.query ?? {});
      return listItemMovements(spec, id, limit);
    },

    async create(request: FastifyRequest, reply: FastifyReply) {
      const data = schemas.create.parse(request.body ?? {}) as Record<string, unknown>;
      const item = await createStockItem(spec, data, atorDaRequisicao(request));
      return reply.status(201).send(item);
    },

    async update(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      // `qty` no corpo responde 422 AQUI, pelo `strictObject` que não declara a
      // chave — não por uma checagem no use-case. Ver `schemas/stock.schema.ts`.
      const data = schemas.update.parse(request.body ?? {}) as Record<string, unknown>;
      return updateStockItem(spec, id, data, atorDaRequisicao(request));
    },

    async remove(request: FastifyRequest, reply: FastifyReply) {
      const { id } = idParamSchema.parse(request.params);
      await deleteStockItem(spec, id, atorDaRequisicao(request));
      return reply.status(204).send();
    },

    async restore(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      return restoreStockItem(spec, id, atorDaRequisicao(request));
    },

    /**
     * 200, e não 201: o ajuste não cria um recurso que alguém vá buscar por
     * URL. Ele devolve o ITEM com o saldo recalculado, que é o que a tela
     * precisa repintar, e a linha de log junto como comprovante.
     */
    async adjust(request: FastifyRequest) {
      const { id } = idParamSchema.parse(request.params);
      const data = adjustQuantitySchema.parse(request.body ?? {});
      return adjustQuantity(spec, id, data, atorDaRequisicao(request));
    },
  };
}
