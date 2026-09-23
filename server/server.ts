import { getPort, validateEnv } from './core/config/env';
import { createLogger } from './core/logger/logger';
import { checkDependencies, isHealthy } from './core/lifecycle/health';
import { installProcessHandlers, onShutdown } from './core/lifecycle/shutdown';
import { closeDatabase } from './core/database/prismaClient';
import { disconnectAllAgents } from './domain/agent/agent.registry';
import { startZombieCleanerJob, stopZombieCleanerJob } from './domain/endpoint/jobs/zombie-cleaner.job';
import { startOverdueReminderJob, stopOverdueReminderJob } from './domain/assignment/jobs/overdue-reminder.job';
import { buildApp } from './app';

const logger = createLogger('server');

// O PROCESSO. Quem monta a aplicação é o `app.ts` — aqui mora só o que existe
// por ela estar rodando como servidor de verdade: validar o ambiente, recusar
// subir sem banco, ligar os jobs, abrir a porta e saber morrer.
//
// A divisão é o que torna a aplicação testável sem servidor (ver `app.ts`).

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
  onShutdown('job de lembrete de atraso', stopOverdueReminderJob);
  onShutdown('conexões de agente', disconnectAllAgents);
  onShutdown('servidor HTTP', () => server.close());
  onShutdown('banco de dados', closeDatabase);

  startZombieCleanerJob();
  // O lembrete de atraso acorda de hora em hora e executa UMA vez por dia — a
  // janela diária fica em `job_runs` e sobrevive ao deploy (D79). Sem ela, subir
  // o servidor três vezes numa manhã mandaria três cobranças do mesmo notebook.
  startOverdueReminderJob();

  const port = getPort();
  await server.listen({ port, host: '0.0.0.0' });
  logger.info(`🚀 [Server] Sentinel API operando em http://localhost:${port}`);
}

installProcessHandlers();

bootstrap().catch((error) => {
  logger.error('[Server] Falha crítica no bootstrap. Encerrando processo...', error);
  process.exit(1);
});
