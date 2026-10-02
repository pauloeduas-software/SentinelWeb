import type { FastifyInstance } from 'fastify';
import { accessController } from './controllers/access.controller';
import { oidcController } from './controllers/oidc.controller';
import { lerConfiguracaoOidc } from './helpers/directory-config.helper';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('access.maestro');

// ACESSO — grupos e permissões (F11).
//
// NENHUMA ROTA AQUI ESCREVE `preHandler` DE PERMISSÃO, e isso não é esquecimento:
// a exigência de cada uma está declarada em
// `access/helpers/route-permissions.ts` e aplicada pelo hook global
// (`core/http/permission-guard.ts`). Rota nova neste arquivo — ou em qualquer
// outro maestro — **derruba o boot** até ser declarada lá (D137).
//
// O token de API do AGENTE continua em `auth.maestro.ts`, onde sempre esteve: o
// caminho de autenticação por token é um só (D80), e o token é da sessão, não do
// acesso. O que entra aqui é o token PESSOAL, pela rota `/api/me/tokens`.
export class AccessMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // O catálogo de chaves — antes dos grupos porque a tela o lê primeiro, para
    // ter o que desenhar nas caixas de seleção.
    server.get('/api/permissions', accessController.permissoes);

    server.get('/api/groups', accessController.list);
    // Estática antes da paramétrica: o find-my-way resolve por especificidade,
    // então a ordem aqui é para quem LÊ o arquivo.
    server.get('/api/groups/options', accessController.options);
    server.get('/api/groups/:id', accessController.get);
    server.post('/api/groups', WRITE_RATE_LIMIT, accessController.create);
    server.put('/api/groups/:id', WRITE_RATE_LIMIT, accessController.update);
    server.delete('/api/groups/:id', WRITE_RATE_LIMIT, accessController.remove);

    // O ACESSO DE UMA PESSOA. Mora aqui, e não no `user.maestro.ts`, porque o
    // dono do dado é o grupo: quem decide o que `access.manage` concede é este
    // domínio, e o `user` não tem o que opinar sobre permissão.
    server.get('/api/users/:id/permissions', accessController.permissoesDoUsuario);
    server.put('/api/users/:id/groups', WRITE_RATE_LIMIT, accessController.definirGrupos);

    // ── O DIRETÓRIO E O SSO (F11, Etapa I) ──────────────────────────────
    //
    // A LEITURA é dispensada de chave (dois booleanos, nada de endpoint nem de
    // segredo); o resto exige `settings.manage` ou `access.manage`, declarados no
    // mapa de rotas.
    server.get('/api/access/directory', accessController.diretorio);
    server.post('/api/access/directory/sync', WRITE_RATE_LIMIT, accessController.sincronizarDiretorio);
    server.put(
      '/api/users/:id/auth-source',
      WRITE_RATE_LIMIT,
      accessController.definirOrigemDaIdentidade,
    );

    // ── AS DUAS ROTAS DO SSO SÓ NASCEM CONFIGURADAS ─────────────────────
    //
    // Mesma escolha do backup (F10, Etapa A), e aqui ela vale dobrado: as duas são
    // PÚBLICAS (quem as alcança ainda não tem sessão — é por elas que a sessão
    // nasce). Uma rota pública que existe sem provedor configurado é superfície de
    // ataque que responde erro; sem configuração, ela simplesmente não existe, e o
    // 404 é a resposta certa.
    //
    // ⚠️ ELAS ESTÃO EM `ROTAS_PUBLICAS` (server/app.ts). Rota nova aqui que NÃO
    // esteja naquela lista nasce exigindo sessão — que é o padrão certo para todo o
    // resto e o errado para estas duas.
    if (lerConfiguracaoOidc()) {
      server.get('/api/auth/oidc/start', oidcController.iniciar);
      server.get('/api/auth/oidc/callback', oidcController.callback);
      logger.info('[Maestro] SSO (OIDC) LIGADO: /api/auth/oidc/start e /callback registradas.');
    } else {
      logger.info('[Maestro] SSO (OIDC) DESLIGADO (sem OIDC_ISSUER). Nenhuma rota registrada.');
    }

    logger.info('[Maestro] Rotas de Acesso inicializadas.');
  }
}
