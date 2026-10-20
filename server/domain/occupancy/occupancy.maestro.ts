import type { FastifyInstance } from 'fastify';
import { occupancyController } from './controllers/occupancy.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('occupancy.maestro');

// Quem ocupa um posto de trabalho — a Camada 2 do docs/referencia/modelo-de-posse.md, o que o
// Snipe-IT não tem.
//
// As rotas penduram em `/api/workstations/:id` e `/api/people/:id`, e não em um
// `/api/occupancies` próprio, porque uma ocupação não existe sozinha: ela é
// sempre a ligação entre UM posto e UMA pessoa, e é por um dos dois que se
// pergunta. `/api/workstations/:id` e `/api/people/:id` continuam sendo dos
// domínios `workstation` e `person` — esta fatia só acrescenta o sub-recurso,
// sem tocar neles.
//
// O domínio é `occupancy` e não `workstation`: o posto se cadastra pelo CRUD
// genérico dirigido por spec (`workstationSpec`). Ocupação tem regra própria
// (encerrar não é apagar, uma aberta por pessoa/posto) e não cabe em spec.
export class OccupancyMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/workstations/:id/occupants', occupancyController.listByWorkstation);
    server.post('/api/workstations/:id/occupants', WRITE_RATE_LIMIT, occupancyController.add);

    // DELETE ENCERRA a ocupação (`endedAt = now()`); a linha NUNCA é apagada.
    // Escrita como as outras, então teto de escrita como as outras.
    server.delete(
      '/api/workstations/:id/occupants/:occupantId',
      WRITE_RATE_LIMIT,
      occupancyController.end,
    );

    // CORRIGE O TURNO de uma ocupação aberta, sem encerrar e reabrir: o porquê
    // está no use-case — histórico fabricado por causa de um typo não responde
    // "quem respondia pela Mesa 1 em março?".
    server.patch(
      '/api/workstations/:id/occupants/:occupantId',
      WRITE_RATE_LIMIT,
      occupancyController.updateShift,
    );

    server.get('/api/people/:id/occupancies', occupancyController.listByPerson);

    logger.info('[Maestro] Rotas de Ocupação de postos inicializadas.');
  }
}
