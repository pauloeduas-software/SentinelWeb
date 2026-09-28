import { prisma } from '../../../core/database/prismaClient';

// ATIVO OCIOSO — a telemetria agregada por dia, por ativo.
//
// Pelo mesmo motivo do D49: sem agregação, "quem não usa este notebook há 30
// dias" varre milhões de linhas de `telemetries`. E há um segundo motivo, que é
// o item do TODO: a telemetria é dado de série temporal e um dia vai ter
// expurgo — o agregado sobrevive a ele, e é o agregado que responde a pergunta
// de inventário.

/**
 * O tamanho do balde de atividade. Cinco minutos, e o número não é gosto: é a
 * ordem de grandeza do intervalo entre amostras de telemetria. Balde menor que
 * o intervalo contaria 1 minuto de uso a cada amostra e diria que a máquina
 * ficou ligada 12 minutos por dia; balde muito maior arredondaria meia hora de
 * uso para um turno inteiro.
 */
const MINUTOS_POR_BALDE = 5;

/**
 * Recalcula os últimos `dias` de uso.
 *
 * UMA instrução para a frota inteira. O `ON CONFLICT` faz dela um recálculo
 * idempotente: rodar de hora em hora reescreve o dia corrente com o total
 * acumulado até agora, e os dias fechados com o mesmo valor de sempre.
 *
 * A janela curta (3 dias por padrão) existe porque recalcular o histórico
 * inteiro a cada hora seria varrer a tabela de telemetria de novo — exatamente
 * o custo que esta agregação existe para eliminar.
 */
export async function agregarUsoDosAtivos(dias = 3): Promise<number> {
  // O CORTE É NA MEIA-NOITE DO DIA MAIS ANTIGO, e não "há 72 horas" (D111).
  //
  // Com `Date.now() - 3 dias`, o corte caía NO MEIO do dia mais antigo da
  // janela: o `GROUP BY … ::date` recalculava aquele dia usando só a telemetria
  // posterior ao corte, e o `ON CONFLICT DO UPDATE` sobrescrevia o total certo
  // por um parcial. Rodando de hora em hora o dia encolhia a cada rodada até
  // sair da janela e congelar truncado — um dia de trabalho inteiro virava a
  // última hora dele, para sempre, sem erro nenhum aparecer.
  //
  // Alinhado à meia-noite UTC, todo dia que entra na janela entra COMPLETO, e é
  // o mesmo eixo do `(t."timestamp" AT TIME ZONE 'UTC')::date` do agrupamento.
  const agora = new Date();
  const desde = new Date(Date.UTC(
    agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - (dias - 1),
  ));

  return prisma.$executeRaw`
    INSERT INTO "asset_usage_daily" ("id", "assetId", "day", "activeMinutes", "samples")
    SELECT
      gen_random_uuid(),
      e."assetId",
      (t."timestamp" AT TIME ZONE 'UTC')::date,
      LEAST(
        1440,
        COUNT(DISTINCT floor(extract(epoch FROM t."timestamp") / (${MINUTOS_POR_BALDE} * 60)))::int
          * ${MINUTOS_POR_BALDE}
      ),
      COUNT(*)::int
    FROM "telemetries" t
    JOIN "endpoints" e ON e."id" = t."endpointId"
    WHERE e."assetId" IS NOT NULL
      AND e."mergedIntoId" IS NULL
      AND t."timestamp" >= ${desde}
    GROUP BY e."assetId", (t."timestamp" AT TIME ZONE 'UTC')::date
    ON CONFLICT ("assetId", "day") DO UPDATE
      SET "activeMinutes" = EXCLUDED."activeMinutes",
          "samples" = EXCLUDED."samples"
  `;
}
