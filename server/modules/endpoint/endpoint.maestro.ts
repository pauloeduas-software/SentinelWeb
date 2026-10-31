import type { FastifyInstance } from 'fastify';
import { endpointController } from './controllers/endpoint.controller';
import { createLogger } from '../../infra/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('endpoint.maestro');

// Máquinas descobertas pelo agente (model `Endpoint`) — o lado RMM do produto.
// Quando a Fase 3 trouxer autenticação, o middleware entra aqui, por rota.
export class EndpointMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/endpoints', endpointController.list);
    // UMA máquina. Nasceu quando a telemetria saiu da tela de frota e foi para a
    // ficha do ativo e a do posto, onde a pergunta é sobre uma só.
    server.get('/api/endpoints/:id', endpointController.detail);
    server.post('/api/endpoints/:id/command', DESTRUCTIVE_RATE_LIMIT, endpointController.command);

    logger.debug('[Maestro] Rotas de Endpoints (RMM) inicializadas.');
  }
}
