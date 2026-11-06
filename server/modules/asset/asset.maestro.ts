import type { FastifyInstance } from 'fastify';
import { assetController } from './controllers/asset.controller';
import { createLogger } from '../../infra/logger/logger';
import { WRITE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('asset.maestro');

// O ativo do ITAM — o `Asset` do vocabulário do Snipe-IT.
//
// A máquina descoberta pelo agente é o `Endpoint`, em /api/endpoints: são duas
// coisas diferentes de propósito, porque há ativo sem agente (monitor, cadeira,
// cabo) e máquina vista pelo agente que ninguém cadastrou.
export class AssetMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/assets', assetController.list);
    server.get('/api/assets/stats', assetController.stats);
    // Lista enxuta para os seletores que escolhem um ativo: a licença entregue
    // a uma máquina e o vínculo de `/descobertas` (`?maquina=sem`).
    server.get('/api/assets/options', assetController.options);

    // A leitura unitária vem DEPOIS das rotas de caminho fixo (`/stats`,
    // `/options`): o find-my-way casa o segmento estático antes do
    // parâmetro, mas manter a ordem aqui é o que deixa isso óbvio para quem
    // acrescentar a próxima.
    //
    // É a rota que a tela de detalhe (/computadores/:id) começa fazendo: uma URL
    // colada no navegador não tem a linha que a listagem tinha em memória.
    server.get('/api/assets/:id', assetController.byId);

    // A aba Histórico: as entregas e as licenças do ativo, do mais recente
    // para o mais antigo. Só movimentação: a auditoria fica no banco (AB). NÃO
    // existe tabela `AssetLog` (D18).
    server.get('/api/assets/:id/history', assetController.history);

    server.post('/api/assets', WRITE_RATE_LIMIT, assetController.create);
    server.put('/api/assets/:id', WRITE_RATE_LIMIT, assetController.update);
    server.delete('/api/assets/:id', WRITE_RATE_LIMIT, assetController.remove);
    // Restaurar da lixeira: POST porque muda estado e cada restauração vira uma
    // linha no AuditLog.
    server.post('/api/assets/:id/restore', WRITE_RATE_LIMIT, assetController.restore);

    // DAR BAIXA: o ativo saiu do PATRIMÔNIO (vendido, descartado,
    // roubado). Não é apagar (`deletedAt`) — são duas colunas com dois
    // significados (D19). POST porque muda estado e deixa histórico.
    server.post('/api/assets/:id/retire', WRITE_RATE_LIMIT, assetController.retire);
    server.post('/api/assets/:id/unretire', WRITE_RATE_LIMIT, assetController.unretire);

    logger.debug('[Maestro] Rotas de Ativos (ITAM) inicializadas.');
  }
}
