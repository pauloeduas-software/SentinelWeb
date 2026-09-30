import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { maintenanceController } from './controllers/maintenance.controller';

const logger = createLogger('maintenance.maestro');

// O HISTÓRICO DE SERVIÇO DO ATIVO (docs/FASE-8-PLANO-ITAM.md, Etapa A).
//
// FATIA VERTICAL, e não uma spec no motor do catálogo: a listagem carrega
// AGREGADO (custo total, em aberto, na garantia) sobre o mesmo recorte da página,
// e o `select` da `CatalogSpec` é allowlist estática — ensiná-lo a somar seria
// dobrar um genérico para atender um cliente.
//
// ORDEM DAS ROTAS: o segmento LITERAL vem antes do parâmetro. Aqui não há
// colisão, mas manter a ordem é o que deixa isso óbvio para quem acrescentar a
// próxima — a mesma regra que `stock.maestro.ts` fixou na F5.
export class MaintenanceMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ── A TELA GLOBAL ──────────────────────────────────────────────────────
    server.get('/api/maintenances', maintenanceController.list);

    server.put('/api/maintenances/:id', WRITE_RATE_LIMIT, maintenanceController.update);

    // O ENCERRAMENTO. Rota própria, e não um PUT com a data: é um clique na tela,
    // o padrão é hoje, e o evento merece linha própria no histórico DO ATIVO
    // (`SERVICE_CLOSE`) em vez de virar diff de campo.
    server.post('/api/maintenances/:id/close', WRITE_RATE_LIMIT, maintenanceController.close);

    // `DELETE` de verdade: a tabela não tem lixeira (histórico é append-only), e o
    // retrato inteiro da linha vai para o `changes` do log antes de ela sumir.
    server.delete('/api/maintenances/:id', WRITE_RATE_LIMIT, maintenanceController.remove);

    // ── PENDURADAS NO ATIVO ────────────────────────────────────────────────
    //
    // Como as rotas de posse, de componente e de licença fazem, e pelo mesmo
    // motivo: o dono do conceito é este domínio, não o do ativo — mas o recurso
    // que a tela tem na mão é o ativo.
    server.get('/api/assets/:id/maintenances', maintenanceController.doAtivo);
    server.post('/api/assets/:id/maintenances', WRITE_RATE_LIMIT, maintenanceController.create);

    logger.info('[Maestro] Rotas de Manutenção inicializadas.');
  }
}
