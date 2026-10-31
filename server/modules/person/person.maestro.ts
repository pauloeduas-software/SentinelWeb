import type { FastifyInstance } from 'fastify';
import { personController } from './controllers/person.controller';
import { createLogger } from '../../infra/logger/logger';

const logger = createLogger('person.maestro');

/**
 * A FICHA DO COLABORADOR — só leitura.
 *
 * O cadastro (listar, opções, criar, editar, excluir) é do catálogo genérico
 * (`catalog/specs/person.spec.ts`), que registra `/api/people` e
 * `/api/people/options`. Aqui ficam as duas leituras que nenhuma outra aba tem:
 * a pessoa com o que está no nome dela, e o que aconteceu com ela. Os postos
 * que ela ocupa são do domínio `occupancy` (`/api/people/:id/occupancies`).
 */
export class PersonMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/people/:id', personController.get);
    server.get('/api/people/:id/history', personController.history);

    logger.debug('[Maestro] Rotas de Colaboradores inicializadas.');
  }
}
