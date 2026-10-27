import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import {
  checkinStockSchema, checkoutStockSchema, createStockItemSchema, stockFiltersSchema,
  updateStockItemSchema,
} from '../schemas/stock.schema';
import { checkinStock } from '../use-cases/checkin-stock.usecase';
import { checkoutStock } from '../use-cases/checkout-stock.usecase';
import { createStockItem } from '../use-cases/create-stock-item.usecase';
import { deleteStockItem } from '../use-cases/delete-stock-item.usecase';
import { getStockItem } from '../use-cases/get-stock-item.usecase';
import { listStock } from '../use-cases/list-stock.usecase';
import { listStockCheckouts } from '../use-cases/list-stock-checkouts.usecase';
import { listAssetComponents } from '../use-cases/list-workstation-stock.usecase';
import { listStockHistory } from '../use-cases/stock-history.usecase';
import { updateStockItem } from '../use-cases/update-stock-item.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e os `AppError` dos
// use-cases (409 sem unidade, 404) saem pelo mesmo caminho.

/** As duas listas do detalhe — com quem está e o histórico — andam de 15 em 15, como as da licença. */
const POR_PAGINA_NO_DETALHE = 15;

export const stockController = {
  async list(request: FastifyRequest) {
    // A query tem DOIS donos e é separada antes de qualquer `parse`, como no
    // `license.controller.ts`: `categoryId` é nosso, o resto é do
    // `parseListQuery`, que é estrito e responderia 422 a uma chave que não
    // conhece. Sem `trashable` — o item não tem lixeira (AE) —, e sem abas: o
    // desativado fica na mesma lista, como nas Configurações.
    const { categoryId, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;
    const filtros = stockFiltersSchema.parse(categoryId === undefined ? {} : { categoryId });

    return listStock(parseListQuery(paginacao), filtros);
  },

  async byId(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getStockItem(id);
  },

  /** Quem está com o item agora — 15 entregas por página, com busca pelo nome. */
  async checkouts(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listStockCheckouts(id, parseListQuery(request.query, { perPage: POR_PAGINA_NO_DETALHE }));
  },

  /** Por onde o item passou — 15 por página, sem busca. */
  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listStockHistory(id, parseListQuery(request.query, { perPage: POR_PAGINA_NO_DETALHE, searchable: false }));
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createStockItemSchema.parse(request.body ?? {});
    // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const item = await createStockItem(data, atorDaRequisicao(request));
    return reply.status(201).send(item);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateStockItemSchema.parse(request.body ?? {});
    return updateStockItem(id, data, atorDaRequisicao(request));
  },

  /** Exclusão DEFINITIVA. Só o que está em uso impede (AG); o que pode voltar a ser comprado se desativa. */
  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    await deleteStockItem(id, atorDaRequisicao(request));
    return reply.status(204).send();
  },

  /** 201: a entrega CRIA uma linha por unidade. O corpo devolve as unidades e o disponível que ficou. */
  async checkout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutStockSchema.parse(request.body ?? {});
    const resultado = await checkoutStock(id, data, atorDaRequisicao(request));
    return reply.status(201).send(resultado);
  },

  /** 200: a devolução FECHA unidades que já existiam. O `:id` é o de uma unidade da ENTREGA. */
  /** Os componentes instalados num computador — a aba Componentes (AI). */
  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetComponents(id);
  },

  async checkin(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return checkinStock(id, checkinStockSchema.parse(request.body ?? {}), atorDaRequisicao(request));
  },
};
