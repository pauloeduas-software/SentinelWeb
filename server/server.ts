import { getPort, validateEnv } from './infra/config/env';
import { createLogger } from './infra/logger/logger';
import { checkDependencies, isHealthy } from './infra/lifecycle/health';
import { installProcessHandlers, onShutdown } from './infra/lifecycle/shutdown';
import { closeDatabase } from './infra/database/prismaClient';
import { disconnectAllAgents } from './modules/agent/agent.registry';
import { startZombieCleanerJob, stopZombieCleanerJob } from './modules/endpoint/jobs/zombie-cleaner.job';
import { startReconcileJob, stopReconcileJob } from './modules/reconciliation/jobs/reconcile.job';
import { buildApp } from './app';
import { imprimirBanner } from './infra/logger/banner';
import { isProduction } from './infra/config/env';
import { CAMINHO_DO_SWAGGER } from './modules/api-docs/api-docs.maestro';

const logger = createLogger('server');

// O PROCESSO. Quem monta a aplicação é o `app.ts` — aqui mora só o que existe
// por ela estar rodando como servidor de verdade: validar o ambiente, recusar
// subir sem banco, ligar os jobs, abrir a porta e saber morrer.
//
// A divisão é o que torna a aplicação testável sem servidor (ver `app.ts`).

async function bootstrap() {
  // Variável obrigatória ausente derruba o boot aqui (catch → log limpo +
  // exit 1), em vez de virar erro em runtime na primeira requisição.
  const avisos = validateEnv();

  // Sem banco o servidor não atende ninguém: não sobe "meio vivo" — falha no
  // boot e o orquestrador tenta de novo.
  logger.debug('[Server] Verificando dependências...');
  const health = await checkDependencies();
  if (!isHealthy(health)) {
    throw new Error(`Dependências indisponíveis no boot: ${JSON.stringify(health)}`);
  }

  const server = await buildApp();

  // Encerramento gracioso, NESTA ordem: primeiro para quem gera trabalho novo
  // (job), depois quem recebe (agentes + HTTP) e só no fim a infraestrutura de
  // que todos dependem (banco).
  //
  // Registrado DEPOIS do `buildApp()` porque o passo do HTTP precisa da
  // instância. Os handlers de sinal (lá embaixo) já estão instalados desde o
  // início do processo e consultam esta lista só na hora de encerrar, então um
  // SIGTERM no meio do boot continua sendo tratado.
  onShutdown('job de agentes zumbis', stopZombieCleanerJob);
  onShutdown('job de reconciliação', stopReconcileJob);
  onShutdown('conexões de agente', disconnectAllAgents);
  onShutdown('servidor HTTP', () => server.close());
  onShutdown('banco de dados', closeDatabase);

  startZombieCleanerJob();
  // A reconciliação acorda de hora em hora e executa UMA vez por hora (mesma
  // janela do D79, com granularidade diferente). Fora do `app.ts` pelo mesmo
  // motivo do outro: job com `setInterval` dentro de teste é escrita
  // concorrente em banco compartilhado.
  startReconcileJob();
  const port = getPort();
  // O Fastify anuncia cada endereço da máquina ("Server listening at ...") em
  // `info`, sem opção para desligar. Em desenvolvimento quem diz o endereço é o
  // bloco abaixo, então o anúncio fica de fora; em produção ele continua no log.
  const nivel = server.log.level;
  if (!isProduction) server.log.level = 'warn';
  await server.listen({ port, host: '0.0.0.0' });
  server.log.level = nivel;
  // Em desenvolvimento, o bloco no formato do Vite (`banner.ts`); em produção, a
  // linha no log JSON. O Swagger é do back e só existe fora de produção (AS).
  if (isProduction) {
    logger.info(`[Server] Sentinel API operando em http://localhost:${port}`);
  } else {
    imprimirBanner([
      { rotulo: 'API', url: `http://localhost:${port}/api` },
      { rotulo: 'Swagger', url: `http://localhost:${port}${CAMINHO_DO_SWAGGER}` },
    ]);
  }
  for (const aviso of avisos) logger.warn(aviso);
}

installProcessHandlers();

/**
 * A porta já está ocupada — que NÃO é falha do servidor, é dois dele rodando.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE CASO GANHOU MENSAGEM PRÓPRIA
 *
 * Existem DOIS scripts que sobem o backend, e é fácil ter os dois de pé sem
 * perceber:
 *
 *   npm run dev          concurrently: vite + tsx watch server/server.ts
 *   npm run dev:server   tsx watch server/server.ts
 *
 * Com um `dev:server` esquecido num terminal, todo `npm run dev` colide — e o
 * que aparecia era um stack trace de `node:net` dentro de um "Falha crítica no
 * bootstrap". A pilha não menciona porta, nem script, nem o outro processo:
 * ela aponta para dentro do Node, que é o único lugar onde não está o problema.
 *
 * Aqui o erro não é do sistema, é do ambiente de quem está desenvolvendo — e a
 * regra do docs/referencia/invariantes.md vale igual: *se a mensagem não ensina o que
 * fazer em seguida, ela ainda não está pronta*.
 *
 * Sem o `error` no log de propósito: a pilha não acrescenta nada a um
 * diagnóstico que já é certo, e ela é justamente o que fazia a mensagem
 * parecer um defeito do servidor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function ehPortaOcupada(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null
    && (erro as { code?: unknown }).code === 'EADDRINUSE';
}

bootstrap().catch((error) => {
  if (ehPortaOcupada(error)) {
    // `getPort()` é seguro aqui: EADDRINUSE só nasce do `listen`, que acontece
    // depois do `validateEnv()`.
    const port = getPort();
    logger.error(
      `[Server] A porta ${port} já está em uso — outro servidor Sentinel está rodando. `
      + 'Provavelmente um "npm run dev:server" esquecido num terminal, que colide com a metade '
      + `"back" do "npm run dev". Quem está segurando: lsof -ti:${port} — e para encerrar: `
      + `kill $(lsof -ti:${port}). Rode UM dos dois, não os dois.`,
    );
    process.exit(1);
  }

  logger.error('[Server] Falha crítica no bootstrap. Encerrando processo...', error);
  process.exit(1);
});
