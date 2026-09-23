import { createLogger } from '../logger/logger';

const logger = createLogger('shutdown');

// Encerramento gracioso centralizado. Cada recurso registra como se fecha
// (onShutdown) e o encerramento roda os passos NA ORDEM de registro — quem
// gera ou recebe trabalho fecha primeiro (jobs, WebSockets, HTTP), a
// infraestrutura de que eles dependem fecha por último (banco).
type ShutdownStep = { name: string; fn: () => Promise<unknown> | unknown };

const steps: ShutdownStep[] = [];
let shuttingDown = false;

export function onShutdown(name: string, fn: ShutdownStep['fn']): void {
  steps.push({ name, fn });
}

export async function shutdown(reason: string, exitCode = 0, timeoutMs = 15_000): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[Server] Encerrando (${reason})...`);

  // Segurança: se algum passo travar, força a saída (código 1 = não foi limpo)
  setTimeout(() => {
    logger.error('[Server] Encerramento excedeu o tempo limite — saída forçada.');
    process.exit(1);
  }, timeoutMs).unref();

  for (const step of steps) {
    try {
      await step.fn();
      logger.info(`[Server] Encerrado: ${step.name}`);
    } catch (error) {
      logger.error(`[Server] Falha ao encerrar ${step.name}:`, error);
    }
  }

  process.exit(exitCode);
}

export function installProcessHandlers(): void {
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Promise rejeitada sem catch: é bug, mas não pode derrubar o monitoramento
  // de toda a frota — loga com destaque e segue.
  process.on('unhandledRejection', (reason) => {
    logger.error('[Server] unhandledRejection:', reason);
  });

  // Exceção não tratada deixa o processo em estado indefinido: encerra limpo e
  // sai com erro para o orquestrador (Docker) subir uma instância nova.
  process.on('uncaughtException', (error) => {
    logger.error('[Server] uncaughtException:', error);
    void shutdown('uncaughtException', 1);
  });
}
