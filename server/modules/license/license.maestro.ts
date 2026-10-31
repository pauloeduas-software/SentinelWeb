import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SEM_PARAMETROS } from '../../infra/http/sem-parametros';
import { createLogger } from '../../infra/logger/logger';
import { WRITE_RATE_LIMIT } from '../../infra/http/write-rate-limit';
import { licenseController } from './controllers/license.controller';
import { listLicenseAlerts } from './use-cases/list-license-alerts.usecase';

const logger = createLogger('license.maestro');

// AS LICENÇAS DE SOFTWARE (docs/referencia/licencas.md).
//
// FATIA VERTICAL INTEIRA, e não uma spec no motor do catálogo: a coluna
// principal da listagem é DERIVADA (livres de quantas foram compradas) e o
// `select` da `CatalogSpec` é allowlist estática.
//
// ORDEM DAS ROTAS. O segmento LITERAL vem antes do parâmetro:
// `/api/licenses/alerts` e `/api/licenses/checkouts/:id/...` antes de
// `/api/licenses/:id`. O find-my-way prefere o literal ao parâmetro sozinho,
// mas manter a ordem aqui é o que deixa isso óbvio para quem acrescentar a
// próxima.
export class LicenseMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // O ALERTA — vencendo, vencida, encerrada ainda em uso. ANTES de `/:id`.
    server.get('/api/licenses/alerts', async (request: FastifyRequest) => {
      SEM_PARAMETROS.parse(request.query ?? {});
      return listLicenseAlerts();
    });

    // ── A DEVOLUÇÃO E A CHAVE DA ENTREGA ───────────────────────────────────
    //
    // O `:id` é o da ENTREGA, não o da licença nem o do alvo: é o que impede a
    // tela velha de devolver quem recebeu depois. Segmento literal
    // `checkouts` antes de `/:id`, pela mesma regra de ordenação.
    server.post('/api/licenses/checkouts/:id/checkin', WRITE_RATE_LIMIT, licenseController.checkin);
    // Só a chave da entrega aberta (AA).
    server.patch('/api/licenses/checkouts/:id', WRITE_RATE_LIMIT, licenseController.checkoutKey);

    // ── O CONTRATO ─────────────────────────────────────────────────────────
    server.get('/api/licenses', licenseController.list);

    server.get('/api/licenses/:id', licenseController.byId);
    server.get('/api/licenses/:id/checkouts', licenseController.checkouts);
    server.get('/api/licenses/:id/history', licenseController.history);

    server.post('/api/licenses', WRITE_RATE_LIMIT, licenseController.create);
    server.put('/api/licenses/:id', WRITE_RATE_LIMIT, licenseController.update);
    server.delete('/api/licenses/:id', WRITE_RATE_LIMIT, licenseController.remove);
    server.post('/api/licenses/:id/terminate', WRITE_RATE_LIMIT, licenseController.terminate);

    // A ENTREGA. Para colaborador XOR ativo — o corpo diz qual.
    server.post('/api/licenses/:id/checkout', WRITE_RATE_LIMIT, licenseController.checkout);

    // O QUE ESTÁ LICENCIADO NESTE ATIVO — o que a aba Licenças do ativo mostra.
    // Pendura em `/api/assets/:id` como as rotas de posse fazem, e pelo mesmo
    // motivo: o dono do conceito é este domínio, não o do ativo.
    server.get('/api/assets/:id/licenses', licenseController.doAtivo);

    logger.debug('[Maestro] Rotas de Licenças inicializadas.');
  }
}
