import { executarUmaVezPorJanela } from '../../../core/jobs/claim-window';
import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { reconciliarEndpoint, valoresRepetidosNoParque } from '../use-cases/match-endpoint.usecase';
import { carimbarUltimoContatoNosAtivos } from '../use-cases/stamp-last-seen.usecase';
import { sugerirPosseOuOcupacao } from '../use-cases/suggest-posse.usecase';
import { detectarPostoCompartilhado } from '../use-cases/detect-shared-post.usecase';
import { normalizarSoftwarePendente } from '../use-cases/normalize-software.usecase';
import { agregarUsoDosAtivos } from '../use-cases/aggregate-usage.usecase';
import { expurgarObservacoesAntigas } from '../use-cases/record-user-observation.usecase';
import {
  encerrarSugestoesObsoletas, expurgarSugestoesSubstituidas,
} from '../use-cases/invalidate-suggestions.usecase';
import { lerConfiguracaoDaDescoberta } from '../helpers/discovery-settings.helper';
import { auditarPeloAgente } from '../../audit/use-cases/audit-by-agent.usecase';

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

/** O começo da hora corrente: a janela deste job. */
export function inicioDaHora(): Date {
  const inicio = new Date();
  inicio.setMinutes(0, 0, 0);
  return inicio;
}

/**
 * Uma rodada inteira. Exportada para o teste chamar sem `setInterval` — o
 * agendamento é do processo, o conteúdo é do domínio.
 *
 * A ORDEM IMPORTA: o carimbo do último contato vem primeiro porque ele é o que
 * alimenta a consulta de fantasma, e ele é barato (uma instrução para a frota
 * inteira). A reconciliação vem depois, máquina a máquina.
 */
export async function rodarReconciliacao(): Promise<{
  endpoints: number; sugeridas: number; vinculadas: number; encerradas: number; conferidas: number;
}> {
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

  // Só quem NÃO tem vínculo e não foi fundido: uma frota de 500 máquinas com 480
  // já reconciliadas custa 20 cascatas por hora, não 500.
  const pendentes = await prisma.endpoint.findMany({
    where: { assetId: null, mergedIntoId: null },
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

  // ── O OUTRO LADO: as máquinas que JÁ TÊM ativo ───────────────────────────
  //
  // Elas não precisam de vínculo, mas é nelas que está a pergunta que só este
  // produto sabe fazer: quem usa esta máquina, e o que isso diz sobre a posse
  // (D47) ou sobre o posto (D48).
  const vinculados = await prisma.endpoint.findMany({
    where: { assetId: { not: null }, mergedIntoId: null },
    select: { id: true },
  });

  for (const endpoint of vinculados) {
    try {
      // Os dois, e nesta ordem. Eles são exclusivos por construção — o primeiro
      // desiste com duas pessoas recorrentes, o segundo exige duas —, mas a
      // ordem importa para quem lê o log: posse é o caso comum, posto
      // compartilhado é o achado.
      sugeridas += await sugerirPosseOuOcupacao(endpoint.id, configuracao);
      sugeridas += await detectarPostoCompartilhado(endpoint.id, configuracao);
    } catch (error) {
      logger.error(`[Reconciliação] Falha ao sugerir posse de ${endpoint.id}:`, error);
    }
  }

  // O USO AGREGADO dos últimos dias (Etapa I): uma instrução para a frota
  // inteira, e é ela que faz a pergunta do ativo ocioso caber numa consulta.
  await agregarUsoDosAtivos();

  // O SOFTWARE de quem mudou — a comparação dos dois hashes (D100). Numa frota
  // estável esta chamada devolve zero linhas e não custa nada.
  await normalizarSoftwarePendente();

  // O EXPURGO da observação de usuário, na mesma rodada. Dado de pessoa com
  // prazo (D49): um job próprio para um `deleteMany` por hora seria mais
  // agendamento do que trabalho.
  await expurgarObservacoesAntigas(configuracao.userDailyRetentionDays);

  // E o do histórico da fila: só as linhas SUBSTITUÍDAS, nunca as recusadas
  // (são a memória do D97) nem as aceitas (são a trilha de quem decidiu).
  await expurgarSugestoesSubstituidas();

  // ── A CONFERÊNCIA AUTOMÁTICA (F8, D124) ──────────────────────────────────
  //
  // Mora AQUI, ao lado do carimbo do último contato, e não no handshake — é o D95
  // pelo mesmo argumento: `touchEndpoint` roda a cada mensagem de cada máquina, e
  // uma linha de `audits` ali cresceria em máquinas × mensagens por dia.
  //
  // Depois de tudo de propósito: ela é a única coisa desta rodada que escreve numa
  // tabela de PATRIMÔNIO (`assets.lastAuditAt`), e uma falha dela não pode levar
  // junto a fila de sugestões que acabou de ser construída.
  const conferidas = await auditarPeloAgente(configuracao.timezone);

  if (carimbados > 0 || sugeridas > 0 || vinculadas > 0 || encerradas > 0 || conferidas > 0) {
    logger.info(
      `[Reconciliação] ${pendentes.length} máquina(s) sem vínculo; ` +
      `${sugeridas} sugestão(ões), ${vinculadas} vínculo(s) automático(s), ` +
      `${encerradas} sugestão(ões) encerrada(s) por mudança no cadastro, ` +
      `${carimbados} ativo(s) com último contato atualizado, ` +
      `${conferidas} conferido(s) pelo agente.`,
    );
  }

  return { endpoints: pendentes.length, sugeridas, vinculadas, encerradas, conferidas };
}

export function startReconcileJob(): void {
  if (timer) return;

  const rodar = () =>
    void executarUmaVezPorJanela(NOME_DO_JOB, inicioDaHora(), async () => {
      await rodarReconciliacao();
    });

  rodar();
  timer = setInterval(rodar, INTERVALO_MS);
  logger.info(`[Reconciliação] Job agendado (a cada ${INTERVALO_MS / 60000} min, 1x por hora).`);
}

export function stopReconcileJob(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
