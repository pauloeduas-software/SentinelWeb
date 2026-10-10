import type { FastifyInstance } from 'fastify';
import { stockController } from './controllers/stock.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('stock.maestro');

// O ESTOQUE — o que tem quantidade e não patrimônio: monitor, teclado, mouse,
// cabo. Ativo é computador; tudo o mais entra aqui, por quantidade.
//
// UM tipo de item e UMA tabela de movimento (entrada, baixa, saída com
// devolução por unidade). O saldo é calculado, nunca coluna
// (`helpers/stock-balance.helper.ts`).
//
// ORDEM DAS ROTAS: `/api/stock/movements/:id/checkin` e `/api/stock/items/:id`
// têm prefixos literais diferentes, então não disputam. O `:id` da devolução é
// o do MOVIMENTO, não o do item: a devolução é de UMA unidade identificada, e é
// ela que a tela tem na mão.
export class StockMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/stock/items', stockController.list);
    server.get('/api/stock/items/:id', stockController.byId);
    server.get('/api/stock/items/:id/movements', stockController.movements);

    server.post('/api/stock/items', WRITE_RATE_LIMIT, stockController.create);
    server.put('/api/stock/items/:id', WRITE_RATE_LIMIT, stockController.update);
    server.delete('/api/stock/items/:id', WRITE_RATE_LIMIT, stockController.remove);
    server.post('/api/stock/items/:id/restore', WRITE_RATE_LIMIT, stockController.restore);

    // ENTRADA e BAIXA: a única porta para o total do item.
    server.post('/api/stock/items/:id/adjust', WRITE_RATE_LIMIT, stockController.adjust);
    // SAÍDA: N unidades a uma pessoa ou a um posto.
    server.post('/api/stock/items/:id/checkout', WRITE_RATE_LIMIT, stockController.checkout);
    // DEVOLUÇÃO: de uma unidade, pelo id da saída dela.
    server.post('/api/stock/movements/:id/checkin', WRITE_RATE_LIMIT, stockController.checkin);

    logger.info('[Maestro] Rotas de Estoque inicializadas.');
  }
}
