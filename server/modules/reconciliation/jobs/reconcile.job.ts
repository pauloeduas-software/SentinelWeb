import { executarUmaVezPorJanela, inicioDoDia } from '../../../infra/jobs/claim-window';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { createLogger } from '../../../infra/logger/logger';
import { reconciliarEndpoint, valoresRepetidosNoParque } from '../use-cases/match-endpoint.usecase';
import { carimbarUltimoContatoNosAtivos } from '../use-cases/stamp-last-seen.usecase';
import { agregarUsoDosAtivos } from '../use-cases/aggregate-usage.usecase';
import { expurgarTelemetriaAntiga } from '../../endpoint/use-cases/purge-telemetry.usecase';
import {
  encerrarSugestoesObsoletas, expurgarSugestoesSubstituidas,
} from '../use-cases/invalidate-suggestions.usecase';
import { lerConfiguracaoDaDescoberta } from '../helpers/discovery-settings.helper';

// A VARREDURA — de hora em hora, sobre as máquinas SEM vínculo.
//
// Este é o único lugar da fase que roda sozinho, e ele existe porque a
// alternativa é pior: reconciliar dentro do handshake colocaria uma varredura do
// catálogo de ativos no caminho de ingestão, que roda a cada mensagem de cada
// máquina.

const logger = createLogger('reconcile.job');

const NOME_DO_JOB = 'reconciliacao';

/** Acorda de hora em hora e toma a janela DA HORA — não a do dia (D79). */
const INTERVALO_MS = 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

// UMA VARREDURA POR VEZ, neste processo.
//
// Duas chamadas simultâneas — o botão "Reconciliar agora" clicado duas vezes,
// ou o botão no mesmo instante da rodada da hora — reencontrariam as mesmas
// evidências ao mesmo tempo. O índice parcial da fila segura a duplicata
// (`upsert-suggestion.usecase.ts`), então não seria dado errado; seria a mesma
// varredura paga duas vezes, com um resultado que ninguém sabe de quem é. O
// guarda é de processo, como o registro de agentes: o deploy é single-node.
let emAndamento = false;

/** O começo da hora corrente: a janela deste job. */
export function inicioDaHora(): Date {
  const inicio = new Date();
  inicio.setMinutes(0, 0, 0);
  return inicio;
}

export interface ResultadoDaVarredura {
  endpoints: number;
  sugeridas: number;
  vinculadas: number;
  encerradas: number;
}

/**
 * Uma rodada inteira. Exportada para o teste chamar sem `setInterval`, e para
 * a rota `POST /api/reconciliation/run` — o agendamento é do processo, o
 * conteúdo é do domínio, e o botão da tela é um terceiro chamador do mesmo
 * conteúdo, sem janela: quem clicou quer a varredura AGORA, não na próxima hora
 * nem no próximo boot.
 *
 * 409 quando já há uma em andamento (ver `emAndamento`). É `AppError` e não
 * `false` porque o chamador de produção é a rota, e o job trata a exceção no
 * `catch` da janela como qualquer outra falha de rodada — a janela fica
 * tomada, e a varredura que estava rodando já cobre a hora.
 *
 * A ORDEM IMPORTA: o carimbo do último contato vem primeiro porque ele é o que
 * alimenta a consulta de fantasma, e ele é barato (uma instrução para a frota
 * inteira). A reconciliação vem depois, máquina a máquina.
 */
export async function rodarReconciliacao(): Promise<ResultadoDaVarredura> {
  if (emAndamento) {
    throw new AppError('Já há uma varredura em andamento. Espere ela terminar.', 409);
  }
  emAndamento = true;
  try {
    return await executarVarredura();
  } finally {
    emAndamento = false;
  }
}

async function executarVarredura(): Promise<ResultadoDaVarredura> {
  const carimbados = await carimbarUltimoContatoNosAtivos();

  // ── A LIMPEZA VEM PRIMEIRO (D110) ────────────────────────────────────────
  //
  // Antes de propor qualquer coisa: a mesma rodada precisa poder tirar da fila o
  // que o mundo já resolveu e, em seguida, propor de novo o que ainda faz
  // sentido. Na ordem inversa, uma sugestão recém-proposta seria avaliada contra
  // um mundo que ela mesma acabou de descrever.
  const encerradas = await encerrarSugestoesObsoletas();

  // AS DUAS COISAS QUE VALEM PARA A RODADA INTEIRA, lidas UMA vez.
  //
  // O `reconciliarEndpoint` sempre soube receber as duas por parâmetro — e o job
  // não as passava, então cada máquina pendente custava uma varredura do parque
  // inteiro e um `upsert` no singleton de configuração. Numa frota de 500
  // máquinas sem vínculo isso eram 1.000 consultas por hora (500 delas
  // ESCRITAS, na mesma linha) para responder duas perguntas que têm uma resposta
  // só.
  const configuracao = await lerConfiguracaoDaDescoberta();
  const repetidos = await valoresRepetidosNoParque();

  // Só quem NÃO tem vínculo: uma frota de 500 máquinas com 480 já reconciliadas
  // custa 20 cascatas por hora, não 500.
  const pendentes = await prisma.endpoint.findMany({
    where: { assetId: null },
    select: { id: true },
  });

  let sugeridas = 0;
  let vinculadas = 0;

  for (const endpoint of pendentes) {
    // Uma máquina que falha não derruba a rodada: a próxima hora tenta de novo,
    // e as outras 19 já foram processadas.
    try {
      const resultado = await reconciliarEndpoint(endpoint.id, repetidos, configuracao);
      sugeridas += resultado.sugeridas;
      vinculadas += resultado.vinculadas;
    } catch (error) {
      logger.error(`[Reconciliação] Falha ao reconciliar ${endpoint.id}:`, error);
    }
  }

  // O USO AGREGADO dos últimos dias (Etapa I): uma instrução para a frota
  // inteira, e é ela que faz a pergunta do ativo ocioso caber numa consulta.
  await agregarUsoDosAtivos();

  // O EXPURGO da telemetria crua, DEPOIS da agregação: o dia já está somado em
  // `asset_usage_daily` quando as amostras que o compuseram saem. Uma vez por
  // DIA, e não a cada rodada: a janela diária é tomada no banco, então o botão
  // "Reconciliar agora" e os reinícios do servidor não o repetem.
  await executarUmaVezPorJanela('expurgo-da-telemetria', inicioDoDia(), async () => {
    await expurgarTelemetriaAntiga();
  });

  // O EXPURGO do histórico da fila: só as linhas SUBSTITUÍDAS, nunca as recusadas
  // (são a memória do D97) nem as aceitas (são a trilha de quem decidiu).
  await expurgarSugestoesSubstituidas();

  if (carimbados > 0 || sugeridas > 0 || vinculadas > 0 || encerradas > 0) {
    logger.info(
      `[Reconciliação] ${pendentes.length} máquina(s) sem vínculo; ` +
      `${sugeridas} sugestão(ões), ${vinculadas} vínculo(s) automático(s), ` +
      `${encerradas} sugestão(ões) encerrada(s) por mudança no cadastro, ` +
      `${carimbados} ativo(s) com último contato atualizado.`,
    );
  }

  return { endpoints: pendentes.length, sugeridas, vinculadas, encerradas };
}

export function startReconcileJob(): void {
  if (timer) return;

  const rodar = () =>
    void executarUmaVezPorJanela(NOME_DO_JOB, inicioDaHora(), async () => {
      await rodarReconciliacao();
    });

  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.debug(`[Reconciliação] Job agendado (a cada ${INTERVALO_MS / 60000} min, 1x por hora).`);
}

export function stopReconcileJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
