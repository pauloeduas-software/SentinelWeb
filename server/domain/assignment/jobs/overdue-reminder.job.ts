import { executarUmaVezPorJanela, inicioDoDia } from '../../../core/jobs/claim-window';
import { enviar, urlDoPainel } from '../../../core/mail/mailer';
import { createLogger } from '../../../core/logger/logger';
import { listOverdueAssignments, type ItemVencido } from '../use-cases/list-overdue.usecase';

// O LEMBRETE DIÁRIO DE DEVOLUÇÃO — a outra metade da Etapa D da F4.
//
// A rota `/api/assignments/overdue` já existia: alguém precisa ABRIR a tela
// para descobrir o atraso. Este job é o que faz o sistema avisar sozinho, e por
// isso ele é a primeira coisa do projeto que escreve sem um formulário na
// frente — o que torna "quando ele roda" uma pergunta de produto.

const logger = createLogger('overdue-reminder');

/** O nome da linha em `job_runs`. Único no sistema (D79). */
const NOME_DO_JOB = 'lembrete-de-atraso';

/**
 * De quanto em quanto tempo ele ACORDA — não de quanto em quanto tempo ele
 * EXECUTA.
 *
 * São coisas diferentes, e a diferença é o D79: acordar de hora em hora e
 * tentar tomar a janela DIÁRIA significa que, em qualquer hora que o servidor
 * esteja de pé, o lembrete do dia sai — e sai UMA vez, porque a segunda
 * tentativa encontra a janela tomada.
 *
 * O `setInterval` do `zombie-cleaner.job.ts` não serve de modelo aqui: ele
 * reinicia o contador a cada deploy, o que é inofensivo para um job de 2 em 2
 * minutos e errado para um diário — subir três vezes numa manhã mandaria três
 * cobranças do mesmo notebook.
 */
const INTERVALO_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/** Agrupa por destinatário: uma pessoa com 3 atrasos recebe UM e-mail, não 3. */
function porDestinatario(itens: ItemVencido[]): Map<string, ItemVencido[]> {
  const mapa = new Map<string, ItemVencido[]>();

  for (const item of itens) {
    // Os responsáveis RESOLVIDOS (Camada 3): no alvo `LOCATION` são os
    // ocupantes do posto, e cada um recebe. É a mesma regra do aviso de
    // entrega — quem responde pelo equipamento é quem precisa saber.
    for (const responsavel of item.posse.responsaveis) {
      const email = responsavel.email?.trim();
      if (!email) continue;

      const lista = mapa.get(email) ?? [];
      lista.push(item);
      mapa.set(email, lista);
    }
  }

  return mapa;
}

function corpo(itens: ItemVencido[]): string {
  const linhas = itens.map((item) => {
    const nome = item.asset.name ? `${item.asset.assetTag} — ${item.asset.name}` : item.asset.assetTag;
    const dias = item.diasDeAtraso === 0 ? 'vence hoje' : `${item.diasDeAtraso} dia(s) de atraso`;
    return `- ${nome} (${dias})`;
  });

  return (
    'Estes equipamentos estão com a devolução em atraso:\n\n' +
    `${linhas.join('\n')}\n\n` +
    `Consulte em ${urlDoPainel()}/itam\n`
  );
}

/**
 * Manda um e-mail por pessoa com atraso.
 *
 * Exportado para o teste poder chamar a tarefa SEM o `setInterval` — o
 * agendamento é do processo, o conteúdo é do domínio, e testar os dois juntos
 * exigiria esperar uma hora.
 */
export async function enviarLembretesDeAtraso(): Promise<number> {
  const { rows, total } = await listOverdueAssignments();
  if (rows.length === 0) return 0;

  const grupos = porDestinatario(rows);

  for (const [email, itens] of grupos) {
    await enviar({
      para: [email],
      assunto:
        itens.length === 1
          ? 'Devolução de equipamento em atraso'
          : `${itens.length} devoluções de equipamento em atraso`,
      texto: corpo(itens),
    });
  }

  logger.info(
    `[Lembrete] ${total} posse(s) vencida(s); ${grupos.size} destinatário(s) avisado(s).`,
  );
  return grupos.size;
}

export function startOverdueReminderJob(): void {
  if (timer) return;

  const rodar = () =>
    void executarUmaVezPorJanela(NOME_DO_JOB, inicioDoDia(), async () => {
      await enviarLembretesDeAtraso();
    });

  // A PRIMEIRA tentativa é no boot, e não daqui a uma hora: subir o servidor às
  // 9h e só tentar às 10h atrasaria o lembrete sem motivo. Quem impede a
  // duplicata é a janela, não o relógio.
  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.info(`[Lembrete] Job de atraso agendado (a cada ${INTERVALO_MS / 60000} min, 1x por dia).`);
}

export function stopOverdueReminderJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
