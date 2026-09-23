import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { accessoryController } from './controllers/accessory.controller';
import { consumableController } from './controllers/consumable.controller';
import { componentController } from './controllers/component.controller';
import { STOCK_KINDS } from './helpers/stock-kind.helper';
import { listStockAlerts } from './use-cases/list-stock-alerts.usecase';

const logger = createLogger('stock.maestro');

// O ESTOQUE — os três tipos que têm quantidade (docs/FASE-5-PLANO-ITAM.md).
//
// UM domínio com os três dentro, e não três fatias verticais (D35): eles
// compartilham UMA invariante — saldo derivado mais trava na linha-pai (D34) —
// e UMA tela. Três fatias copiariam a invariante três vezes, e invariante
// copiada é invariante que um dia diverge.
//
// ORDEM DAS ROTAS. Em cada bloco o segmento LITERAL vem antes do parâmetro:
// `/api/accessories/checkouts/:id/checkin` antes de `/api/accessories/:id/...`,
// e `/api/components/attachments/:id/detach` antes de `/api/components/:id/...`.
// O find-my-way prefere o literal ao parâmetro sozinho, mas manter a ordem aqui
// é o que deixa isso óbvio para quem acrescentar a próxima.
export class StockMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ── ACESSÓRIO — sai para pessoa OU POSTO, e volta ──────────────────────
    server.get('/api/accessories', accessoryController.list);
    server.get('/api/accessories/:id', accessoryController.byId);
    server.get('/api/accessories/:id/movements', accessoryController.movements);
    // As unidades que estão fora: é daqui que sai o botão "devolver".
    server.get('/api/accessories/:id/checkouts', accessoryController.checkouts);

    server.post('/api/accessories', WRITE_RATE_LIMIT, accessoryController.create);
    server.put('/api/accessories/:id', WRITE_RATE_LIMIT, accessoryController.update);
    server.delete('/api/accessories/:id', WRITE_RATE_LIMIT, accessoryController.remove);
    server.post('/api/accessories/:id/restore', WRITE_RATE_LIMIT, accessoryController.restore);
    server.post('/api/accessories/:id/adjust-quantity', WRITE_RATE_LIMIT, accessoryController.adjust);

    server.post('/api/accessories/:id/checkout', WRITE_RATE_LIMIT, accessoryController.checkout);
    // O `:id` aqui é o do CHECKOUT, não o do acessório: a devolução é de UMA
    // unidade identificada, e é ela que a tela tem na mão.
    server.post('/api/accessories/checkouts/:id/checkin', WRITE_RATE_LIMIT, accessoryController.checkin);

    // ── CONSUMÍVEL — sai e NÃO volta ───────────────────────────────────────
    //
    // NÃO EXISTE `/api/consumables/checkouts/:id/checkin`, e a ausência é a
    // regra (D37): o 404 vem do ROTEADOR, não de uma validação que alguém
    // possa remover. Implementar a devolução exigiria uma migração — que é o
    // tipo de mudança que alguém revisa.
    server.get('/api/consumables', consumableController.list);
    server.get('/api/consumables/:id', consumableController.byId);
    server.get('/api/consumables/:id/movements', consumableController.movements);

    server.post('/api/consumables', WRITE_RATE_LIMIT, consumableController.create);
    server.put('/api/consumables/:id', WRITE_RATE_LIMIT, consumableController.update);
    server.delete('/api/consumables/:id', WRITE_RATE_LIMIT, consumableController.remove);
    server.post('/api/consumables/:id/restore', WRITE_RATE_LIMIT, consumableController.restore);
    server.post('/api/consumables/:id/adjust-quantity', WRITE_RATE_LIMIT, consumableController.adjust);

    server.post('/api/consumables/:id/consume', WRITE_RATE_LIMIT, consumableController.consume);

    // ── COMPONENTE — vai para DENTRO de um ativo, e volta inclusive em parte ─
    server.get('/api/components', componentController.list);
    server.get('/api/components/:id', componentController.byId);
    server.get('/api/components/:id/movements', componentController.movements);

    server.post('/api/components', WRITE_RATE_LIMIT, componentController.create);
    server.put('/api/components/:id', WRITE_RATE_LIMIT, componentController.update);
    server.delete('/api/components/:id', WRITE_RATE_LIMIT, componentController.remove);
    server.post('/api/components/:id/restore', WRITE_RATE_LIMIT, componentController.restore);
    server.post('/api/components/:id/adjust-quantity', WRITE_RATE_LIMIT, componentController.adjust);

    server.post('/api/components/:id/attach', WRITE_RATE_LIMIT, componentController.attach);
    // O `:id` é o da INSTALAÇÃO. Retirada parcial divide a linha (D38).
    server.post('/api/components/attachments/:id/detach', WRITE_RATE_LIMIT, componentController.detach);

    // O QUE ESTÁ DENTRO DESTE ATIVO — a aba Componentes que a F2 deixou
    // desabilitada. Pendura em `/api/assets/:id` como as rotas de posse fazem,
    // e pelo mesmo motivo: o dono do conceito é este domínio, não o do ativo.
    server.get('/api/assets/:id/components', componentController.doAtivo);

    // ── OS DOIS SINAIS, numa rota só ───────────────────────────────────────
    //
    // `/api/stock/alerts` e não `/api/accessories/alerts` como o TODO previa: o
    // alerta vale para os três tipos e a tela é uma só, então o tipo é FILTRO.
    server.get('/api/stock/alerts', async (request: FastifyRequest) => {
      const { tipo } = alertasQuerySchema.parse(request.query ?? {});
      return listStockAlerts(tipo);
    });

    logger.info('[Maestro] Rotas de Estoque (acessórios, consumíveis, componentes) inicializadas.');
  }
}

// `strictObject` também na query: `?tip=ACCESSORY` (typo) passaria despercebido
// devolvendo os três tipos, que é o mesmo tipo de falha muda que o
// `parseListQuery` do `core` existe para evitar.
const alertasQuerySchema = z.strictObject({
  tipo: z.enum(STOCK_KINDS, `tipo inválido: use ${STOCK_KINDS.join(', ')}`).optional(),
});
