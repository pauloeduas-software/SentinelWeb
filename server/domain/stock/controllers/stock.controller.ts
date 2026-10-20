import type { FastifyReply, FastifyRequest } from 'fastify';
import { SEM_PARAMETROS } from '../../../core/http/sem-parametros';
import { parseListQuery } from '../../../core/http/list-query';
import { historyQuerySchema } from '../../shared/history.schema';
import { idParamSchema } from '../../shared/params.schema';
import {
  adjustStockSchema, checkoutStockSchema, createStockItemSchema, stockFiltersSchema,
  updateStockItemSchema,
} from '../schemas/stock.schema';
import { adjustStock } from '../use-cases/adjust-stock.usecase';
import { checkinStock } from '../use-cases/checkin-stock.usecase';
import { checkoutStock } from '../use-cases/checkout-stock.usecase';
import { createStockItem } from '../use-cases/create-stock-item.usecase';
import { deleteStockItem } from '../use-cases/delete-stock-item.usecase';
import { getStockItem } from '../use-cases/get-stock-item.usecase';
import { listStock } from '../use-cases/list-stock.usecase';
import { listStockMovements } from '../use-cases/list-stock-movements.usecase';
import { restoreStockItem } from '../use-cases/restore-stock-item.usecase';
import { updateStockItem } from '../use-cases/update-stock-item.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e os `AppError` dos
// use-cases (409 sem unidade, 404) saem pelo mesmo caminho.
export const stockController = {
  async list(request: FastifyRequest) {
    // `categoryId` sai ANTES do `parseListQuery`, que é estrito e responderia
    // 422 a uma chave que não conhece — o mesmo corte do `endpoint.controller.ts`.
    const { categoryId, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;
    const filtros = stockFiltersSchema.parse(categoryId === undefined ? {} : { categoryId });

    const query = parseListQuery(paginacao, {
      // O item tem lixeira: `?view=trashed` a lista.
      trashable: true,
    });
    return listStock(query, filtros);
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getStockItem(id);
  },

  async movements(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return listStockMovements(id, limit);
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createStockItemSchema.parse(request.body ?? {});
    const item = await createStockItem(data);
    return reply.status(201).send(item);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateStockItemSchema.parse(request.body ?? {});
    return updateStockItem(id, data);
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteStockItem(id);
    return { success: true };
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreStockItem(id);
  },

  async adjust(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = adjustStockSchema.parse(request.body ?? {});
    // 201: a entrada ou a baixa CRIA uma linha de movimento.
    const resultado = await adjustStock(id, data);
    return reply.status(201).send(resultado);
  },

  async checkout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutStockSchema.parse(request.body ?? {});
    // 201: a saída CRIA uma linha por unidade. O corpo devolve as unidades e o
    // disponível que ficou, porque a tela precisa dos dois.
    const resultado = await checkoutStock(id, data);
    return reply.status(201).send(resultado);
  },

  async checkin(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // A devolução não leva nota nem nada: o corpo, se vier, é vazio.
    SEM_PARAMETROS.parse(request.body ?? {});
    // 200, e não 201: a devolução FECHA a linha que já existia.
    return checkinStock(id);
  },
};
