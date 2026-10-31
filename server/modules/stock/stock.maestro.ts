import type { FastifyInstance } from 'fastify';
import { stockController } from './controllers/stock.controller';
import { createLogger } from '../../infra/logger/logger';
import { WRITE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('stock.maestro');

// O ESTOQUE — o que tem quantidade e não patrimônio: monitor, teclado, mouse,
// cabo. Ativo é computador; tudo o mais entra aqui, por quantidade.
//
// A MESMA LÓGICA DA LICENÇA (AE), e as rotas têm a mesma forma: o total é campo
// da edição, a entrega e a devolução têm dia, o item que acabou se desativa e
// só o que está em uso impede excluir (AG). O saldo é calculado, nunca coluna
// (`helpers/stock-balance.helper.ts`).
//
// ORDEM DAS ROTAS: `/api/stock/checkouts/:id/checkin` e `/api/stock/items/:id`
// têm prefixos literais diferentes, então não disputam. O `:id` da devolução é
// o de uma unidade da ENTREGA, não o do item: é ela que diz qual entrega volta.
export class StockMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // A DEVOLUÇÃO: N unidades de uma entrega, num dia.
    server.post('/api/stock/checkouts/:id/checkin', WRITE_RATE_LIMIT, stockController.checkin);

    server.get('/api/stock/items', stockController.list);
    server.get('/api/stock/items/:id', stockController.byId);
    server.get('/api/stock/items/:id/checkouts', stockController.checkouts);
    server.get('/api/stock/items/:id/history', stockController.history);

    server.post('/api/stock/items', WRITE_RATE_LIMIT, stockController.create);
    // A edição muda também o total, e `isActive` é o Desativar e o Ativar.
    server.put('/api/stock/items/:id', WRITE_RATE_LIMIT, stockController.update);
    server.delete('/api/stock/items/:id', WRITE_RATE_LIMIT, stockController.remove);

    // A ENTREGA: N unidades a um colaborador ou a um posto — ou, o componente,
    // a um computador (AI).
    server.post('/api/stock/items/:id/checkout', WRITE_RATE_LIMIT, stockController.checkout);

    // Os componentes instalados num computador: a aba Componentes, irmã da
    // `/api/assets/:id/licenses`.
    server.get('/api/assets/:id/components', stockController.doAtivo);

    logger.debug('[Maestro] Rotas de Estoque inicializadas.');
  }
}
