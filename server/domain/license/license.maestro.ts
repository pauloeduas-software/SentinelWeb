import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { licenseController } from './controllers/license.controller';
import { listLicenseAlerts } from './use-cases/list-license-alerts.usecase';

const logger = createLogger('license.maestro');

// AS LICENÇAS DE SOFTWARE (docs/FASE-6-PLANO-ITAM.md).
//
// FATIA VERTICAL INTEIRA, e não uma spec no motor do catálogo: a coluna
// principal da listagem é DERIVADA (`livres / seatsTotal`) e o `select` da
// `CatalogSpec` é allowlist estática. Nem a ideia de spec local da F5 se aplica
// — ali havia três tipos compartilhando uma invariante; aqui há um.
//
// ORDEM DAS ROTAS. O segmento LITERAL vem antes do parâmetro:
// `/api/licenses/alerts` antes de `/api/licenses/:id`, e
// `/api/licenses/seats/:seatId/checkin` antes de `/api/licenses/:id/...`. O
// find-my-way prefere o literal ao parâmetro sozinho, mas manter a ordem aqui é
// o que deixa isso óbvio para quem acrescentar a próxima — foi a mesma regra
// que o `stock.maestro.ts` fixou na F5.
export class LicenseMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ── OS DOIS SINAIS, numa rota só ───────────────────────────────────────
    //
    // ANTES de `/:id` de propósito (ver o bloco acima). O tipo é FILTRO e não
    // rota separada porque os dois alertas valem para a mesma tela — a mesma
    // escolha do `/api/stock/alerts` da F5.
    server.get('/api/licenses/alerts', async (request: FastifyRequest) => {
      const { tipo } = alertasQuerySchema.parse(request.query ?? {});
      return listLicenseAlerts(tipo);
    });

    // ── A DEVOLUÇÃO DE UM ASSENTO ──────────────────────────────────────────
    //
    // O `:id` é o do ASSENTO, não o da licença nem o da ocupação: a tela tem a
    // grade na mão e clica no quadrado. Segmento literal `seats` antes de
    // `/:id`, pela mesma regra de ordenação.
    server.post('/api/licenses/seats/:id/checkin', WRITE_RATE_LIMIT, licenseController.checkinSeat);

    // ── O CONTRATO ─────────────────────────────────────────────────────────
    server.get('/api/licenses', licenseController.list);
    server.get('/api/licenses/:id', licenseController.byId);
    server.get('/api/licenses/:id/seats', licenseController.seats);
    server.get('/api/licenses/:id/history', licenseController.history);

    // A ÚNICA porta por onde a chave de produto sai — e ela grava `VIEW_KEY` na
    // mesma transação da leitura. `WRITE_RATE_LIMIT` num GET de propósito: o
    // teto aqui não protege o servidor, protege o SEGREDO. Uma varredura que
    // revelasse todas as chaves da base é o ataque que esta rota permitiria, e
    // 40/min é o que separa uso humano de varredura.
    server.get('/api/licenses/:id/product-key', WRITE_RATE_LIMIT, licenseController.productKey);

    server.post('/api/licenses', WRITE_RATE_LIMIT, licenseController.create);
    server.put('/api/licenses/:id', WRITE_RATE_LIMIT, licenseController.update);
    server.delete('/api/licenses/:id', WRITE_RATE_LIMIT, licenseController.remove);
    server.post('/api/licenses/:id/restore', WRITE_RATE_LIMIT, licenseController.restore);

    // A ENTREGA. Sem `seatId` no corpo: quem escolhe o assento é o servidor,
    // com `FOR UPDATE … SKIP LOCKED` (D41). Deixar o cliente escolher reabriria
    // a corrida inteira — duas telas mostrando "assento 3 livre" mandariam as
    // duas o mesmo número.
    server.post('/api/licenses/:id/checkout-seat', WRITE_RATE_LIMIT, licenseController.checkoutSeat);

    // O QUE ESTÁ LICENCIADO NESTE ATIVO — a aba Licenças que a F2 deixou
    // desabilitada. Pendura em `/api/assets/:id` como as rotas de posse e de
    // componente fazem, e pelo mesmo motivo: o dono do conceito é este domínio,
    // não o do ativo.
    server.get('/api/assets/:id/licenses', licenseController.doAtivo);

    logger.info('[Maestro] Rotas de Licenças inicializadas.');
  }
}

// `strictObject` também na query: `?tip=vencendo` (typo) passaria despercebido
// devolvendo as duas categorias, que é o mesmo tipo de falha muda que o
// `parseListQuery` do `core` existe para evitar.
const alertasQuerySchema = z.strictObject({
  tipo: z.enum(['vencendo', 'assentosBaixos'], 'tipo inválido: use vencendo ou assentosBaixos').optional(),
});
