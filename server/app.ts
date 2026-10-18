import fs from 'fs';
import path from 'path';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';

import { getJwtSecret, isProduction, tetoDeRequisicaoLigado } from './core/config/env';
import { getCorsOrigins } from './core/config/cors';
import { createLogger, rootLogger } from './core/logger/logger';
import { generateRequestId, registerRequestLogger } from './core/logger/request-logger';
import { registerErrorHandler } from './core/errors/error-handler';
import { registerAuthGuard, type RotaPublica } from './core/http/require-auth';
import { registerPermissionGuard } from './core/http/permission-guard';

import { AuthMaestro } from './domain/auth/auth.maestro';

import { exigenciaDaRota } from './domain/access/helpers/route-permissions';
import { exigirPermissao } from './domain/access/helpers/require-permission';
import { autenticarRequisicao } from './domain/auth/helpers/authenticate-request.helper';
import { COOKIE_SESSAO, SESSAO_SEGUNDOS } from './domain/auth/helpers/session-cookie.helper';
import { AgentMaestro } from './domain/agent/agent.maestro';
import { EndpointMaestro } from './domain/endpoint/endpoint.maestro';
import { ReconciliationMaestro } from './domain/reconciliation/reconciliation.maestro';
import { CatalogMaestro } from './domain/catalog/catalog.maestro';
import { AssetMaestro } from './domain/asset/asset.maestro';
import { SettingsMaestro } from './domain/settings/settings.maestro';
import { UserMaestro } from './domain/user/user.maestro';
import { AssignmentMaestro } from './domain/assignment/assignment.maestro';
import { OccupancyMaestro } from './domain/occupancy/occupancy.maestro';
import { WorkstationMaestro } from './domain/workstation/workstation.maestro';
import { StockMaestro } from './domain/stock/stock.maestro';
import { LicenseMaestro } from './domain/license/license.maestro';
import { buildReadinessReport, checkDependencies } from './core/lifecycle/health';
import { countAgentsOnline } from './domain/agent/agent.registry';

const logger = createLogger('app');

// A MONTAGEM da aplicação, separada de SUBIR o servidor (server.ts).
//
// POR QUE OS DOIS ARQUIVOS: enquanto `server.ts` fazia as duas coisas, importá-lo
// abria porta, ligava job e instalava handler de sinal — então testar uma rota
// só era possível por fora, com o servidor de pé e `curl`. Foi assim que as duas
// suítes da auditoria (120 e depois 34 asserções) nasceram descartáveis: elas
// testavam um PROCESSO, não a aplicação.
//
// Com a montagem isolada, o teste faz `buildApp()` e `app.inject()` — requisição
// em memória, pelo MESMO Fastify que produção monta: mesmos plugins, mesma ordem,
// mesmo `preHandler` global, mesmo error-handler. Sem porta, sem `listen`, sem
// esperar o boot. O que o teste exercita é o que roda em produção, e é essa
// igualdade que dá valor ao resultado.
//
// O QUE FICA DE FORA daqui, de propósito, e mora no `server.ts`:
//   - `validateEnv()`    — é passo de BOOT: precisa rodar antes de tudo para
//                          derrubar o processo com a lista do que falta.
//   - `checkDependencies()` no boot — "não subir meio vivo" é decisão de
//                          processo; o teste já tem banco por construção.
//   - `startZombieCleanerJob()` — job com `setInterval` dentro de teste é
//                          escrita concorrente em banco compartilhado, e o
//                          processo do vitest não encerraria.
//   - `listen`, `onShutdown`, `installProcessHandlers()` — tudo do processo.

// A API é FECHADA por padrão: o `preHandler` global exige sessão em tudo, e
// esta lista é a exceção inteira (docs/historico/fase-03-autenticacao-e-ator.md, Etapa C).
//
// Ela mora aqui, e não dentro de `core/http/require-auth.ts`, porque saber que
// o `/agent-hub` tem autenticação própria é conhecimento de NEGÓCIO — e `core`
// não importa `domain`. Rota nova nasce protegida: quem quiser abrir uma
// escreve a linha e o motivo aqui, onde a decisão fica visível na revisão.
const ROTAS_PUBLICAS: readonly RotaPublica[] = [
  { method: 'GET', path: '/health', motivo: 'liveness do container, que não tem sessão' },
  { method: 'GET', path: '/health/ready', motivo: 'readiness do monitoramento, que também não tem' },
  { method: 'POST', path: '/api/auth/login', motivo: 'é por onde a sessão nasce' },
  { method: 'GET', path: '/agent-hub', motivo: 'autenticação própria (AGENT_TOKEN)' },
];

export interface OpcoesDaAplicacao {
  /**
   * Registrar o teto de requisições por IP.
   *
   * ═════════════════════════════════════════════════════════════════════════
   * POR QUE ELE É DESLIGADO NO TESTE, e por que isso não enfraquece a suíte.
   *
   * O teto conta requisições por IP, em memória, por instância da aplicação. A
   * suíte inteira vem de um IP só, e cada arquivo de teste é uma rajada de
   * dezenas de escritas em segundos — várias em rota DESTRUTIVA, teto de dez. O
   * teto não está medindo abuso ali, está medindo o tamanho do arquivo.
   *
   * E o preço disso era pago na moeda errada. A regra "um `criarApi()` por
   * arquivo" existia por causa do contador; arquivo que crescia era DIVIDIDO
   * para caber no teto, com o assunto partido em dois pela aritmética de um
   * limitador; e quando o teto estourava, a resposta era 429 numa asserção que
   * esperava 409 — uma falha que não fala do que o teste investiga, e que muda
   * de lugar conforme a ordem.
   *
   * O que NÃO se perde: o limitador continua montado igual em produção e em
   * desenvolvimento, e `tests/invariantes/teto-de-requisicao.test.ts` monta uma
   * instância COM ele e prova o 429 — é o único lugar da suíte onde o teto é o
   * assunto, que é exatamente onde ele deve ser exercitado.
   *
   * Este é o ÚNICO atalho que o ambiente de teste tem. Nenhuma outra guarda —
   * de sessão, de permissão ou de invariante — pergunta o ambiente: teste que
   * roda contra regra diferente da de produção não prova nada sobre produção.
   * ═════════════════════════════════════════════════════════════════════════
   */
  comTetoDeRequisicao?: boolean;
}

/**
 * Monta a aplicação inteira e devolve sem abrir porta nenhuma.
 *
 * Quem chama decide o que fazer com ela: `server.ts` liga os jobs e chama
 * `listen`; o teste chama `inject`.
 */
export async function buildApp(
  { comTetoDeRequisicao = tetoDeRequisicaoLigado(process.env.NODE_ENV) }: OpcoesDaAplicacao = {},
): Promise<FastifyInstance> {
  // PRODUÇÃO NÃO SOBE SEM TETO, aconteça o que acontecer com o padrão acima.
  //
  // O padrão é uma expressão, e expressão se edita: trocá-lo por `false` deixaria
  // a suíte inteira verde — ela afirma "desligado no teste" e afirma os números
  // "quando ligado", e nenhum teste pode montar uma aplicação de PRODUÇÃO para
  // conferir o padrão dela. Esta linha fecha isso pelo outro lado, do mesmo jeito
  // que o `verificarCobertura()` fecha a rota sem permissão declarada: em vez de
  // uma API exposta em silêncio, um processo que não sobe.
  if (isProduction && !comTetoDeRequisicao) {
    throw new Error(
      'buildApp: teto de requisições desligado em produção. Ele só é dispensado no '
        + 'harness de teste (server/core/config/env.ts, tetoDeRequisicaoLigado).',
    );
  }
  const server = Fastify({
    // Mesma instância de log da aplicação: requisição e domínio saem no mesmo
    // formato, com o mesmo nível e o mesmo destino.
    // O `as` fixa o tipo no logger base do Fastify: sem ele, a instância de pino
    // concreta vaza para o tipo do servidor e nenhum maestro aceitaria um
    // `FastifyInstance` comum como parâmetro.
    loggerInstance: rootLogger as FastifyBaseLogger,
    // O log automático do Fastify são DUAS linhas por requisição; com o painel
    // consultando a cada 5s isso vira ruído. Quem loga é o nosso hook, uma linha.
    logController: new LogController({ disableRequestLogging: true }),
    // Id da requisição (devolvido em X-Request-Id) sempre pelo nosso gerador
    requestIdHeader: false,
    genReqId: (req) => generateRequestId(req as unknown as { headers: Record<string, unknown> }),
  });

  // Traduz qualquer erro dos handlers em resposta HTTP, num lugar só
  registerErrorHandler(server);
  registerRequestLogger(server);

  await server.register(cors, { origin: getCorsOrigins(), credentials: true });

  // Teto de requisições por IP. O painel consulta /api/endpoints a cada 5s (12/min)
  // mais as listagens, então 300/min sobra para uso normal e corta repetição
  // automatizada. Rotas de escrita têm teto próprio, mais baixo, nos maestros.
  //
  // O `if` é o que o `comTetoDeRequisicao` governa, e o motivo está escrito na
  // opção. Note que ele desliga o plugin INTEIRO, e não só o teto de escrita: os
  // tetos por rota são `config.rateLimit` nas opções de cada rota, e sem o plugin
  // registrado esse `config` fica sendo um objeto que ninguém lê.
  if (comTetoDeRequisicao) {
    await server.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      // Health check de container bate sem parar e não pode ser barrado: ficar sem
      // resposta aqui faria o orquestrador reiniciar um servidor saudável.
      allowList: (request) => request.url.startsWith('/health'),
      // A resposta do 429 NÃO é montada aqui: o plugin lança o erro e quem traduz
      // é o core/errors/error-handler, único lugar do sistema que monta resposta
      // de erro. Com `errorResponseBuilder`, o objeto devolvido chegava ao handler
      // sem status reconhecível e virava 500.
    });
  }

  await server.register(websocket);

  // O cookie vem ANTES do jwt: é o @fastify/cookie que faz `request.cookies`
  // existir, e sem ele o `cookie:` abaixo não encontraria token nenhum.
  // Sem `secret`: o cookie não é assinado porque o conteúdo dele JÁ é um JWT
  // assinado — assinar a assinatura é custo sem ganho.
  await server.register(cookie);

  await server.register(jwt, {
    secret: getJwtSecret(),
    // Onde procurar o token. Com isto, `request.jwtVerify()` lê o cookie
    // httpOnly sozinho e nenhum controller precisa mexer em header (D22).
    cookie: { cookieName: COOKIE_SESSAO, signed: false },
    // TTL curto: o JWT sobrevive ao usuário (mandar alguém para a lixeira não
    // apaga o token que ele já tem no navegador). Quem realmente resolve isso é
    // o `preHandler`, que relê o usuário a cada requisição; o TTL é o teto.
    sign: { expiresIn: SESSAO_SEGUNDOS },
  });

  // A PORTA FECHADA, registrada ANTES dos maestros de propósito: hook de
  // instância vale para as rotas registradas depois dele, então esta ordem é o
  // que garante que nenhuma rota nova escape por ter sido declarada mais cedo.
  registerAuthGuard(server, {
    rotasPublicas: ROTAS_PUBLICAS,
    // Em produção o Fastify serve o `dist`: o HTML e o bundle precisam carregar
    // para a tela de login existir. Em desenvolvimento quem serve é o Vite, e
    // nada estático passa por aqui.
    estaticoPublico: isProduction,
    autenticar: autenticarRequisicao,
  });

  // A AUTORIZAÇÃO, depois da sessão e ANTES dos maestros — pela mesma razão de
  // ordem: hook de instância vale para as rotas registradas depois dele.
  //
  // `preHandler` roda na ordem de registro, então este sempre vê o
  // `request.cargo` que o guard de sessão acabou de pendurar.
  //
  // O `verificarCobertura` devolvido é chamado DEPOIS de todos os maestros: é
  // só lá que a tabela de rotas está completa (D137).
  const guardaDePermissao = registerPermissionGuard(server, {
    exigenciaDaRota,
    autorizar: exigirPermissao,
    rotasPublicas: ROTAS_PUBLICAS,
    foraDaConferencia: [
      { method: 'GET', path: '/health', motivo: 'liveness do container, que não tem sessão' },
      { method: 'GET', path: '/health/ready', motivo: 'readiness do monitoramento' },
      // O catch-all do painel. Não é rota de API: ele entrega o `index.html`
      // para qualquer caminho que não seja `/api` nem `/agent-hub`, e o próprio
      // guard de sessão já o libera por `estaticoPublico`.
      { method: 'GET', path: '/*', motivo: 'fallback do painel estático (entrega index.html)' },
    ],
  });

  logger.info('[App] Inicializando Maestros de Domínio...');
  // `auth` primeiro: é o domínio que todos os outros passaram a depender (o
  // `preHandler` acima já usa o `autenticarRequisicao` dele).
  await AuthMaestro.setupRoutes(server);
  await EndpointMaestro.setupRoutes(server);
  await CatalogMaestro.setupRoutes(server);
  await AssetMaestro.setupRoutes(server);
  await SettingsMaestro.setupRoutes(server);
  await UserMaestro.setupRoutes(server);
  // Posse e ocupação vêm DEPOIS de asset e user: as rotas deles pendem de
  // `/api/assets/:id` e `/api/users/:id`, e registrar na ordem em que o
  // recurso principal nasce é o que mantém o arquivo legível (docs/referencia/modelo-de-posse.md).
  await AssignmentMaestro.setupRoutes(server);
  await OccupancyMaestro.setupRoutes(server);
  // Posto vem por ÚLTIMO da fatia de posse: ele só lê o que os três acima
  // escrevem (localização, posse e ocupação), e nada depende dele.
  await WorkstationMaestro.setupRoutes(server);
  // ESTOQUE depois da posse: a saída de uma unidade aponta para pessoa e posto,
  // e a ficha do posto lê as unidades entregues a ele.
  await StockMaestro.setupRoutes(server);
  // LICENÇA depois de posse: as rotas dela pendem de `/api/assets/:id` (a aba
  // Licenças), e registrar na ordem em que o conceito nasce é o que mantém o
  // arquivo legível (docs/historico/fase-06-licencas.md).
  await LicenseMaestro.setupRoutes(server);
  // CONVERGÊNCIA por último: as rotas de vínculo pendem de `/api/endpoints/:id`
  // e `/api/assets/:id`, e a aba Máquina pendura no ativo. Registrar na ordem em
  // que o conceito nasce é o que mantém o arquivo legível
  // (docs/historico/fase-07-convergencia-rmm-itam.md).
  await ReconciliationMaestro.setupRoutes(server);
  await AgentMaestro.setupRoutes(server);

  // Liveness: o processo está de pé e respondendo. É o health check do
  // container: falhou, o container é reiniciado.
  server.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Readiness: o processo consegue ATENDER (banco respondendo). Para
  // monitoramento — NÃO é o health check do container (reiniciar o servidor
  // não conserta o banco fora do ar).
  server.get('/health/ready', async (_request, reply) => {
    const report = await buildReadinessReport(checkDependencies, countAgentsOnline);
    return reply.status(report.httpStatus).send(report.body);
  });

  // Frontend buildado (dist) — arquivos estáticos e fallback SPA
  if (isProduction) {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      await server.register(fastifyStatic, { root: distPath, wildcard: false });

      // Qualquer rota não-API entrega o index.html; o que é API cai no
      // notFoundHandler e responde JSON.
      server.get('/*', (request, reply) => {
        if (request.url.startsWith('/api') || request.url.startsWith('/agent-hub')) {
          return reply.callNotFound();
        }
        return reply.sendFile('index.html');
      });

      logger.info(`[App] Frontend estático servido de ${distPath}`);
    } else {
      logger.warn(`[App] NODE_ENV=production mas ${distPath} não existe. Rode "npm run build" antes.`);
    }
  }

  // A CONFERÊNCIA DE COBERTURA (D137) — aqui, e não antes: é neste ponto que
  // toda rota do sistema já passou pelo hook `onRoute`.
  //
  // LANÇA quando há rota sem exigência declarada, e lançar é o ponto inteiro:
  // um `logger.error` no boot é um erro que o deploy ignora, e a consequência de
  // ignorá-lo é uma rota que qualquer sessão alcança sem ninguém ter decidido
  // isso. Aqui, o processo não sobe e o `npm test` fica vermelho na hora.
  guardaDePermissao.verificarCobertura();

  // `ready()` força o Fastify a resolver o grafo de plugins AGORA, aqui dentro.
  // Sem isto, um erro de registro só apareceria na primeira requisição — no
  // teste, como uma falha de asserção sem relação nenhuma com a causa.
  await server.ready();

  return server;
}
