import type { FastifyInstance } from 'fastify';
import { assetController } from './controllers/asset.controller';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('asset.maestro');

// Máquinas descobertas pelo agente (model `Asset`) — o lado RMM do produto.
// Quando a Fase 3 trouxer autenticação, o middleware entra aqui, por rota.
export class AssetMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/assets', assetController.list);
    server.post('/api/assets/:hwid/command', DESTRUCTIVE_RATE_LIMIT, assetController.command);

    logger.info('[Maestro] Rotas de Ativos (RMM) inicializadas.');
  }
}
