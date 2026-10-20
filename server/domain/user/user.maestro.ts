import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { userController } from './controllers/user.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { verificarOrigem } from '../auth/helpers/auth-hardening.helper';

const logger = createLogger('user.maestro');

/**
 * Criar e editar usuário RECEBEM SENHA (todo usuário entra no sistema), então
 * ganham a segunda camada anti-CSRF das rotas de credencial,
 * atrás do `SameSite` do cookie (`auth-hardening.helper.ts`).
 */
const ESCRITA_COM_SENHA: RouteShorthandOptions = { ...WRITE_RATE_LIMIT, preValidation: verificarOrigem };

export class UserMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // QUEM OPERA O SISTEMA — Técnico e Administrador. Quem recebe equipamento
    // é colaborador, catálogo (`/api/people`).
    server.get('/api/users', userController.list);
    server.post('/api/users', ESCRITA_COM_SENHA, userController.create);
    server.put('/api/users/:id', ESCRITA_COM_SENHA, userController.update);
    server.delete('/api/users/:id', WRITE_RATE_LIMIT, userController.remove);

    logger.info('[Maestro] Rotas de Usuários inicializadas.');
  }
}
