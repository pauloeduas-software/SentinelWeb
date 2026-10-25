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
    // Lista enxuta para os `<select>` que escolhem um ativo: a licença entregue
    // a uma máquina e o vínculo de `/descobertas` (`?maquina=sem`).
    server.get('/api/assets/options', assetController.options);

    // A BUSCA DO LEITOR DE CÓDIGO DE BARRAS (F10, Etapa G).
    //
    // A ROTA É GLOBAL (`/api/search`) e o handler é do ativo: é ativo que ela
    // procura. A ordem das tentativas — etiqueta exata, série exata e só então
    // `ILIKE` — está no use-case, e ela sai dos índices: os dois primeiros usam
    // índice único parcial, o terceiro varre a tabela.
    //
    // SEM teto próprio: quem bipa cinquenta equipamentos em sequência faz
    // cinquenta buscas em dois minutos, e o teto global de 300/min cobre isso
    // com folga. Um teto apertado aqui atrapalharia exatamente o uso para o
    // qual a rota existe.
    server.get('/api/search', assetController.search);

    // A leitura unitária vem DEPOIS das rotas de caminho fixo (`/stats`,
    // `/options`, `/search`): o find-my-way casa o segmento estático antes do
    // parâmetro, mas manter a ordem aqui é o que deixa isso óbvio para quem
    // acrescentar a próxima.
    //
    // É a rota que a tela de detalhe (/ativos/:id) começa fazendo: uma URL
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

    logger.info('[Maestro] Rotas de Ativos (ITAM) inicializadas.');
  }
}
