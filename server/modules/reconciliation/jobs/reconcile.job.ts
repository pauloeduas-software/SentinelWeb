import { executarUmaVezPorJanela, inicioDoDia } from '../../../infra/jobs/claim-window';
import { createLogger } from '../../../infra/logger/logger';
import { expurgarTelemetriaAntiga } from '../../endpoint/use-cases/purge-telemetry.usecase';

// O QUE RODA SOZINHO, de hora em hora: o expurgo da telemetria, uma vez por dia.
// O último contato no computador saiu com a DD: os Sumidos contam as máquinas,
// pelo `lastSeen` delas.
//
// O vínculo não está aqui desde a DC: ele acontece no handshake e quando o
// computador é salvo (`auto-link-endpoint.usecase.ts`), como no GLPI, e não há
// fila nem varredura para esperar.

const logger = createLogger('reconcile.job');

const NOME_DO_JOB = 'reconciliacao';

/** Acorda de hora em hora e toma a janela DA HORA — não a do dia (D79). */
const INTERVALO_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/** O começo da hora corrente: a janela deste job. */
export function inicioDaHora(): Date {
  const inicio = new Date();
  inicio.setMinutes(0, 0, 0);
  return inicio;
}

/** Uma rodada. Exportada para o teste chamar sem `setInterval`. */
export async function rodarRodadaDaHora(): Promise<void> {
  await executarUmaVezPorJanela('expurgo-da-telemetria', inicioDoDia(), async () => {
    await expurgarTelemetriaAntiga();
  });
}

export function startReconcileJob(): void {
  if (timer) return;

  const rodar = () =>
    void executarUmaVezPorJanela(NOME_DO_JOB, inicioDaHora(), rodarRodadaDaHora);

  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.debug(`[Rodada] Job agendado (a cada ${INTERVALO_MS / 60000} min, 1x por hora).`);
}

export function stopReconcileJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
