import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { auditController } from './controllers/audit.controller';

const logger = createLogger('audit.maestro');

// A CONFERÊNCIA FÍSICA (docs/historico/fase-08-ciclo-de-vida.md, Etapa B).
//
// AS ROTAS DE POSTO MORAM AQUI, e não no CRUD de catálogo de localizações: elas
// têm REGRA — deduzem o resultado de cada ativo, movem `locationId`, marcam as
// duas divergências e gravam N linhas numa transação. Rota com regra não é spec, e
// o motor do catálogo é allowlist estática de colunas (a mesma razão que tirou as
// rotas de posto do catálogo na F4).
export class AuditMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ── PENDURADAS NO ATIVO ────────────────────────────────────────────────
    server.get('/api/assets/:id/audits', auditController.doAtivo);
    server.post('/api/assets/:id/audit', WRITE_RATE_LIMIT, auditController.record);

    // ── A CONFERÊNCIA POR POSTO ────────────────────────────────────────────
    //
    // O mesmo caminho para ler e para gravar, nos dois verbos: quem confere abre
    // as duas listas, anda até a mesa e devolve o que achou. Dois caminhos
    // diferentes para os dois lados do mesmo gesto seria uma rota a mais para
    // ninguém.
    server.get('/api/locations/:id/auditoria', auditController.conferenciaDoPosto);
    server.post('/api/locations/:id/auditoria', WRITE_RATE_LIMIT, auditController.auditarPosto);

    logger.info('[Maestro] Rotas de Auditoria inicializadas.');
  }
}
