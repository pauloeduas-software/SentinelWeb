import { describe, expect, it } from 'vitest';
import { detectarDelimitador, lerCsv } from '../../server/domain/import/helpers/csv-parse.helper';

// A BORDA DO ARQUIVO QUE ENTRA (F10, Etapa D) — e ela é toda função pura.
//
// Este arquivo é `.puro`: nenhuma conexão, roda em milissegundos. O que ele
// exercita é o lugar onde um defeito de parser não aparece em teste de rota
// nenhum, porque a rota responde 201 e o relatório fica com o número errado
// dentro.
//
// O CASO QUE MOTIVOU O ARQUIVO É O `lineNumber`.
//
// `ImportRow.lineNumber` existe para UMA coisa: alguém abrir a planilha de
// cinco mil linhas e ir direto na linha que o relatório acusou. Com
// `skipEmptyLines: 'greedy'`, o papaparse tirava a linha em branco de dentro do
// array e o índice deixava de ser a linha do arquivo — toda linha depois de um
// espaço em branco era reportada uma ACIMA do lugar certo, e o relatório mandava
// a pessoa corrigir a linha de cima. Nada na resposta HTTP denuncia isso.

const CSV = (corpo: string) => Buffer.from(corpo, 'utf8');

describe('lerCsv — o número da linha é a LINHA DO ARQUIVO', () => {
  it('sem linha em branco, o cabeçalho é 1 e o primeiro dado é 2', () => {
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo\r\nATV-1;X\r\nATV-2;Y\r\n'));

    expect(linhas.map((linha) => linha.lineNumber)).toEqual([2, 3]);
  });

  it('LINHA EM BRANCO NO MEIO não desloca o número das seguintes', () => {
    // No Excel, "ATV-2" está na linha 4. É esse número que o relatório tem de
    // mostrar — e era o 3 que ele mostrava.
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo\r\nATV-1;X\r\n\r\nATV-2;Y\r\n'));

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ lineNumber: 2, valores: { Etiqueta: 'ATV-1' } });
    expect(linhas[1]).toMatchObject({ lineNumber: 4, valores: { Etiqueta: 'ATV-2' } });
  });

  it('TRÊS linhas em branco seguidas: o desvio não acumula', () => {
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo\r\nATV-1;X\r\n\r\n\r\n\r\nATV-2;Y\r\n'));

    expect(linhas.map((linha) => linha.lineNumber)).toEqual([2, 6]);
  });

  it('linha só com delimitadores (célula vazia em toda coluna) também é descartada', () => {
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo\r\nATV-1;X\r\n;\r\nATV-2;Y\r\n'));

    expect(linhas.map((linha) => linha.lineNumber)).toEqual([2, 4]);
  });

  it('a linha final em branco (que todo editor deixa) não vira linha de dado', () => {
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo\r\nATV-1;X\r\n\r\n'));

    expect(linhas).toHaveLength(1);
  });
});

describe('lerCsv — o cabeçalho é a primeira linha COM CONTEÚDO', () => {
  it('arquivo que começa em branco ainda tem cabeçalho, e o número continua honesto', () => {
    // Planilha concatenada à mão. Recusar isto por "coluna sem nome" seria
    // recusar um arquivo correto — e o delimitador seria contado numa linha
    // vazia, onde nenhum candidato aparece.
    const { cabecalhos, linhas, delimitador } = lerCsv(CSV('\r\nEtiqueta;Modelo\r\nATV-1;X\r\n'));

    expect(cabecalhos).toEqual(['Etiqueta', 'Modelo']);
    expect(delimitador).toBe(';');
    // "ATV-1" está na linha 3 do arquivo.
    expect(linhas[0].lineNumber).toBe(3);
  });
});

describe('lerCsv — as recusas da borda', () => {
  it('o BOM sai do primeiro cabeçalho', () => {
    const { cabecalhos } = lerCsv(CSV('﻿Etiqueta;Modelo\r\nATV-1;X\r\n'));
    expect(cabecalhos[0]).toBe('Etiqueta');
  });

  it('byte que não é UTF-8 recusa o arquivo com a instrução', () => {
    // `Localização` em Windows-1252: o `ç` é 0xE7, inválido em UTF-8.
    const bytes = Buffer.from([0x4c, 0x6f, 0x63, 0x61, 0x6c, 0x69, 0x7a, 0xe7, 0xe3, 0x6f]);

    expect(() => lerCsv(bytes)).toThrow(/CSV UTF-8/);
  });

  it('cabeçalho repetido é recusado: o mapeamento ficaria ambíguo', () => {
    expect(() => lerCsv(CSV('Etiqueta;Etiqueta\r\nA;B\r\n'))).toThrow(/repetido/i);
  });

  it('cabeçalho sem nome é recusado, dizendo quantas colunas são', () => {
    expect(() => lerCsv(CSV('Etiqueta;;Modelo\r\nA;B;C\r\n'))).toThrow(/sem nome/i);
  });

  it('célula ausente (linha mais curta) é string vazia, não `undefined`', () => {
    const { linhas } = lerCsv(CSV('Etiqueta;Modelo;Série\r\nATV-1;X\r\n'));

    // Para o importador, "não veio" e "veio vazio" são a mesma coisa: não mexer
    // naquele campo.
    expect(linhas[0].valores.Série).toBe('');
  });
});

describe('detectarDelimitador', () => {
  it('conta fora das aspas', () => {
    // A vírgula dentro das aspas não separa nada, e contá-la escolheria o
    // delimitador errado para o arquivo inteiro.
    expect(detectarDelimitador('"Nome, completo";Email;Setor')).toBe(';');
  });

  it('arquivo de uma coluna cai no padrão', () => {
    expect(detectarDelimitador('Etiqueta')).toBe(';');
  });

  it('reconhece vírgula, tabulação e barra vertical', () => {
    expect(detectarDelimitador('a,b,c')).toBe(',');
    expect(detectarDelimitador('a\tb\tc')).toBe('\t');
    expect(detectarDelimitador('a|b|c')).toBe('|');
  });
});
