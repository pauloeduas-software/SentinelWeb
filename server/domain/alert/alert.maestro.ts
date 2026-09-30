import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { alertController } from './controllers/alert.controller';

const logger = createLogger('alert.maestro');

// A CENTRAL DE ALERTAS (docs/FASE-8-PLANO-ITAM.md, Etapa E).
//
// ORDEM DAS ROTAS: o segmento LITERAL vem antes do parâmetro — `/api/alerts/run`
// e `/api/alerts/read-all` ANTES de `/api/alerts/:id/read`. O find-my-way prefere
// o literal, mas manter a ordem aqui é o que deixa isso óbvio para quem
// acrescentar a próxima (a regra que o `stock.maestro.ts` fixou na F5).
export class AlertMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/alerts', alertController.list);

    // ── O GATILHO MANUAL ───────────────────────────────────────────────────
    //
    // `DESTRUCTIVE_RATE_LIMIT` (10/min) e não o de escrita: a rodada varre a frota
    // inteira quatro vezes e pode MANDAR E-MAIL. Não é destrutiva no banco — o
    // `dedupeKey` garante isso —, mas é a rota mais cara do sistema por chamada, e
    // e-mail disparado em rajada custa reputação de domínio, que não tem
    // `undo`.
    server.post('/api/alerts/run', DESTRUCTIVE_RATE_LIMIT, alertController.run);

    server.post('/api/alerts/read-all', WRITE_RATE_LIMIT, alertController.readAll);
    server.post('/api/alerts/:id/read', WRITE_RATE_LIMIT, alertController.read);

    logger.info('[Maestro] Rotas de Alertas inicializadas.');
  }
}
