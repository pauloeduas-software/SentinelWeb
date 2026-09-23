import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { authController } from './controllers/auth.controller';
import { semCache, verificarOrigem } from './helpers/auth-hardening.helper';
import { createLogger } from '../../core/logger/logger';
import { LOGIN_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('auth.maestro');

// Login, logout e "quem sou eu".
//
// `/api/users/:id/set-password` mora AQUI e não no `user.maestro.ts` pelo mesmo
// motivo de `/api/users/:id/holdings` morar no `assignment.maestro.ts`: a rota
// pendura em `/api/users` mas o assunto é credencial, não cadastro. Manter isso
// separado é o que deixa o CRUD de colaborador continuar sem saber o que é um
// `passwordHash` — e o `USER_PUBLIC_SELECT` continuar sendo a única porta de
// saída de um usuário.
/**
 * O que TODA rota de credencial ganha a mais, num lugar só.
 *
 * - `bodyLimit` de 8 KiB: o teto global do Fastify é 1 MiB, e o login é a única
 *   rota que um anônimo alcança. Sem limite próprio, qualquer um empurra 1 MiB
 *   por requisição e o servidor gasta parse antes de descobrir que a senha está
 *   errada. Nenhum corpo legítimo daqui passa de algumas centenas de bytes.
 * - `semCache`: a resposta carrega `Set-Cookie` de sessão.
 * - `verificarOrigem`: segunda camada anti-CSRF atrás do `SameSite` do cookie.
 */
const ROTA_DE_CREDENCIAL: RouteShorthandOptions = {
  bodyLimit: 8 * 1024,
  onRequest: semCache,
  preValidation: verificarOrigem,
};

export class AuthMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // A ÚNICA rota pública da API (ver a allowlist do server.ts): é assim que a
    // sessão nasce.
    server.post('/api/auth/login', { ...ROTA_DE_CREDENCIAL, ...LOGIN_RATE_LIMIT }, authController.login);

    server.post('/api/auth/logout', ROTA_DE_CREDENCIAL, authController.logout);
    server.get('/api/auth/me', { onRequest: semCache }, authController.me);

    server.post(
      '/api/users/:id/set-password',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.setPassword,
    );

    // TOKENS DO AGENTE (D80). Sob `/api`, com sessão: emitir credencial de
    // máquina é operação de administração. O RBAC que a restringe a um perfil
    // é a F11 — hoje qualquer sessão válida pode, como no resto do sistema.
    server.get('/api/agent-tokens', authController.listarTokens);
    server.post('/api/agent-tokens', { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT }, authController.emitirToken);
    server.post('/api/agent-tokens/:id/revoke', WRITE_RATE_LIMIT, authController.revogarToken);

    logger.info('[Maestro] Rotas de Autenticação inicializadas.');
  }
}
