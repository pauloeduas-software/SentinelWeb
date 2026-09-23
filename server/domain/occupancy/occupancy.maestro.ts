import type { FastifyInstance } from 'fastify';
import { occupancyController } from './controllers/occupancy.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('occupancy.maestro');

// Quem ocupa um posto de trabalho — a Camada 2 do docs/MODELO-POSSE.md, o que o
// Snipe-IT não tem.
//
// As rotas penduram em `/api/locations/:id` e `/api/users/:id`, e não em um
// `/api/occupancies` próprio, porque uma ocupação não existe sozinha: ela é
// sempre a ligação entre UM posto e UMA pessoa, e é por um dos dois que se
// pergunta. `/api/locations/:id` e `/api/users/:id` continuam sendo do catálogo
// e do domínio `user` — esta fatia só acrescenta o sub-recurso, sem tocar neles.
//
// O domínio é `occupancy` e não `location`: `Location` é uma das sete tabelas do
// catálogo e mora no CRUD genérico dirigido por spec. Ocupação tem regra própria
// (encerrar não é apagar, uma aberta por pessoa/posto) e não cabe em spec.
export class OccupancyMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/locations/:id/occupants', occupancyController.listByLocation);
    server.post('/api/locations/:id/occupants', WRITE_RATE_LIMIT, occupancyController.add);

    // DELETE ENCERRA a ocupação (`endedAt = now()`); a linha NUNCA é apagada.
    // Escrita como as outras, então teto de escrita como as outras.
    server.delete(
      '/api/locations/:id/occupants/:occupantId',
      WRITE_RATE_LIMIT,
      occupancyController.end,
    );

    server.get('/api/users/:id/occupancies', occupancyController.listByUser);

    logger.info('[Maestro] Rotas de Ocupação de postos inicializadas.');
  }
}
