import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../infra/logger/logger';
import { WRITE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('settings.maestro');

// Configuração global (tabela `app_settings`, uma linha).
//
// UM RECORTE DA LINHA: a descoberta (F7). Não existe uma rota que devolva o
// singleton inteiro — ela levaria para o navegador o `assetTagNext`, que é
// contador e não configuração de ninguém.
export class SettingsMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // GET, e nunca POST: é leitura pura. Consumir a etiqueta acontece só dentro
    // da transação que cria o ativo.
    server.get('/api/settings/next-asset-tag', settingsController.nextAssetTag);

    // OS BOTÕES DA DESCOBERTA (F7). `PUT` e não `PATCH`: o corpo é o conjunto
    // inteiro da configuração, e todos os campos são opcionais porque a tela
    // salva um de cada vez — mandar os três para mudar um seria pedir ao
    // cliente que conhecesse os outros dois.
    server.get('/api/settings/discovery', settingsController.getDiscovery);
    server.put('/api/settings/discovery', WRITE_RATE_LIMIT, settingsController.saveDiscovery);

    logger.debug('[Maestro] Rotas de Configuração inicializadas.');
  }
}
