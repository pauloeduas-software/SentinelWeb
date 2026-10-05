import { describe, expect, it } from 'vitest';
import {
  horaLocalEm, inicioDaJanelaLocal, inicioDoDiaLocal,
} from '../../server/core/time/local-day';
import { horaLocal, turnoDaHora } from '../../server/domain/reconciliation/helpers/shift.helper';

// EM QUE FUSO É "HOJE" — docs/historico/fase-08-ciclo-de-vida.md, D123.
//
// ═════════════════════════════════════════════════════════════════════════════
// ESTE ARQUIVO NÃO EXISTIA, E ERA A PEÇA MAIS SUTIL DA FASE SEM TESTE NENHUM.
//
// O plano dizia que a janela do job "já está coberta por `tests/jobs/janela.test.ts`
// — não se refaz". Não estava: aquele arquivo exercita `inicioDoDia()`, que usa o
// relógio do PROCESSO. As funções que a F8 criou são outras, e a travessia que elas
// fazem — hora de parede ↔ instante UTC — é o tipo de código que passa em todo
// teste manual e erra na virada do horário de verão, uma vez por semestre, de
// madrugada, sem ninguém olhando.
//
// `instanteDoLocal` faz DUAS passadas justamente por isso: a primeira mede o
// deslocamento no chute em UTC (lugar errado), a segunda no instante já corrigido.
// Os casos de virada abaixo são o que prova que a segunda passada existe — com uma
// passada só, eles erram em exatamente uma hora.
//
// SEM BANCO: é `*.puro.test.ts`, e roda em `npm run test:puro`.
// ═════════════════════════════════════════════════════════════════════════════

const SP = 'America/Sao_Paulo';
/** Nova York porque ela AINDA tem horário de verão, e o Brasil não. */
const NY = 'America/New_York';

const D = (iso: string) => new Date(iso);

describe('o começo do dia local', () => {
  it('é meia-noite no fuso da empresa, não no do processo', () => {
    // 02:00 UTC de 29/09 ainda é 23:00 de 28/09 em São Paulo (UTC−3): o dia local
    // que começou foi o 28, e é essa a janela do dia.
    expect(inicioDoDiaLocal(SP, D('2026-09-29T02:00:00Z')).toISOString())
      .toBe('2026-09-28T03:00:00.000Z');
  });

  it('vira quando o dia LOCAL vira, e não às 21h', () => {
    // O defeito que o D123 descreve: com `setHours` no processo em UTC, uma rodada
    // às 20h59 e outra às 21h01 de São Paulo caem em dois "dias" diferentes, e o
    // aviso do dia sai duas vezes.
    const antes = inicioDoDiaLocal(SP, D('2026-09-29T23:59:00Z')); // 20:59 em SP
    const depois = inicioDoDiaLocal(SP, D('2026-09-30T00:01:00Z')); // 21:01 em SP

    expect(antes.toISOString()).toBe('2026-09-29T03:00:00.000Z');
    expect(depois.toISOString()).toBe(antes.toISOString());
  });

  it('atravessa o fim do horário de verão sem pular uma hora', () => {
    // 01/11/2026 é o domingo em que Nova York volta para UTC−5. A meia-noite local
    // ainda é UTC−4 (o relógio só volta às 2h), então são 04:00Z — e não 05:00Z,
    // que é o que UMA passada de deslocamento devolveria.
    expect(inicioDoDiaLocal(NY, D('2026-11-01T12:00:00Z')).toISOString())
      .toBe('2026-11-01T04:00:00.000Z');
  });
});

describe('a janela do disparo', () => {
  it('é hoje na hora configurada, no fuso configurado', () => {
    expect(inicioDaJanelaLocal(SP, 8, D('2026-09-29T14:00:00Z')).toISOString())
      .toBe('2026-09-29T11:00:00.000Z');
  });

  it('pode estar no FUTURO — e é isso que faz `alertHour` significar algo', () => {
    // 06:00Z é 03:00 em São Paulo. Com `alertHour: 8`, a janela de hoje ainda não
    // abriu, e o job precisa comparar: sem a comparação, ele tomaria a janela do dia
    // no primeiro tick depois da meia-noite e o campo na tela não mudaria nada.
    const agora = D('2026-09-29T06:00:00Z');
    expect(inicioDaJanelaLocal(SP, 8, agora).getTime()).toBeGreaterThan(agora.getTime());
  });

  it('a mesma hora de parede muda de instante com o horário de verão', () => {
    // 8h da manhã em Nova York é 12:00Z no verão e 13:00Z no inverno. Uma janela que
    // ignorasse isso dispararia uma hora deslocada durante metade do ano.
    expect(inicioDaJanelaLocal(NY, 8, D('2026-10-15T20:00:00Z')).toISOString())
      .toBe('2026-10-15T12:00:00.000Z');
    expect(inicioDaJanelaLocal(NY, 8, D('2026-11-15T20:00:00Z')).toISOString())
      .toBe('2026-11-15T13:00:00.000Z');
  });

  it('limita a hora à faixa 0–23 em vez de estourar para o dia seguinte', () => {
    // O schema já recusa fora da faixa (422), mas a coluna também é escrita por
    // dump restaurado e UPDATE à mão — e `Date.UTC(…, 99)` viraria uma data quatro
    // dias adiante, que o job nunca alcançaria.
    const agora = D('2026-09-29T14:00:00Z');
    expect(inicioDaJanelaLocal(SP, 99, agora).toISOString())
      .toBe(inicioDaJanelaLocal(SP, 23, agora).toISOString());
    expect(inicioDaJanelaLocal(SP, -7, agora).toISOString())
      .toBe(inicioDaJanelaLocal(SP, 0, agora).toISOString());
  });
});

describe('a hora local do turno (F7, agora delegando para o core)', () => {
  it('`horaLocal` devolve a hora de parede, e não a do processo', () => {
    expect(horaLocal(D('2026-09-29T14:00:00Z'), SP)).toBe(11);
    expect(horaLocalEm(D('2026-09-29T14:00:00Z'), SP)).toBe(11);
  });

  it('meia-noite local é 0, nunca 24 — a armadilha do ICU', () => {
    // Há ICU em que o ciclo padrão devolve "24" para a meia-noite, e `Number('24')`
    // cairia no turno errado justamente na hora que a correção existe para acertar.
    const meiaNoiteEmSP = D('2026-09-29T03:00:00Z');
    expect(horaLocalEm(meiaNoiteEmSP, SP)).toBe(0);
    expect(turnoDaHora(horaLocalEm(meiaNoiteEmSP, SP))).toBe('Noite');
  });

  it('as duas funções concordam — é a MESMA travessia desde a F8', () => {
    // O `shift.helper.ts` tinha o próprio `Intl.DateTimeFormat`. Duas implementações
    // divergiriam no caso que ninguém testa; hoje uma delega para a outra.
    for (const hora of [0, 3, 7, 12, 18, 21, 23]) {
      const instante = D(`2026-09-29T${String(hora).padStart(2, '0')}:30:00Z`);
      expect(horaLocal(instante, NY)).toBe(horaLocalEm(instante, NY));
    }
  });
});
