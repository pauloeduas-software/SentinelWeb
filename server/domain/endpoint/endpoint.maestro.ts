import type { FastifyInstance } from 'fastify';
import { endpointController } from './controllers/endpoint.controller';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('endpoint.maestro');

// Máquinas descobertas pelo agente (model `Endpoint`) — o lado RMM do produto.
// Quando a Fase 3 trouxer autenticação, o middleware entra aqui, por rota.
export class EndpointMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/endpoints', endpointController.list);
    server.post('/api/endpoints/:hwid/command', DESTRUCTIVE_RATE_LIMIT, endpointController.command);

    logger.info('[Maestro] Rotas de Endpoints (RMM) inicializadas.');
  }
}
