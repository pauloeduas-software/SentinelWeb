import type { FastifyInstance } from 'fastify';
import { createCatalogController } from './controllers/catalog.controller';
import { CATALOG_SPECS } from './specs';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('catalog.maestro');

// As tabelas de catálogo — o menu *Settings* do Snipe-IT. Cinco rotas por
// tabela, registradas em laço sobre `CATALOG_SPECS`: acrescentar uma tabela é
// escrever a spec, não copiar um maestro.
//
// Não há `POST /:id/restore` em lugar nenhum daqui: o catálogo não tem lixeira
// (docs/FASE-1-PLANO-ITAM.md, D8). A proteção é o 409 por uso, no delete.
export class CatalogMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    for (const spec of CATALOG_SPECS) {
      const controller = createCatalogController(spec);
      const base = `/api/${spec.slug}`;

      server.get(base, controller.list);
      // Rota estática antes da paramétrica não é exigência do find-my-way (ele
      // resolve por especificidade), mas deixa a intenção explícita na leitura.
      server.get(`${base}/options`, controller.options);
      server.post(base, WRITE_RATE_LIMIT, controller.create);
      server.put(`${base}/:id`, WRITE_RATE_LIMIT, controller.update);
      server.delete(`${base}/:id`, WRITE_RATE_LIMIT, controller.remove);
    }

    logger.info(`[Maestro] Rotas de Catálogo inicializadas (${CATALOG_SPECS.length} tabelas).`);
  }
}
