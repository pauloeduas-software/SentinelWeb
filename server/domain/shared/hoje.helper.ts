// O DIA DE HOJE, no fuso de quem usa o sistema.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE NÃO MEIA-NOITE UTC
//
// Data de calendário é gravada como `AAAA-MM-DDT00:00Z` (`dataOpcional`, em
// `fields.schema.ts`), e comparar com a meia-noite UTC de hoje parece simétrico
// — mas o "hoje" UTC vira às 21h de Brasília. Uma licença que vence hoje
// passava a VENCIDA às 21h, e o botão de entrega sumia três horas antes de o
// dia acabar para quem estava na frente da tela.
//
// A saída é perguntar ao calendário de Brasília que dia é, e devolver esse dia
// no MESMO formato da coluna. Aí as duas pontas da comparação são dia de
// calendário, e o fuso do servidor não entra na conta.
//
// `formatToParts` e não `toLocaleDateString('en-CA')`: o formato da string
// depende do ICU que o Node carrega, e as partes não.
//
// O mesmo defeito ainda existe em `fields.schema.ts` (`dataNaoFutura`,
// `dataNaoPassada`), que validam datas de ativo, posse e ocupação contra a
// meia-noite UTC. Fica para quando aquelas telas forem revistas.
// ═════════════════════════════════════════════════════════════════════════════

export const FUSO_DO_NEGOCIO = 'America/Sao_Paulo';

const CALENDARIO = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DO_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** O dia de calendário de Brasília em `agora`, como `AAAA-MM-DDT00:00Z`. */
export function hojeNoBrasil(agora: Date = new Date()): Date {
  const partes = Object.fromEntries(
    CALENDARIO.formatToParts(agora).map((parte) => [parte.type, parte.value]),
  );
  return new Date(`${partes.year}-${partes.month}-${partes.day}T00:00:00.000Z`);
}

/** `dias` depois de `dia`, no mesmo formato. Negativo volta. */
export function somarDias(dia: Date, dias: number): Date {
  const resultado = new Date(dia);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

/** Brasília é UTC−3 o ano inteiro (sem horário de verão desde 2019). */
const MEIO_DIA_DE_BRASILIA_EM_UTC = 15 * 60 * 60 * 1000;

/**
 * O INSTANTE a gravar para um DIA que a tela escolheu — a data de uma entrega ou
 * de uma devolução de licença.
 *
 * Hoje é AGORA: a hora real ordena as operações do mesmo dia. Um dia passado
 * vira o MEIO-DIA de Brasília (15h UTC) — e não a meia-noite UTC, que em
 * Brasília ainda é 21h do dia ANTERIOR: lido de volta no fuso de quem usa, o dia
 * mudaria. A hora do dia passado não diz nada, e por isso a tela mostra só o dia.
 */
export function instanteDoDia(dia: Date, agora: Date = new Date()): Date {
  if (dia.getTime() === hojeNoBrasil(agora).getTime()) return agora;
  return new Date(dia.getTime() + MEIO_DIA_DE_BRASILIA_EM_UTC);
}
