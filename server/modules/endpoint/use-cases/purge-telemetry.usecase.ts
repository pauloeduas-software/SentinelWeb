import { prisma } from '../../../infra/database/prismaClient';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('endpoint.expurgo');

/**
 * Apaga toda amostra de telemetria que tem outra MAIS NOVA da mesma máquina (DA).
 *
 * Quem lê a telemetria são a ficha da máquina, a aba Máquina do computador e a
 * ficha do posto, e as três mostram só a última amostra. A série não tem leitor desde que a
 * agregação de uso saiu (CW), então guardá-la seria tabela crescendo para ninguém.
 *
 * A última amostra fica mesmo velha: a de uma máquina desligada há uma semana
 * continua sendo a verdade sobre ela. Sem isso, a tela diria "o agente conectou
 * e não mandou leitura" sobre uma máquina que mandou. O índice
 * `(endpointId, timestamp DESC)` responde o `EXISTS`.
 *
 * UMA VEZ POR DIA, pela janela diária do `reconcile.job.ts`: com uma amostra por
 * hora, mais a de cada subida do agente e a de cada Atualizar agora, ficam umas
 * 24 por máquina entre um expurgo e outro.
 */
export async function expurgarTelemetriaAntiga(): Promise<number> {
  const count = await prisma.$executeRaw`
    DELETE FROM "telemetries" t
    WHERE EXISTS (
      SELECT 1 FROM "telemetries" n
      WHERE n."endpointId" = t."endpointId" AND n."timestamp" > t."timestamp"
    )
  `;
  if (count > 0) logger.info(`[Telemetria] ${count} amostra(s) substituída(s) por outra mais nova expurgada(s).`);
  return count;
}
