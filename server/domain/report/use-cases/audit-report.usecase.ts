import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { lerConfiguracaoDoCicloDeVida } from '../../settings/helpers/lifecycle-settings.helper';
import { ATIVO_NO_PARQUE, corteDaAuditoria, hojeUTC } from '../helpers/report-scope.helper';

// AUDITORIAS: VENCIDAS · A VENCER · NUNCA CONFERIDAS.
//
// ═════════════════════════════════════════════════════════════════════════════
// SÃO TRÊS BALDES PORQUE "NUNCA" NÃO É "VENCIDA HÁ MUITO TEMPO".
//
// `lastAuditAt IS NULL` e `lastAuditAt < :corte` seriam a mesma consulta com um
// `OR`, e é assim que a pergunta do alerta é feita. Aqui elas ficam separadas
// porque as ações são diferentes: um ativo vencido tem um histórico de
// conferência e uma última localização conhecida; um ativo nunca conferido pode
// nem existir fisicamente — foi cadastrado e ninguém nunca olhou.
//
// O CORTE é calculado aqui, a cada consulta, a partir de `auditIntervalMonths`
// (D53). É isso que faz trocar 12 meses por 6 valer imediatamente para a frota
// inteira, sem nenhum UPDATE.
// ═════════════════════════════════════════════════════════════════════════════

export interface ItemDeAuditoria {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  locationName: string | null;
  lastAuditAt: Date | null;
  /** Dias desde a última conferência. `null` para quem nunca foi conferido. */
  diasDesde: number | null;
}

export interface RelatorioDeAuditorias {
  auditIntervalMonths: number;
  auditWarningDays: number;
  /** A data antes da qual a conferência está vencida. */
  corte: Date;
  vencidas: ItemDeAuditoria[];
  aVencer: ItemDeAuditoria[];
  nunca: ItemDeAuditoria[];

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * AS CONTAGENS DOS TRÊS BALDES, E ELAS NÃO SÃO `.length` DAS LISTAS ACIMA.
   *
   * As listas têm `take: TETO`. Os indicadores da aba saíam do `.length` delas, ao
   * lado de `emDia`/`total`, que são `count` de verdade — então num parque com mais
   * de quinhentas vencidas o indicador lia exatamente "500", os quatro números
   * paravam de fechar com `total`, e nada na tela dizia que havia corte.
   *
   * Número truncado em silêncio num relatório é o pior caso possível: ele é
   * plausível, está formatado, e ninguém confere. Os `count` vêm do MESMO `where`
   * das listas — a lista é a amostra acionável, o contador é a verdade.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  vencidasTotal: number;
  aVencerTotal: number;
  nuncaTotal: number;

  /** Quantos ativos do parque estão em dia — o número que dá contexto aos outros. */
  emDia: number;
  total: number;
  /** `true` quando algum balde bateu no teto e a tabela é amostra. */
  truncado: boolean;
}

const UM_DIA = 24 * 60 * 60 * 1000;
const TETO = 500;

const SELECT = {
  id: true,
  assetTag: true,
  name: true,
  lastAuditAt: true,
  model: { select: { name: true } },
  location: { select: { name: true } },
} as const;

export async function relatorioDeAuditorias(agora: Date = new Date()): Promise<RelatorioDeAuditorias> {
  const { auditIntervalMonths, auditWarningDays } = await lerConfiguracaoDoCicloDeVida();

  const hoje = hojeUTC(agora);
  const corte = corteDaAuditoria(auditIntervalMonths, agora);

  // "A VENCER" é a faixa entre o corte e o corte + a antecedência: quem foi
  // conferido há 11 meses e 10 dias, com intervalo de 12 meses e aviso de 30 dias,
  // está nela. A conta é sobre a data da ÚLTIMA conferência, não sobre uma data
  // futura calculada — que é o `nextAuditAt` que o D53 recusou.
  const limiteDoAviso = new Date(corte.getTime() + auditWarningDays * UM_DIA);

  const comum = { select: SELECT, take: TETO } as const;

  // Um `where` por balde, declarado UMA vez e usado pela lista e pela contagem: é
  // isso que impede o indicador e a tabela de falarem de recortes diferentes.
  const eVencida: Prisma.AssetWhereInput = { ...ATIVO_NO_PARQUE, lastAuditAt: { lt: corte } };
  const eAVencer: Prisma.AssetWhereInput = {
    ...ATIVO_NO_PARQUE, lastAuditAt: { gte: corte, lt: limiteDoAviso },
  };
  const eNunca: Prisma.AssetWhereInput = { ...ATIVO_NO_PARQUE, lastAuditAt: null };

  const [
    vencidas, aVencer, nunca,
    vencidasTotal, aVencerTotal, nuncaTotal,
    emDia, total,
  ] = await Promise.all([
    prisma.asset.findMany({ where: eVencida, orderBy: { lastAuditAt: 'asc' }, ...comum }),
    prisma.asset.findMany({ where: eAVencer, orderBy: { lastAuditAt: 'asc' }, ...comum }),
    prisma.asset.findMany({
      where: eNunca,
      // Pelo cadastro mais antigo: um ativo de dois anos nunca conferido é mais
      // urgente que um cadastrado ontem.
      orderBy: { createdAt: 'asc' },
      ...comum,
    }),
    prisma.asset.count({ where: eVencida }),
    prisma.asset.count({ where: eAVencer }),
    prisma.asset.count({ where: eNunca }),
    prisma.asset.count({ where: { ...ATIVO_NO_PARQUE, lastAuditAt: { gte: limiteDoAviso } } }),
    prisma.asset.count({ where: ATIVO_NO_PARQUE }),
  ]);

  const paraItem = (ativo: (typeof vencidas)[number]): ItemDeAuditoria => ({
    assetId: ativo.id,
    assetTag: ativo.assetTag,
    name: ativo.name,
    modelName: ativo.model.name,
    locationName: ativo.location?.name ?? null,
    lastAuditAt: ativo.lastAuditAt,
    diasDesde: ativo.lastAuditAt
      ? Math.round((hoje.getTime() - ativo.lastAuditAt.getTime()) / UM_DIA)
      : null,
  });

  return {
    auditIntervalMonths,
    auditWarningDays,
    corte,
    vencidas: vencidas.map(paraItem),
    aVencer: aVencer.map(paraItem),
    nunca: nunca.map(paraItem),
    vencidasTotal,
    aVencerTotal,
    nuncaTotal,
    emDia,
    total,
    truncado:
      vencidasTotal > vencidas.length
      || aVencerTotal > aVencer.length
      || nuncaTotal > nunca.length,
  };
}

/**
 * O `where` de "auditoria vencida", para o JOB de alertas reusar.
 *
 * Exportado porque o alerta e o relatório precisam da MESMA definição: um ativo
 * que aparece como vencido na tela e não gera alerta (ou o contrário) é uma
 * pergunta que ninguém consegue responder olhando duas consultas parecidas em
 * arquivos diferentes.
 */
export function whereAuditoriaVencida(corte: Date): Prisma.AssetWhereInput {
  return { ...ATIVO_NO_PARQUE, OR: [{ lastAuditAt: null }, { lastAuditAt: { lt: corte } }] };
}
