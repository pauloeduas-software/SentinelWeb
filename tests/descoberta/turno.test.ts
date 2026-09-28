import { describe, expect, it } from 'vitest';
import { horaLocal, turnoDaHora, turnoPelaHora } from '../../server/domain/reconciliation/helpers/shift.helper';

// O TURNO INFERIDO — e o defeito que este arquivo existe para nunca voltar.
//
// ═════════════════════════════════════════════════════════════════════════════
// A versão anterior tirava a MÉDIA ARITMÉTICA das horas observadas e cortava em
// 12 e 18. Hora é grandeza CIRCULAR, e a média dela não significa nada: quem
// trabalha 22h–2h aparece nas horas [22, 23, 0, 1], média 11,5 — e o plantão da
// noite era rotulado "Manhã".
//
// Não era caso de borda. Era o turno da noite, todas as noites, com o sistema
// apresentando um número que ninguém contesta.
//
// Estes testes são puros de propósito: a regra do turno é a que mais vai mexer
// com dado real de campo, e ela tem que ser verificável sem banco nem agente.
// ═════════════════════════════════════════════════════════════════════════════

describe('a madrugada é NOITE, e não o começo da manhã', () => {
  it('classifica as 24 horas nos três turnos, com 0h–5h na noite', () => {
    // O corte que corrige o defeito: `hora < 12` punha metade do turno noturno
    // em "Manhã".
    expect([0, 1, 2, 3, 4, 5].map(turnoDaHora)).toEqual(Array(6).fill('Noite'));
    expect([6, 7, 8, 9, 10, 11].map(turnoDaHora)).toEqual(Array(6).fill('Manhã'));
    expect([12, 13, 14, 15, 16, 17].map(turnoDaHora)).toEqual(Array(6).fill('Tarde'));
    expect([18, 19, 20, 21, 22, 23].map(turnoDaHora)).toEqual(Array(6).fill('Noite'));
  });
});

describe('⚠️ o plantão que atravessa a meia-noite', () => {
  it('é NOITE, e não "Manhã" como a média dizia', () => {
    // A entrada exata do defeito: soma 46, dividida por 4 dá 11,5, e 11,5 < 12.
    expect(turnoPelaHora([22, 23, 0, 1])).toBe('Noite');
  });

  it('continua NOITE com o plantão inteiramente depois da meia-noite', () => {
    expect(turnoPelaHora([0, 1, 2, 3])).toBe('Noite');
  });
});

describe('o caso comum continua respondendo o óbvio', () => {
  it('quem chega às 7h e às 8h trabalha de manhã', () => {
    expect(turnoPelaHora([7, 8, 7, 8, 9])).toBe('Manhã');
  });

  it('quem chega às 13h trabalha à tarde', () => {
    expect(turnoPelaHora([13, 14, 13, 15])).toBe('Tarde');
  });

  it('a MODA vence, e não a média: quatro manhãs e uma noite é manhã', () => {
    // Pela média, [7,7,7,7,23] dá 10,2 e daria "Manhã" por acidente. Pela moda,
    // dá "Manhã" porque é o que a pessoa faz — e é a razão que sobrevive a um
    // sexto dia às 23h.
    expect(turnoPelaHora([7, 7, 7, 7, 23])).toBe('Manhã');
  });
});

describe('empate devolve null — o D46 aplicado ao turno', () => {
  it('a escala 12x36 não ganha rótulo inventado', () => {
    // A média dizia "Tarde" para [7, 19], que está errado para os dois lados do
    // plantão. Sem rótulo, a ocupação nasce sem turno e quem cadastra escreve o
    // que é — que é exatamente por que a coluna é texto livre (D15).
    expect(turnoPelaHora([7, 19])).toBeNull();
  });

  it('e sem observação nenhuma também não inventa', () => {
    expect(turnoPelaHora([])).toBeNull();
  });
});

describe('a hora é LOCAL, nunca a do processo', () => {
  it('converte para o fuso pedido, e não para o do servidor', () => {
    // 2026-03-10T10:00:00Z é 07:00 em São Paulo (UTC-3). Inferir sobre UTC
    // jogaria o começo do expediente para as 10h.
    const instante = new Date('2026-03-10T10:00:00.000Z');
    expect(horaLocal(instante, 'America/Sao_Paulo')).toBe(7);
    expect(horaLocal(instante, 'UTC')).toBe(10);
  });

  it('a meia-noite é 0 e nunca 24', () => {
    // Há ICU em que o ciclo padrão devolve "24" para a meia-noite, e `Number('24')`
    // cairia fora dos três turnos. O `hourCycle: 'h23'` explícito é o que garante
    // isto justamente na hora que a correção existe para acertar.
    const meiaNoite = new Date('2026-03-10T03:00:00.000Z');
    expect(horaLocal(meiaNoite, 'America/Sao_Paulo')).toBe(0);
    expect(turnoDaHora(horaLocal(meiaNoite, 'America/Sao_Paulo'))).toBe('Noite');
  });
});
