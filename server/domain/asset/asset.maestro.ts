import type { FastifyInstance } from 'fastify';
import { assetController } from './controllers/asset.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('asset.maestro');

// O ativo do ITAM — o `Asset` do vocabulário do Snipe-IT.
//
// A máquina descoberta pelo agente é o `Endpoint`, em /api/endpoints: são duas
// coisas diferentes de propósito, porque há ativo sem agente (monitor, cadeira,
// cabo) e máquina vista pelo agente que ninguém cadastrou. O vínculo entre as
// duas é a Fase 7.
export class AssetMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/assets', assetController.list);
    server.get('/api/assets/stats', assetController.stats);
    // Lista enxuta para o `<select>` da aba "Ativo" do modal de entrega: é assim
    // que se prende um periférico a outro equipamento (docs/MODELO-POSSE.md).
    server.get('/api/assets/options', assetController.options);
    // Match exato para leitor de código de barras e para a reconciliação da F7.
    server.get('/api/assets/by-serial/:serial', assetController.bySerial);

    // A leitura unitária vem DEPOIS das rotas de caminho fixo (`/stats`,
    // `/options`, `/by-serial`): o find-my-way casa o segmento estático antes do
    // parâmetro, mas manter a ordem aqui é o que deixa isso óbvio para quem
    // acrescentar a próxima.
    //
    // É a rota que a tela de detalhe (/ativos/:id) começa fazendo: uma URL
    // colada no navegador não tem a linha que a listagem tinha em memória.
    server.get('/api/assets/:id', assetController.byId);

    // A aba Histórico: o `ActivityLog` do ativo unido ao histórico de posse, do
    // mais recente para o mais antigo. NÃO existe tabela `AssetLog` (D18).
    server.get('/api/assets/:id/history', assetController.history);

    server.post('/api/assets', WRITE_RATE_LIMIT, assetController.create);
    server.put('/api/assets/:id', WRITE_RATE_LIMIT, assetController.update);
    server.delete('/api/assets/:id', WRITE_RATE_LIMIT, assetController.remove);
    // Restaurar da lixeira: POST porque muda estado e cada restauração vira uma
    // linha no ActivityLog.
    server.post('/api/assets/:id/restore', WRITE_RATE_LIMIT, assetController.restore);

    // DESCOMISSIONAR: o ativo saiu do PATRIMÔNIO (vendido, descartado,
    // roubado). Não é arquivar (`status.type = ARCHIVED`) nem apagar
    // (`deletedAt`) — são três colunas com três significados, e nenhuma
    // substitui a outra (D19). POST porque muda estado e deixa histórico.
    server.post('/api/assets/:id/retire', WRITE_RATE_LIMIT, assetController.retire);
    server.post('/api/assets/:id/unretire', WRITE_RATE_LIMIT, assetController.unretire);

    // AÇÃO EM MASSA: uma operação declarada, N ativos, tudo ou nada (D21).
    // Caminho fixo `/bulk` e não `/:id/...` — o lote não é operação de UM ativo.
    server.post('/api/assets/bulk', WRITE_RATE_LIMIT, assetController.bulk);

    logger.info('[Maestro] Rotas de Ativos (ITAM) inicializadas.');
  }
}
