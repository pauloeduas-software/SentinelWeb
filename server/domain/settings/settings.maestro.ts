import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('settings.maestro');

// Configuração global (tabela `app_settings`, uma linha).
//
// DOIS RECORTES DA MESMA LINHA, um por tela, e isso é de propósito (D65): a
// descoberta (F7) e o sistema (F10). Não existe uma rota que devolva o singleton
// inteiro — ela levaria para o navegador o `assetTagNext`, que é contador e não
// configuração de ninguém (ver `helpers/system-settings.helper.ts`).
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

    // A CONFIGURAÇÃO DE SISTEMA (F10): formato de número e data, e moeda. `PUT`
    // e todos os campos opcionais, como o par acima.
    server.get('/api/settings', settingsController.getSystem);
    server.put('/api/settings', WRITE_RATE_LIMIT, settingsController.saveSystem);

    logger.info('[Maestro] Rotas de Configuração inicializadas.');
  }
}
