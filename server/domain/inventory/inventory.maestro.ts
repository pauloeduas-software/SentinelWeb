import type { FastifyInstance } from 'fastify';
import { inventoryController } from './controllers/inventory.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('inventory.maestro');

// Ativos cadastrados à mão (model `InventoryItem`) — o lado ITAM do produto.
export class InventoryMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/inventory', inventoryController.list);
    server.get('/api/inventory/stats', inventoryController.stats);
    server.post('/api/inventory', WRITE_RATE_LIMIT, inventoryController.create);
    server.put('/api/inventory/:id', WRITE_RATE_LIMIT, inventoryController.update);
    server.delete('/api/inventory/:id', WRITE_RATE_LIMIT, inventoryController.remove);
    // Restaurar da lixeira: POST porque muda estado e não é idempotente do ponto
    // de vista do histórico (cada restauração vira uma linha no ActivityLog).
    server.post('/api/inventory/:id/restore', WRITE_RATE_LIMIT, inventoryController.restore);

    logger.info('[Maestro] Rotas de Inventário (ITAM) inicializadas.');
  }
}
