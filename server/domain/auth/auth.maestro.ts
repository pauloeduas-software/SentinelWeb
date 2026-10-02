import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { authController } from './controllers/auth.controller';
import { semCache, verificarOrigem } from './helpers/auth-hardening.helper';
import { exigirSessaoDeCookie } from './helpers/authenticate-request.helper';
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
 * - `exigirSessaoDeCookie`: token pessoal de API não mexe em credencial (F11, H).
 *   Um token que emite tokens é um token que não se revoga, e um token que
 *   desliga o segundo fator é o segundo fator desligado. No login a flag é
 *   `undefined` e o hook passa — é o que mantém a rota pública funcionando.
 */
const ROTA_DE_CREDENCIAL: RouteShorthandOptions = {
  bodyLimit: 8 * 1024,
  onRequest: semCache,
  preValidation: verificarOrigem,
  preHandler: exigirSessaoDeCookie,
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
    // máquina é operação de administração — e desde a F11 ela exige
    // `access.manage`, declarado em `access/helpers/route-permissions.ts`. A
    // exigência NÃO está escrita aqui de propósito: rota que declara a própria
    // permissão no maestro é rota que nasce liberada quando alguém esquece (D137).
    //
    // Note a diferença com as três de `/api/me/tokens`, logo abaixo: lá o token é
    // da PESSOA e não exige chave nenhuma; aqui ele é de uma MÁQUINA da frota, e
    // quem o emite está distribuindo acesso ao `/agent-hub`.
    server.get('/api/agent-tokens', authController.listarTokens);
    server.post('/api/agent-tokens', { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT }, authController.emitirToken);
    server.post('/api/agent-tokens/:id/revoke', WRITE_RATE_LIMIT, authController.revogarToken);

    // ── O SEGUNDO FATOR (F11, Etapa H) ───────────────────────────────────
    //
    // TODAS SOB `ROTA_DE_CREDENCIAL`: a resposta do `enroll` carrega o segredo e
    // a do `confirm` carrega os códigos de recuperação — as duas precisam de
    // `no-store` (um proxy que guarde isso entrega o segundo fator a quem passar
    // depois) e de `Origin` conferida.
    //
    // A LEITURA fica de fora: ela diz "está ativo?" e nada mais, é o que a tela
    // chama ao abrir, e exigir `Origin` numa leitura quebraria o GET do painel
    // em desenvolvimento sem proteger nada.
    server.get('/api/auth/totp', { onRequest: semCache }, authController.statusDoSegundoFator);
    server.post(
      '/api/auth/totp/enroll',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.iniciarSegundoFator,
    );
    server.post(
      '/api/auth/totp/confirm',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.confirmarSegundoFator,
    );
    // `POST .../disable` e não `DELETE /api/auth/totp`: desativar exige um CÓDIGO
    // no corpo, e corpo em `DELETE` é mal suportado por proxy e por cliente HTTP.
    // É a mesma escolha de `/revoke` e `/retire` no resto do sistema.
    server.post(
      '/api/auth/totp/disable',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.desativarSegundoFator,
    );

    // ── O TOKEN PESSOAL (F11, Etapa H) ───────────────────────────────────
    //
    // `/api/me/...` porque o dono sai da SESSÃO: sem `:id` na URL não existe o
    // caso "mandei o id de outra pessoa". Ver o controller.
    //
    // A EMISSÃO E A REVOGAÇÃO SÃO DE CREDENCIAL; a listagem não — ela não devolve
    // segredo nenhum (só prefixo e datas) e é o que a tela lê ao abrir.
    server.get('/api/me/tokens', authController.listarMeusTokens);
    server.post(
      '/api/me/tokens',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.emitirMeuToken,
    );
    server.post(
      '/api/me/tokens/:id/revoke',
      { ...ROTA_DE_CREDENCIAL, ...WRITE_RATE_LIMIT },
      authController.revogarMeuToken,
    );

    logger.info('[Maestro] Rotas de Autenticação inicializadas.');
  }
}
