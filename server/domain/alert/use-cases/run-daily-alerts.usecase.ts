import { $Enums, type Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { adicionarMeses } from '../../asset/helpers/asset-dates.helper';
import {
  lerConfiguracaoDoCicloDeVida, type ConfiguracaoDoCicloDeVida,
} from '../../settings/helpers/lifecycle-settings.helper';
import {
  ATIVO_NO_PARQUE, corteDaAuditoria, emDiasUTC, haDiasUTC, hojeUTC,
} from '../../report/helpers/report-scope.helper';
import { whereAuditoriaVencida } from '../../report/use-cases/audit-report.usecase';
import {
  chaveDeAuditoria, chaveDeEol, chaveDeGarantia, chaveDeManutencao,
} from '../helpers/alert-dedupe.helper';
import type { PayloadDoAlerta } from '../helpers/alert-message.helper';
import { notificarAlertasPendentes } from './notify-alerts.usecase';

// A RODADA DIÁRIA — calcula, grava, e só DEPOIS avisa.
//
// ═════════════════════════════════════════════════════════════════════════════
// GRAVAR PRIMEIRO É O D57, E ELE PAGA TRÊS COISAS.
//
//   1. "o alerta disparou?" vira um `SELECT`, não uma caçada no log de SMTP;
//   2. o sistema funciona sem canal configurado — a central é o canal primário;
//   3. o `dedupeKey` passa a ser a defesa contra o mesmo aviso chegando todo dia
//      até alguém resolver o problema.
//
// E o envio fica FORA da transação, depois do commit: e-mail não tem rollback, e
// um aviso disparado por transação que reverteu fala de um problema que não
// existe (D86).
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('alert.run');

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Teto por tipo numa rodada.
 *
 * Existe para a PRIMEIRA rodada de um parque grande não virar um `INSERT` de
 * dezenas de milhares de linhas: "nunca conferido" vale para a frota inteira num
 * sistema que acabou de subir. O que sobra entra amanhã — e o `dedupeKey` garante
 * que o que entrou hoje não volte.
 */
const TETO_POR_TIPO = 500;

export interface ResultadoDaRodada {
  /** Linhas efetivamente criadas — `skipDuplicates` engole as repetidas. */
  criados: number;
  /** Quantas foram entregues por algum canal nesta rodada. */
  notificados: number;
  /** `true` quando `alertsEnabled` está desligado: a rodada não fez nada. */
  desligado: boolean;
}

type AlertaParaCriar = Prisma.AlertCreateManyInput;

/** Dias entre hoje e a data. Negativo quando já passou. */
function dias(quando: Date, hoje: Date): number {
  return Math.round((quando.getTime() - hoje.getTime()) / UM_DIA);
}

const ATIVO_SELECT = {
  id: true,
  assetTag: true,
  name: true,
  createdAt: true,
  warrantyExpiresAt: true,
  eolDate: true,
  lastAuditAt: true,
  model: { select: { name: true } },
} as const;

function payloadDoAtivo(
  ativo: Prisma.AssetGetPayload<{ select: typeof ATIVO_SELECT }>,
  extra: PayloadDoAlerta = {},
): Prisma.InputJsonValue {
  return {
    assetTag: ativo.assetTag,
    assetName: ativo.name,
    modelName: ativo.model.name,
    ...extra,
  } as Prisma.InputJsonValue;
}

/**
 * A JANELA DE UM PRAZO É SIMÉTRICA: N dias para cada lado.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE O PASSADO TEM PISO.
 *
 * "Garantia vencendo nos próximos 30 dias" sem piso nenhum no passado inclui toda
 * garantia que já venceu — e na PRIMEIRA rodada de um sistema com cinco anos de
 * histórico isso são centenas de alertas sobre prazos de 2022, cada um com um
 * `dedupeKey` próprio, todos permanentes (a central não tem lixeira). A pessoa
 * abre o sino no primeiro dia e encontra o passado inteiro.
 *
 * Com o piso, o alerta cobre o que ainda dá para agir: o que está vencendo e o que
 * venceu recentemente e passou batido. O resto é relatório, e o relatório mostra
 * tudo — é ele que responde "quantas garantias já venceram".
 * ═════════════════════════════════════════════════════════════════════════════
 */
function janelaDoPrazo(antecedenciaEmDias: number, agora: Date) {
  return {
    // `haDiasUTC` e não uma subtração de milissegundos: o relatório de prazos passou
    // a usar EXATAMENTE esta janela, e ele conta em dias de calendário. Dois pisos
    // calculados de formas diferentes empatariam na maioria dos dias e divergiriam
    // na virada do horário de verão — o dia em que o sino e a tela discordariam
    // sobre o que está vencendo, sem ninguém saber por quê.
    gte: haDiasUTC(antecedenciaEmDias, agora),
    lte: emDiasUTC(antecedenciaEmDias, agora),
  };
}

async function candidatosDeGarantia(
  config: ConfiguracaoDoCicloDeVida,
  agora: Date,
): Promise<AlertaParaCriar[]> {
  const hoje = hojeUTC(agora);

  const ativos = await prisma.asset.findMany({
    where: { ...ATIVO_NO_PARQUE, warrantyExpiresAt: janelaDoPrazo(config.warrantyAlertDays, agora) },
    select: ATIVO_SELECT,
    orderBy: { warrantyExpiresAt: 'asc' },
    take: TETO_POR_TIPO,
  });

  return ativos.map((ativo) => ({
    type: $Enums.AlertType.GARANTIA_VENCENDO,
    assetId: ativo.id,
    dueAt: ativo.warrantyExpiresAt!,
    dedupeKey: chaveDeGarantia(ativo.id, ativo.warrantyExpiresAt!),
    payload: payloadDoAtivo(ativo, { dias: dias(ativo.warrantyExpiresAt!, hoje) }),
  }));
}

async function candidatosDeEol(
  config: ConfiguracaoDoCicloDeVida,
  agora: Date,
): Promise<AlertaParaCriar[]> {
  const hoje = hojeUTC(agora);

  const ativos = await prisma.asset.findMany({
    where: { ...ATIVO_NO_PARQUE, eolDate: janelaDoPrazo(config.eolAlertDays, agora) },
    select: ATIVO_SELECT,
    orderBy: { eolDate: 'asc' },
    take: TETO_POR_TIPO,
  });

  return ativos.map((ativo) => ({
    type: $Enums.AlertType.EOL_PROXIMO,
    assetId: ativo.id,
    dueAt: ativo.eolDate!,
    dedupeKey: chaveDeEol(ativo.id, ativo.eolDate!),
    payload: payloadDoAtivo(ativo, { dias: dias(ativo.eolDate!, hoje) }),
  }));
}

async function candidatosDeAuditoria(
  config: ConfiguracaoDoCicloDeVida,
  agora: Date,
): Promise<AlertaParaCriar[]> {
  const hoje = hojeUTC(agora);
  const corte = corteDaAuditoria(config.auditIntervalMonths, agora);

  // O MESMO `where` do relatório, importado (ver o porquê lá): um ativo que
  // aparece como vencido na tela e não gera alerta é uma pergunta que ninguém
  // responde olhando duas consultas parecidas em arquivos diferentes.
  const ativos = await prisma.asset.findMany({
    where: whereAuditoriaVencida(corte),
    select: ATIVO_SELECT,
    orderBy: { lastAuditAt: { sort: 'asc', nulls: 'first' } },
    take: TETO_POR_TIPO,
  });

  return ativos.map((ativo) => {
    // O PRAZO de quem nunca foi conferido é a data de CADASTRO: ele deveria ter
    // sido conferido desde que entrou no parque. Inventar "hoje" aqui faria o
    // alerta parecer novo todo dia na ordenação da tela.
    const venceu = ativo.lastAuditAt
      ? adicionarMeses(ativo.lastAuditAt, config.auditIntervalMonths)
      : ativo.createdAt;

    return {
      type: $Enums.AlertType.AUDITORIA_VENCIDA,
      assetId: ativo.id,
      dueAt: venceu,
      dedupeKey: chaveDeAuditoria(ativo.id, ativo.lastAuditAt),
      payload: payloadDoAtivo(ativo, {
        dias: dias(venceu, hoje),
        lastAuditAt: ativo.lastAuditAt?.toISOString() ?? null,
      }),
    };
  });
}

async function candidatosDeManutencao(
  config: ConfiguracaoDoCicloDeVida,
  agora: Date,
): Promise<AlertaParaCriar[]> {
  const hoje = hojeUTC(agora);
  const limite = new Date(hoje.getTime() - config.maintenanceOpenDays * UM_DIA);

  // UMA LINHA POR MANUTENÇÃO, não por ativo: um notebook com um reparo e um
  // contrato de suporte abertos tem dois problemas, e a chave do D125 é da
  // manutenção justamente para os dois aparecerem.
  const abertas = await prisma.maintenance.findMany({
    where: {
      completionDate: null,
      startDate: { lte: limite },
      asset: { ...ATIVO_NO_PARQUE, deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      assetId: true,
      asset: { select: ATIVO_SELECT },
    },
    orderBy: { startDate: 'asc' },
    take: TETO_POR_TIPO,
  });

  return abertas.map((manutencao) => ({
    type: $Enums.AlertType.MANUTENCAO_EM_ABERTO,
    assetId: manutencao.assetId,
    // O `dueAt` é a data em que ela ESTOUROU o limite configurado — é isso que a
    // tela ordena, e é a única data-alvo que uma manutenção aberta tem (D125).
    dueAt: new Date(manutencao.startDate.getTime() + config.maintenanceOpenDays * UM_DIA),
    dedupeKey: chaveDeManutencao(manutencao.id, manutencao.startDate),
    payload: payloadDoAtivo(manutencao.asset, {
      title: manutencao.title,
      maintenanceId: manutencao.id,
      dias: Math.round((hoje.getTime() - manutencao.startDate.getTime()) / UM_DIA),
    }),
  }));
}

/**
 * UMA rodada: os quatro sinais, um `createMany`, e o envio depois.
 *
 * Exportada para o teste e para a rota manual chamarem SEM `setInterval` — o
 * agendamento é do processo, o conteúdo é do domínio. Mesma divisão do
 * `enviarLembretesDeAtraso` (F4) e do `rodarReconciliacao` (F7).
 */
export async function rodarAlertasDiarios(agora: Date = new Date()): Promise<ResultadoDaRodada> {
  const config = await lerConfiguracaoDoCicloDeVida();

  // DESLIGADO NÃO GRAVA NADA. Não é só "não manda e-mail": gravar com o alerta
  // desligado encheria a central em silêncio e, no dia em que alguém religasse, o
  // `dedupeKey` impediria os avisos de sair — eles já existiriam, já "notificados"
  // nunca. Desligado é desligado.
  if (!config.alertsEnabled) {
    logger.debug('[Alertas] `alertsEnabled` está desligado: rodada sem efeito.');
    return { criados: 0, notificados: 0, desligado: true };
  }

  const candidatos = (await Promise.all([
    candidatosDeGarantia(config, agora),
    candidatosDeEol(config, agora),
    candidatosDeAuditoria(config, agora),
    candidatosDeManutencao(config, agora),
  ])).flat();

  // `skipDuplicates` sobre o índice ÚNICO de `dedupeKey`: rodar duas vezes no
  // mesmo dia não duplica nada, sem SELECT prévio e sem corrida entre dois
  // processos — o Postgres resolve, como no `tomarJanela` (D79).
  const { count: criados } = candidatos.length === 0
    ? { count: 0 }
    : await prisma.alert.createMany({ data: candidatos, skipDuplicates: true });

  // DEPOIS do commit, sempre. E envia tudo que está com `notifiedAt` nulo — o
  // desta rodada e o que uma falha de SMTP deixou para trás (D126).
  const notificados = await notificarAlertasPendentes(config);

  if (criados > 0 || notificados > 0) {
    logger.info(`[Alertas] ${criados} alerta(s) criado(s); ${notificados} notificado(s).`);
  }

  return { criados, notificados, desligado: false };
}
