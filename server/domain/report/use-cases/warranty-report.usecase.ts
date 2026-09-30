import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { lerConfiguracaoDoCicloDeVida } from '../../settings/helpers/lifecycle-settings.helper';
import { ATIVO_NO_PARQUE, emDiasUTC, haDiasUTC, hojeUTC } from '../helpers/report-scope.helper';

// GARANTIAS E FIM DE VIDA A VENCER.
//
// DUAS LISTAS E DOIS LIMIARES, e não uma lista de "prazos": garantia vencendo é
// urgência de CHAMADO — depois dela, o conserto passa a ser pago —, e EOL é
// urgência de ORÇAMENTO, que se planeja com meses de antecedência. Os padrões
// dizem isso: 30 dias para garantia, 60 para EOL.
//
// ═════════════════════════════════════════════════════════════════════════════
// A JANELA É SIMÉTRICA, E ANTES ELA NÃO ERA — ESTE ERA UM BUG DE VERDADE.
//
// A consulta tinha teto (`lte: hoje + N`) e NENHUM piso no passado, ordenava
// crescente e cortava em `take: 500`. Num parque com anos de histórico, as 500
// vagas eram preenchidas pelas garantias mais ANTIGAS — e o que vence nos próximos
// trinta dias, que é o motivo do relatório, não aparecia. Uma tela chamada
// "a vencer" em que nada vence, sem erro nenhum na cara.
//
// Com piso, a lista cobre o que ainda dá para agir: o que está vencendo e o que
// venceu recentemente e passou batido. É a mesma janela do job de alertas
// (`janelaDoPrazo`), e agora ela é literalmente a mesma função — dois pisos
// diferentes para o mesmo prazo fariam a tela e o sino discordarem.
//
// E O PASSADO PROFUNDO NÃO FOI ESCONDIDO: `garantiasAntigas` conta o que venceu
// antes do piso. Cortar sem dizer que cortou é o erro que esta fase inteira
// combate; um número ao lado da lista resolve, e ele é um `count`, não um
// `.length`.
// ═════════════════════════════════════════════════════════════════════════════

export interface ItemDePrazo {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  /** A data que vence: `warrantyExpiresAt` ou `eolDate`, conforme a lista. */
  vence: Date;
  /** Dias até vencer. NEGATIVO quando já venceu. */
  dias: number;
  locationName: string | null;
}

export interface RelatorioDePrazos {
  warrantyAlertDays: number;
  eolAlertDays: number;

  garantias: ItemDePrazo[];
  /**
   * Quantas na JANELA — e este é o número do indicador, nunca `garantias.length`.
   *
   * A lista tem `take`, o contador não. Com os dois iguais o indicador mente por
   * omissão no dia em que a frota passa do teto, e mente para baixo: exatamente o
   * lado que faz ninguém investigar.
   */
  garantiasTotal: number;
  /** Na janela e JÁ vencidas — o que passou batido e ainda dá para agir. */
  garantiasVencidas: number;
  /** Vencidas ANTES do piso da janela. O passado profundo, contado e não listado. */
  garantiasAntigas: number;

  eol: ItemDePrazo[];
  eolTotal: number;
  eolVencidos: number;
  eolAntigos: number;

  /** `true` quando alguma das listas bateu no teto. */
  truncado: boolean;
}

const UM_DIA = 24 * 60 * 60 * 1000;

const SELECT = {
  id: true,
  assetTag: true,
  name: true,
  warrantyExpiresAt: true,
  eolDate: true,
  model: { select: { name: true } },
  location: { select: { name: true } },
} as const;

/** Teto por lista: relatório de prazo com mil linhas não é relatório, é planilha. */
const TETO = 500;

/**
 * Dias entre hoje e a data. Negativo quando ela já passou.
 *
 * `Math.round` e não `floor`: as duas pontas são meia-noite UTC, então a divisão
 * daria inteiro exato — se não fosse o horário de verão de fusos que o Postgres
 * pode ter aplicado ao gravar, que introduz uma hora de sobra e faria o `floor`
 * devolver 29 onde são 30.
 */
function diasAte(quando: Date, hoje: Date): number {
  return Math.round((quando.getTime() - hoje.getTime()) / UM_DIA);
}

/** A janela do prazo: N dias para cada lado de hoje. Igual à do job de alertas. */
function janela(antecedenciaEmDias: number, agora: Date) {
  return {
    gte: haDiasUTC(antecedenciaEmDias, agora),
    lte: emDiasUTC(antecedenciaEmDias, agora),
  };
}

export async function relatorioDePrazos(agora: Date = new Date()): Promise<RelatorioDePrazos> {
  const { warrantyAlertDays, eolAlertDays } = await lerConfiguracaoDoCicloDeVida();
  const hoje = hojeUTC(agora);

  const daGarantia = janela(warrantyAlertDays, agora);
  const doEol = janela(eolAlertDays, agora);

  // `where` montado uma vez por lista e reusado pela lista e pelas contagens: é o
  // que garante que o indicador e a tabela falem do MESMO recorte. Duas expressões
  // parecidas em lugares diferentes é como o piso se perdeu da primeira vez.
  const garantiaNaJanela: Prisma.AssetWhereInput = { ...ATIVO_NO_PARQUE, warrantyExpiresAt: daGarantia };
  const eolNaJanela: Prisma.AssetWhereInput = { ...ATIVO_NO_PARQUE, eolDate: doEol };

  const [
    garantias, garantiasTotal, garantiasVencidas, garantiasAntigas,
    eol, eolTotal, eolVencidos, eolAntigos,
  ] = await Promise.all([
    prisma.asset.findMany({
      where: garantiaNaJanela,
      select: SELECT,
      // Crescente DENTRO da janela: agora o topo da lista é o que venceu há pouco
      // e o fim é o que vence em trinta dias — os dois estão na tela.
      orderBy: { warrantyExpiresAt: 'asc' },
      take: TETO,
    }),
    prisma.asset.count({ where: garantiaNaJanela }),
    prisma.asset.count({
      where: { ...ATIVO_NO_PARQUE, warrantyExpiresAt: { gte: daGarantia.gte, lt: hoje } },
    }),
    prisma.asset.count({
      where: { ...ATIVO_NO_PARQUE, warrantyExpiresAt: { not: null, lt: daGarantia.gte } },
    }),

    prisma.asset.findMany({
      where: eolNaJanela,
      select: SELECT,
      orderBy: { eolDate: 'asc' },
      take: TETO,
    }),
    prisma.asset.count({ where: eolNaJanela }),
    prisma.asset.count({
      where: { ...ATIVO_NO_PARQUE, eolDate: { gte: doEol.gte, lt: hoje } },
    }),
    prisma.asset.count({
      where: { ...ATIVO_NO_PARQUE, eolDate: { not: null, lt: doEol.gte } },
    }),
  ]);

  const paraItem = (
    ativo: (typeof garantias)[number],
    vence: Date,
  ): ItemDePrazo => ({
    assetId: ativo.id,
    assetTag: ativo.assetTag,
    name: ativo.name,
    modelName: ativo.model.name,
    vence,
    dias: diasAte(vence, hoje),
    locationName: ativo.location?.name ?? null,
  });

  return {
    warrantyAlertDays,
    eolAlertDays,
    // O `!` é seguro: o `where` filtrou por uma faixa de datas, que exclui `null`
    // — mas o Prisma não estreita o tipo a partir dele, e um `?? new Date()` aqui
    // inventaria uma data.
    garantias: garantias.map((ativo) => paraItem(ativo, ativo.warrantyExpiresAt!)),
    garantiasTotal,
    garantiasVencidas,
    garantiasAntigas,
    eol: eol.map((ativo) => paraItem(ativo, ativo.eolDate!)),
    eolTotal,
    eolVencidos,
    eolAntigos,
    truncado: garantiasTotal > garantias.length || eolTotal > eol.length,
  };
}
