import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('endpoint.expurgo');

/**
 * Quanto tempo a telemetria CRUA fica no banco: 3 dias, contados em horas.
 *
 * Cada máquina manda uma amostra a cada poucos segundos, e sem expurgo a tabela
 * só cresce. Quem lê a amostra crua são as telas (só a última) e a agregação do
 * uso diário (`aggregate-usage.usecase.ts`), que recalcula a janela que começa
 * à meia-noite UTC de dois dias atrás. O corte de 72 horas cai sempre ANTES
 * dessa meia-noite, então a agregação nunca recalcula um dia já expurgado. O
 * que responde pergunta de inventário depois disso é o uso diário agregado
 * (`asset_usage_daily`), que fica para sempre.
 *
 * Constante e não coluna de `AppSetting`, como o histórico da fila
 * (`DIAS_DE_HISTORICO_DA_FILA`): é retenção de dado técnico, não uma política
 * que alguém precise negociar.
 */
const DIAS_DE_TELEMETRIA = 3;

/**
 * Apaga a telemetria mais velha que a retenção — MENOS a última de cada máquina.
 *
 * A última amostra é o que a aba Máquina e a ficha do posto mostram, e a de uma
 * máquina desligada há uma semana continua sendo a verdade sobre ela. Sem esta
 * exceção, a tela diria "o agente conectou e não mandou leitura" sobre uma
 * máquina que mandou, e cuja leitura foi expurgada. Por isso o `NOT EXISTS`
 * só apaga a amostra que tem outra MAIS NOVA da mesma máquina — o índice
 * `(endpointId, timestamp DESC)` responde essa pergunta.
 *
 * UMA VEZ POR DIA, pela janela diária do `reconcile.job.ts`, e depois da
 * agregação de uso: a ordem garante que o dia agregado já foi gravado quando a
 * amostra que o compôs sai. O índice em `timestamp` faz do corte uma faixa,
 * não uma varredura da tabela.
 */
export async function expurgarTelemetriaAntiga(): Promise<number> {
  const limite = new Date(Date.now() - DIAS_DE_TELEMETRIA * 24 * 60 * 60 * 1000);
  const count = await prisma.$executeRaw`
    DELETE FROM "telemetries" t
    WHERE t."timestamp" < ${limite}
      AND EXISTS (
        SELECT 1 FROM "telemetries" n
        WHERE n."endpointId" = t."endpointId" AND n."timestamp" > t."timestamp"
      )
  `;
  if (count > 0) logger.info(`[Telemetria] ${count} amostra(s) com mais de ${DIAS_DE_TELEMETRIA} dias expurgada(s).`);
  return count;
}
