import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { authController } from './controllers/auth.controller';
import { verificarOrigem } from './helpers/auth-hardening.helper';
import { createLogger } from '../../infra/logger/logger';
import { LOGIN_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('auth.maestro');

// Login, logout e "quem sou eu". A senha de cada pessoa é definida no cadastro
// e na edição do usuário (`user.maestro.ts`), que reaproveitam o
// `verificarOrigem` daqui.
/**
 * O que TODA rota de credencial ganha a mais, num lugar só.
 *
 * - `bodyLimit` de 8 KiB: o teto global do Fastify é 1 MiB, e o login é a única
 *   rota que um anônimo alcança. Sem limite próprio, qualquer um empurra 1 MiB
 *   por requisição e o servidor gasta parse antes de descobrir que a senha está
 *   errada. Nenhum corpo legítimo daqui passa de algumas centenas de bytes.
 * - `verificarOrigem`: segunda camada anti-CSRF atrás do `SameSite` do cookie.
 */
const ROTA_DE_CREDENCIAL: RouteShorthandOptions = {
  bodyLimit: 8 * 1024,
  preValidation: verificarOrigem,
};

export class AuthMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // A ÚNICA rota pública da API (ver o `ROTAS_PUBLICAS` do app.ts): é assim que a
    // sessão nasce.
    server.post('/api/auth/login', { ...ROTA_DE_CREDENCIAL, ...LOGIN_RATE_LIMIT }, authController.login);

    server.post('/api/auth/logout', ROTA_DE_CREDENCIAL, authController.logout);
    server.get('/api/auth/me', authController.me);

    // Minha conta (AR). A troca de senha recebe senha, então leva o que toda rota
    // de credencial leva, e o teto por IP do login: é a única outra rota em que
    // repetir a requisição é adivinhar a senha atual.
    server.patch('/api/auth/me', ROTA_DE_CREDENCIAL, authController.atualizarPerfil);
    server.put('/api/auth/password', { ...ROTA_DE_CREDENCIAL, ...LOGIN_RATE_LIMIT }, authController.trocarSenha);

    logger.debug('[Maestro] Rotas de Autenticação inicializadas.');
  }
}
