import type { FastifyInstance } from 'fastify';
import { settingsController } from './controllers/settings.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('settings.maestro');

// Configuração global (tabela `app_settings`, uma linha).
//
// TRÊS RECORTES DA MESMA LINHA, um por tela, e isso é de propósito (D65): a
// descoberta (F7), os alertas (F8) e o sistema (F10). Não existe uma rota que
// devolva o singleton inteiro — ela levaria para o navegador o `cryptoCanary` e
// o `assetTagNext`, que não são configuração de ninguém (ver
// `helpers/system-settings.helper.ts`).
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

    // A CONFIGURAÇÃO DE SISTEMA (F10): marca, formato de número e data, moeda,
    // delimitador do CSV e retenção do backup. `PUT` e todos os campos
    // opcionais, como os dois pares acima.
    server.get('/api/settings', settingsController.getSystem);
    server.put('/api/settings', WRITE_RATE_LIMIT, settingsController.saveSystem);

    // A MARCA é arquivo, então tem rota própria em `multipart/form-data` — e
    // SAI POR `/api/` COM SESSÃO, como todo arquivo deste sistema (D84).
    //
    // O custo conhecido, escrito aqui para não ser descoberto depois: a TELA DE
    // LOGIN não mostra a logo, porque ela não tem sessão para pedir o arquivo.
    // Abrir esta rota resolveria o enfeite e entregaria, de graça, o nome e a
    // identidade visual da empresa a quem só sabe a URL do painel.
    server.get('/api/settings/branding/:marca', settingsController.getBranding);
    server.put('/api/settings/branding/:marca', WRITE_RATE_LIMIT, settingsController.setBranding);
    server.delete('/api/settings/branding/:marca', WRITE_RATE_LIMIT, settingsController.clearBranding);

    logger.info('[Maestro] Rotas de Configuração inicializadas.');
  }
}
