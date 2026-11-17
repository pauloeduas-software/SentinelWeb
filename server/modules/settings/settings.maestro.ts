import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../infra/logger/logger';

const logger = createLogger('settings.maestro');

// Configuração global (tabela `app_settings`, uma linha). Não existe uma rota que
// devolva o singleton inteiro — ela levaria para o navegador o `assetTagNext`,
// que é contador e não configuração de ninguém.
export class SettingsMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // GET, e nunca POST: é leitura pura. Consumir a etiqueta acontece só dentro
    // da transação que cria o ativo.
    server.get('/api/settings/next-asset-tag', settingsController.nextAssetTag);

    logger.debug('[Maestro] Rotas de Configuração inicializadas.');
  }
}
