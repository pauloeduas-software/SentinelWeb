import type { FastifyInstance } from 'fastify';
import { assignmentController } from './controllers/assignment.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('assignment.maestro');

// A POSSE — entrega, devolução e quem responde pelo quê (docs/referencia/modelo-de-posse.md).
//
// As rotas penduram em `/api/assets`, mas o domínio é próprio, e
// não uma pasta a mais dentro de `asset/`: a entrega não é uma edição de ativo,
// é a operação que escreve posse — a única, junto com a devolução. Mantê-la
// aqui é o que deixa o CRUD do ativo continuar sem saber o que é uma posse.
//
// Todas as rotas de `/api/assets` usam `:id` como nome do parâmetro, inclusive
// as do `asset.maestro.ts`: o find-my-way recusa dois nomes diferentes na mesma
// posição do caminho, e a recusa acontece no boot, não na primeira requisição.
export class AssignmentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.post('/api/assets/:id/checkout', WRITE_RATE_LIMIT, assignmentController.checkout);
    server.post('/api/assets/:id/checkin', WRITE_RATE_LIMIT, assignmentController.checkin);

    // Histórico do ativo, mais recente primeiro. Append-only: a devolução
    // preenche `checkinAt` e a linha fica, então esta rota mostra a posse atual
    // e todas as anteriores.
    server.get('/api/assets/:id/assignments', assignmentController.history);

    logger.info('[Maestro] Rotas de Posse (entrega/devolução) inicializadas.');
  }
}
