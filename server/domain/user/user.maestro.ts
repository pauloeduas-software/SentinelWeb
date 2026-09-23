import type { FastifyInstance } from 'fastify';
import { userController } from './controllers/user.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('user.maestro');

export class UserMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/users', userController.list);
    server.post('/api/users', WRITE_RATE_LIMIT, userController.create);
    server.put('/api/users/:id', WRITE_RATE_LIMIT, userController.update);
    server.delete('/api/users/:id', WRITE_RATE_LIMIT, userController.remove);
    server.post('/api/users/:id/restore', WRITE_RATE_LIMIT, userController.restore);

    logger.info('[Maestro] Rotas de Usuários inicializadas.');
  }
}
