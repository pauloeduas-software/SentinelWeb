import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

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

    // OS BOTÕES DA DESCOBERTA (F7). `PUT` e não `PATCH`: o corpo é o conjunto
    // inteiro da configuração, e todos os campos são opcionais porque a tela
    // salva um de cada vez — mandar os cinco para mudar um seria pedir ao
    // cliente que conhecesse os outros quatro.
    server.get('/api/settings/discovery', settingsController.getDiscovery);
    server.put('/api/settings/discovery', WRITE_RATE_LIMIT, settingsController.saveDiscovery);

    // OS ALERTAS E A AUDITORIA (F8). Mesma forma da descoberta, e no mesmo lugar
    // de propósito: são valores de configuração do singleton, não um domínio — e
    // três domínios diferentes os leem (relatório, alerta e reconciliação).
    server.get('/api/settings/alerts', settingsController.getLifecycle);
    server.put('/api/settings/alerts', WRITE_RATE_LIMIT, settingsController.saveLifecycle);

    logger.info('[Maestro] Rotas de Configuração inicializadas.');
  }
}
