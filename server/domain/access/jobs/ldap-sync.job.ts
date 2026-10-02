import { executarUmaVezPorJanela } from '../../../core/jobs/claim-window';
import { inicioDaJanelaLocal, inicioDoDiaLocal } from '../../../core/time/local-day';
import { createLogger } from '../../../core/logger/logger';
import { lerConfiguracaoDoCicloDeVida } from '../../settings/helpers/lifecycle-settings.helper';
import { lerConfiguracaoLdap } from '../helpers/directory-config.helper';
import { sincronizarComLdap } from '../use-cases/sync-ldap.usecase';

// O JOB DA SINCRONIZAÇÃO COM O DIRETÓRIO (F11, Etapa I).
//
// Mesmo desenho dos quatro jobs que já existem, e a linha em `job_runs` que o D79
// deixou pronta chamando-se `sync-ldap` desde a F8 — ela está escrita no comentário
// do `model JobRun` em prisma/schema.prisma desde então, esperando este arquivo.
//
// ═════════════════════════════════════════════════════════════════════════════
// O JOB NEM EXISTE SEM CONFIGURAÇÃO, e isso é diferente de "existe e falha".
//
// Sem `LDAP_URL` e companhia, `startLdapSyncJob()` não agenda nada e loga uma
// linha. A alternativa — agendar e descobrir no primeiro tick que não há
// configuração — produziria um erro por hora no log de toda instalação que não usa
// diretório, que é a maioria delas. É a mesma escolha das rotas de backup (F10,
// Etapa A): o que está desligado não aparece.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ldap-sync-job');

/** O nome da linha em `job_runs` (D79) — o mesmo que o schema já previa. */
const NOME_DO_JOB = 'sync-ldap';

/**
 * De quanto em quanto tempo ele ACORDA — não de quanto em quanto tempo EXECUTA.
 *
 * Uma hora, igual aos vizinhos. Quem garante uma rodada por dia é a janela em
 * `job_runs`, não este número: `setInterval(24h)` conta a partir do BOOT e um
 * processo que reinicia duas vezes por dia nunca chegaria às 24 h (D56).
 */
const INTERVALO_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/**
 * A rodada de hoje, se já deu a hora.
 *
 * REUSA `alertHour` E `timezone` DO CICLO DE VIDA em vez de criar um par próprio,
 * e a razão é de produto: a pergunta que a configuração responde é *"a que horas o
 * sistema faz as rondas dele?"*, e ela já tem resposta numa tela. Dois campos para
 * a mesma pergunta viram duas respostas divergentes no primeiro ajuste — e nenhum
 * operador quer decidir separadamente a hora do e-mail de garantia e a hora da
 * leitura do diretório.
 *
 * A ORDEM entre os dois jobs da mesma hora não é garantida e não importa: a
 * sincronização mexe em `users`, os alertas leem `assets`. Se um dia importar, o
 * jeito certo é um job chamar o outro, não deslocar relógios.
 */
async function tentarRodada(): Promise<void> {
  const { timezone, alertHour } = await lerConfiguracaoDoCicloDeVida();

  if (new Date() < inicioDaJanelaLocal(timezone, alertHour)) return;

  await executarUmaVezPorJanela(NOME_DO_JOB, inicioDoDiaLocal(timezone), async () => {
    const resultado = await sincronizarComLdap();

    // OS CONFLITOS VÃO PARA O LOG COM NOME, um por linha. Eles são o que exige
    // ação humana — e um número agregado ("3 conflitos") não diz a ninguém QUAL
    // pessoa precisa de vínculo explícito.
    for (const conflito of resultado.conflitos) {
      logger.warn(`[LDAP] Conflito em ${conflito.identificacao}: ${conflito.motivo}`);
    }
  });
}

export function startLdapSyncJob(): void {
  if (timer) return;

  if (!lerConfiguracaoLdap()) {
    logger.info('[LDAP] Sincronização DESLIGADA (sem LDAP_URL). Nenhum job agendado.');
    return;
  }

  // O `try/catch` protege o passo que vem ANTES da tarefa (a leitura da
  // configuração e a conexão com o diretório): uma rejeição solta dentro de
  // `setInterval` é *unhandled rejection*, e no Node 15+ isso derruba o processo —
  // um controlador de domínio fora do ar passaria a ser motivo de o servidor cair.
  const rodar = () =>
    void (async () => {
      try {
        await tentarRodada();
      } catch (error) {
        logger.error('[LDAP] Falha na sincronização com o diretório.', error);
      }
    })();

  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.info(`[LDAP] Job agendado (a cada ${INTERVALO_MS / 60000} min, 1x por dia).`);
}

export function stopLdapSyncJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
