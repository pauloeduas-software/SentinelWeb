import type { FastifyInstance } from 'fastify';
import { endpointController } from './controllers/endpoint.controller';
import { createLogger } from '../../infra/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('endpoint.maestro');

// Máquinas descobertas pelo agente (model `Endpoint`) — o lado RMM do produto.
export class EndpointMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/endpoints', endpointController.list);
    // UMA máquina. Nasceu quando a telemetria saiu da tela de frota e foi para a
    // ficha do ativo e a do posto, onde a pergunta é sobre uma só.
    server.get('/api/endpoints/:id', endpointController.detail);
    server.post('/api/endpoints/:id/command', DESTRUCTIVE_RATE_LIMIT, endpointController.command);
    // ATUALIZAR AGORA (DK): o inventário e a telemetria na hora. Só lê a máquina, e
    // por isso é do Técnico, com o teto das escritas comuns.
    server.post('/api/endpoints/:id/refresh', WRITE_RATE_LIMIT, endpointController.refresh);
    server.delete('/api/endpoints/:id', DESTRUCTIVE_RATE_LIMIT, endpointController.remove);

    logger.debug('[Maestro] Rotas de Endpoints (RMM) inicializadas.');
  }
}
