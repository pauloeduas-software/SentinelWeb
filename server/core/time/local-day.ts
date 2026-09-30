// O DIA LOCAL — quando "hoje" começa, num fuso que não é o do processo (D123).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ISTO EXISTE, E POR QUE NÃO BASTA `setHours(0,0,0,0)`.
//
// O processo roda em UTC em produção e no fuso de quem desenvolve na máquina
// local. `inicioDoDia()` usa o relógio do PROCESSO, e para uma janela diária isso
// significa que a mesma configuração produz dois comportamentos: uma rodada às
// 21h em São Paulo já é o dia seguinte em UTC, então a janela "de hoje" fecharia
// duas vezes no mesmo dia local — e o aviso sairia duas vezes.
//
// SEM BIBLIOTECA DE FUSO: o `Intl` do próprio Node conhece o banco de fusos
// (`America/Sao_Paulo`), inclusive horário de verão. O que ele não faz direto é o
// caminho de volta — "que instante UTC é meia-noite em São Paulo?" —, e é isso
// que este arquivo resolve.
//
// Fica em `core/time/` e não conhece negócio: recebe o fuso por parâmetro, como
// o `claim-window.ts` recebe o nome do job.
// ═════════════════════════════════════════════════════════════════════════════

interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

/**
 * As partes do calendário local de um instante, naquele fuso.
 *
 * `en-CA` porque ele formata `AAAA-MM-DD` — a única localidade dos exemplos do
 * ICU que não inverte dia e mês, o que tornaria o `split` abaixo dependente da
 * localidade do sistema. `hourCycle: 'h23'` explícito porque há ICU que devolve
 * "24" para a meia-noite (a mesma armadilha documentada no `shift.helper.ts`).
 */
function partesLocais(instante: Date, fuso: string): PartesLocais {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const partes: Record<string, string> = {};
  for (const parte of formatador.formatToParts(instante)) {
    if (parte.type !== 'literal') partes[parte.type] = parte.value;
  }

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

/** Quanto aquele fuso está à frente do UTC, no instante dado, em milissegundos. */
function deslocamentoMs(instante: Date, fuso: string): number {
  const p = partesLocais(instante, fuso);
  const comoSeFosseUTC = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  // A diferença perde os milissegundos do instante original (o `Intl` não os
  // formata); arredondar ao segundo é irrelevante para uma janela diária e evita
  // um deslocamento que oscila.
  return comoSeFosseUTC - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * O instante UTC que corresponde a uma hora de parede naquele fuso.
 *
 * DUAS PASSADAS, e a segunda não é zelo: o deslocamento depende do instante (é
 * ele que muda no horário de verão), e a primeira passada o mede no lugar errado
 * — no chute em UTC. Na virada do horário de verão, uma passada só erra em uma
 * hora. A segunda mede no instante já corrigido e converge.
 */
function instanteDoLocal(fuso: string, ano: number, mes: number, dia: number, hora: number): Date {
  const chute = Date.UTC(ano, mes - 1, dia, hora);

  let instante = new Date(chute - deslocamentoMs(new Date(chute), fuso));
  instante = new Date(chute - deslocamentoMs(instante, fuso));

  return instante;
}

/**
 * O começo do dia LOCAL — meia-noite naquele fuso, como instante UTC.
 *
 * É a janela diária dos jobs que avisam gente: o que decide se dois disparos são
 * "do mesmo dia" é o calendário de quem lê o e-mail, não o do servidor.
 */
export function inicioDoDiaLocal(fuso: string, agora: Date = new Date()): Date {
  const hoje = partesLocais(agora, fuso);
  return instanteDoLocal(fuso, hoje.ano, hoje.mes, hoje.dia, 0);
}

/**
 * HOJE às `hora`, naquele fuso — o começo da janela de um job com horário.
 *
 * Devolve um instante que pode estar NO FUTURO: às 3h da manhã, com
 * `alertHour: 8`, a janela de hoje ainda não abriu. Quem chama precisa comparar
 * — e é essa comparação que faz o `alertHour` significar alguma coisa. Sem ela, a
 * janela diária seria tomada pelo primeiro tick depois da meia-noite e o campo na
 * tela de configuração não mudaria nada.
 */
export function inicioDaJanelaLocal(fuso: string, hora: number, agora: Date = new Date()): Date {
  const hoje = partesLocais(agora, fuso);
  const limitada = Math.min(Math.max(Math.trunc(hora), 0), 23);
  return instanteDoLocal(fuso, hoje.ano, hoje.mes, hoje.dia, limitada);
}

/** A hora do dia (0–23) naquele fuso. Usada pelo turno da ocupação (F7). */
export function horaLocalEm(instante: Date, fuso: string): number {
  return partesLocais(instante, fuso).hora;
}
