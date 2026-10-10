import type { FastifyInstance } from 'fastify';
import { userController } from './controllers/user.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('user.maestro');

export class UserMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/users', userController.list);
    server.get('/api/users/options', userController.options);
    // UM colaborador — a tela de perfil (F4, Etapa F). Depois do `/options`
    // porque o find-my-way prefere o segmento literal ao parâmetro: a ordem
    // aqui é para quem LÊ o arquivo, não para o roteador.
    server.get('/api/users/:id', userController.get);
    // O que aconteceu COM esta pessoa — `ActivityLog` + posses diretas +
    // ocupações de posto, numa lista só. Não é o que ela FEZ: isso é auditoria
    // de operador e vem com o RBAC da F11 (ver o use-case).
    server.get('/api/users/:id/history', userController.history);
    server.post('/api/users', WRITE_RATE_LIMIT, userController.create);
    server.put('/api/users/:id', WRITE_RATE_LIMIT, userController.update);
    server.delete('/api/users/:id', WRITE_RATE_LIMIT, userController.remove);

    server.post('/api/users/:id/restore', WRITE_RATE_LIMIT, userController.restore);

    logger.info('[Maestro] Rotas de Usuários inicializadas.');
  }
}
