import { markStaleAssetsOffline } from '../use-cases/mark-stale-assets-offline.usecase';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('zombie-cleaner.job');

const INTERVAL_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

async function run(): Promise<void> {
  try {
    const count = await markStaleAssetsOffline();
    if (count > 0) {
      logger.info(`[Job] ${count} agente(s) sem sinal marcado(s) como OFFLINE.`);
    }
  } catch (error) {
    // Falha de uma rodada não derruba o job: a próxima tenta de novo
    logger.error('[Job] Falha ao limpar agentes zumbis:', error);
  }
}

// O `setInterval` solto do antigo agent-hub.ts nunca era parado: no encerramento
// o processo podia sair no meio de uma rodada, e em `tsx watch` cada recarga
// deixava mais um temporizador vivo. Start/stop explícitos resolvem os dois.
export function startZombieCleanerJob(): void {
  if (timer) return;
  timer = setInterval(() => void run(), INTERVAL_MS);
  logger.info(`[Job] Limpeza de agentes zumbis a cada ${INTERVAL_MS / 1000}s.`);
}

export function stopZombieCleanerJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
