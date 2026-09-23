import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../core/logger/logger';

const logger = createLogger('settings.maestro');

// Configuração global (tabela `app_settings`, uma linha).
//
// A tela de Configurações do singleton — marca, logo, moeda, formato de data —
// é a Fase 10. Por ora só a etiqueta automática tem dono definido.
export class SettingsMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // GET, e nunca POST: é leitura pura. Consumir a etiqueta acontece só dentro
    // da transação que cria o ativo.
    server.get('/api/settings/next-asset-tag', settingsController.nextAssetTag);

    logger.info('[Maestro] Rotas de Configuração inicializadas.');
  }
}
