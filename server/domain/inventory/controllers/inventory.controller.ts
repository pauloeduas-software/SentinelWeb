import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { idParamSchema } from '../../shared/params.schema';
import { INVENTORY_SORTABLE } from '../helpers/inventory-filters.helper';
import { createInventoryItemSchema, updateInventoryItemSchema } from '../schemas/inventory.schema';
import { listInventoryItems } from '../use-cases/list-inventory-items.usecase';
import { getInventoryStats } from '../use-cases/inventory-stats.usecase';
import { createInventoryItem } from '../use-cases/create-inventory-item.usecase';
import { updateInventoryItem } from '../use-cases/update-inventory-item.usecase';
import { deleteInventoryItem } from '../use-cases/delete-inventory-item.usecase';
import { restoreInventoryItem } from '../use-cases/restore-inventory-item.usecase';

// Só HTTP. Sem try/catch e sem conversão na mão: o `parse` do schema rejeita e a
// rejeição cai no errorHandler, que devolve 422 com o campo que falhou.
export const inventoryController = {
  async list(request: FastifyRequest) {
    const query = parseListQuery(request.query, {
      sortable: INVENTORY_SORTABLE,
      defaultSort: 'createdAt',
      defaultOrder: 'desc',
      trashable: true,
    });
    return listInventoryItems(query);
  },

  // Contadores da sidebar: rodam fora da paginação, senão contariam só a página
  async stats() {
    return getInventoryStats();
  },

  async create(request: FastifyRequest, reply: FastifyReply) {
    const data = createInventoryItemSchema.parse(request.body ?? {});
    const item = await createInventoryItem(data);
    return reply.status(201).send(item);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateInventoryItemSchema.parse(request.body ?? {});
    return updateInventoryItem(id, data);
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await deleteInventoryItem(id);
    return { success: true };
  },

  async restore(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return restoreInventoryItem(id);
  },
};
