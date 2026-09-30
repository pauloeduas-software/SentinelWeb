import { executarUmaVezPorJanela } from '../../../core/jobs/claim-window';
import { inicioDaJanelaLocal, inicioDoDiaLocal } from '../../../core/time/local-day';
import { createLogger } from '../../../core/logger/logger';
import { lerConfiguracaoDoCicloDeVida } from '../../settings/helpers/lifecycle-settings.helper';
import { rodarAlertasDiarios } from '../use-cases/run-daily-alerts.usecase';

// O JOB DIÁRIO — e ele é a primeira coisa do projeto que avisa sobre algo que
// NÃO aconteceu.
//
// Os outros três jobs reagem a um fato: o agente bateu, a máquina sumiu, o prazo
// de devolução venceu. A garantia vencendo dispara porque o CALENDÁRIO andou — e é
// isso que torna "quando ele roda" uma pergunta de produto, não de infraestrutura.

const logger = createLogger('daily-alerts');

/** O nome da linha em `job_runs`. Único no sistema (D79). */
const NOME_DO_JOB = 'alertas-diarios';

/**
 * De quanto em quanto tempo ele ACORDA — não de quanto em quanto tempo ele
 * EXECUTA.
 *
 * UMA HORA, que é o período do lembrete de atraso e da reconciliação. A primeira
 * versão do plano pedia 15 minutos, e não há ganho: quatro tentativas por hora de
 * tomar a MESMA janela diária são três `UPDATE` que devolvem `count: 0`. Período
 * igual ao dos vizinhos é uma coisa a menos para explicar.
 *
 * E não é `setInterval(24h)`, que é o D56: aquele conta a partir do BOOT, então um
 * processo que reinicia mais de uma vez por dia — `tsx watch`, dois deploys numa
 * tarde — nunca chega às 24 h e o job NUNCA dispara. Não é atraso: é ausência
 * total, em silêncio.
 */
const INTERVALO_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/**
 * A rodada de hoje, se já deu a hora.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * AS DUAS GUARDAS SÃO DIFERENTES, E CADA UMA RESPONDE UMA PERGUNTA.
 *
 *   `alertHour` decide QUANDO a rodada pode começar   → a comparação abaixo
 *   o dia local decide SE ela já aconteceu            → a janela em `job_runs`
 *
 * `inicioDaJanelaLocal` devolve HOJE às `alertHour` no fuso configurado — um
 * instante que pode estar no FUTURO (às 3h, com `alertHour: 8`). Sem a comparação
 * explícita, o job tomaria a janela do dia no primeiro tick depois da meia-noite e
 * o campo `alertHour` na tela não mudaria nada.
 *
 * ⚠️ A JANELA TOMADA É A MEIA-NOITE LOCAL, NÃO A HORA DO DISPARO — e essa
 * diferença é um bug consertado.
 *
 * Com `alertHour` na janela, mudar a configuração no meio do dia disparava uma
 * SEGUNDA rodada: rodou às 8h (`lastRunAt` = 08:05), alguém troca `alertHour` para
 * 20, e às 20h o `updateMany` casa (`08:05 < 20:00`) e manda o e-mail do dia outra
 * vez. O `dedupeKey` protege o banco de duplicar linha; ele não protege a caixa de
 * entrada, e é a caixa de entrada que perde a confiança.
 *
 * Com a meia-noite local como janela, a pergunta que o `job_runs` responde passa a
 * ser a certa — "já rodou HOJE?" —, e ela não depende de uma configuração que
 * alguém pode mexer entre duas tentativas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
async function tentarRodada(): Promise<void> {
  const { timezone, alertHour } = await lerConfiguracaoDoCicloDeVida();

  // Ainda não deu a hora configurada: nem tenta tomar a janela.
  if (new Date() < inicioDaJanelaLocal(timezone, alertHour)) return;

  await executarUmaVezPorJanela(NOME_DO_JOB, inicioDoDiaLocal(timezone), async () => {
    await rodarAlertasDiarios();
  });
}

export function startDailyAlertsJob(): void {
  if (timer) return;

  // O `try/catch` protege o passo que vem ANTES da tarefa (a leitura da
  // configuração): uma rejeição solta dentro de `setInterval` é *unhandled
  // rejection*, e no Node 15+ isso derruba o processo — o banco reiniciando por
  // trinta segundos passaria a ser motivo de o servidor cair.
  const rodar = () =>
    void (async () => {
      try {
        await tentarRodada();
      } catch (error) {
        logger.error('[Alertas] Falha ao avaliar a janela do dia.', error);
      }
    })();

  // A primeira tentativa é no BOOT, e não daqui a uma hora: subir o servidor às
  // 9h e só tentar às 10h atrasaria o aviso sem motivo. Quem impede a duplicata é
  // a janela, não o relógio.
  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.info(`[Alertas] Job agendado (a cada ${INTERVALO_MS / 60000} min, 1x por dia).`);
}

export function stopDailyAlertsJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
