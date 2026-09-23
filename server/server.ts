import fs from 'fs';
import path from 'path';
import Fastify, { LogController, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';

import { getPort, isProduction, validateEnv } from './core/config/env';
import { getCorsOrigins } from './core/config/cors';
import { createLogger, rootLogger } from './core/logger/logger';
import { generateRequestId, registerRequestLogger } from './core/logger/request-logger';
import { registerErrorHandler } from './core/errors/error-handler';
import { buildReadinessReport, checkDependencies, isHealthy } from './core/lifecycle/health';
import { installProcessHandlers, onShutdown } from './core/lifecycle/shutdown';
import { closeDatabase } from './core/database/prismaClient';

import { AgentMaestro } from './domain/agent/agent.maestro';
import { AssetMaestro } from './domain/asset/asset.maestro';
import { InventoryMaestro } from './domain/inventory/inventory.maestro';
import { UserMaestro } from './domain/user/user.maestro';
import { countAgentsOnline, disconnectAllAgents } from './domain/agent/agent.registry';
import { startZombieCleanerJob, stopZombieCleanerJob } from './domain/asset/jobs/zombie-cleaner.job';

const logger = createLogger('server');

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

async function bootstrap() {
  // Variável obrigatória ausente derruba o boot aqui (catch → log limpo +
  // exit 1), em vez de virar erro em runtime na primeira requisição.
  validateEnv();

  // Sem banco o servidor não atende ninguém: não sobe "meio vivo" — falha no
  // boot e o orquestrador tenta de novo.
  logger.info('[Server] Verificando dependências...');
  const health = await checkDependencies();
  if (!isHealthy(health)) {
    throw new Error(`Dependências indisponíveis no boot: ${JSON.stringify(health)}`);
  }

  // Traduz qualquer erro dos handlers em resposta HTTP, num lugar só
  registerErrorHandler(server);
  registerRequestLogger(server);

  await server.register(cors, { origin: getCorsOrigins(), credentials: true });

  // Teto de requisições por IP. O painel consulta /api/assets a cada 5s (12/min)
  // mais as listagens, então 300/min sobra para uso normal e corta repetição
  // automatizada. Rotas de escrita têm teto próprio, mais baixo, nos maestros.
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

  await server.register(websocket);

  logger.info('[Server] Inicializando Maestros de Domínio...');
  await AssetMaestro.setupRoutes(server);
  await InventoryMaestro.setupRoutes(server);
  await UserMaestro.setupRoutes(server);
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

      logger.info(`[Server] Frontend estático servido de ${distPath}`);
    } else {
      logger.warn(`[Server] NODE_ENV=production mas ${distPath} não existe. Rode "npm run build" antes.`);
    }
  }

  startZombieCleanerJob();

  const port = getPort();
  await server.listen({ port, host: '0.0.0.0' });
  logger.info(`🚀 [Server] Sentinel API operando em http://localhost:${port}`);
}

// Encerramento gracioso, NESTA ordem: primeiro para quem gera trabalho novo
// (job), depois quem recebe (agentes + HTTP) e só no fim a infraestrutura de
// que todos dependem (banco).
onShutdown('job de agentes zumbis', stopZombieCleanerJob);
onShutdown('conexões de agente', disconnectAllAgents);
onShutdown('servidor HTTP', () => server.close());
onShutdown('banco de dados', closeDatabase);

installProcessHandlers();

bootstrap().catch((error) => {
  logger.error('[Server] Falha crítica no bootstrap. Encerrando processo...', error);
  process.exit(1);
});
