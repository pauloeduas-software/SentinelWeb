import { describe, expect, it } from 'vitest';
import { colunasDoExport } from '../../server/domain/asset/helpers/asset-export-columns.helper';
import { coluna, colunaDeAgrupamento, selectDasColunas } from '../../server/domain/report/helpers/report-columns';
import { validarCampos } from '../../server/domain/label/helpers/label-layout.helper';

// AS ALLOWLISTS DE TOKEN, E O NOME QUE ATRAVESSAVA TODAS ELAS (F10, D67/D71).
//
// ═════════════════════════════════════════════════════════════════════════════
// `'constructor' in MAPA` É `true`.
//
// Quatro mapas desta fase — colunas do export de ativos, do export de licenças,
// do report builder e dos campos da etiqueta — eram consultados com
// `token in MAPA` ou com `MAPA[token]` seguido de `if (!encontrado)`. As duas
// formas percorrem a cadeia de protótipos, e um objeto literal herda tudo de
// `Object.prototype`: `constructor`, `__proto__`, `toString`, `valueOf`,
// `hasOwnProperty`. Todos passavam pela allowlist.
//
// O QUE ACONTECIA DEPOIS era pior que um 422 feio:
//
//   no EXPORT, a validação passava, os cabeçalhos da resposta já tinham ido com
//   status 200, e o `TypeError` estourava DENTRO do stream — o cliente recebia
//   um CSV truncado que diz ter dado certo. É exatamente o que a
//   validação-antes-do-primeiro-byte existe para evitar;
//
//   no BUILDER, `COLUNAS['constructor'].expr` era `undefined` e o `Prisma.sql`
//   quebrava com 500, em vez do 422 COM A LISTA que o D67 promete.
//
// Teste `.puro` porque é exatamente onde ele tem de estar: nenhuma dessas
// funções abre conexão, e um 500 por token herdado não precisa de Postgres de
// pé para ser provado.
// ═════════════════════════════════════════════════════════════════════════════

/** O que todo objeto literal herda — e que nenhum deles declara. */
const HERDADOS = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf'];

/**
 * Uma sessão que alcança tudo (F11).
 *
 * `colunasDoExport` passou a receber o teste de permissão porque `purchaseCost`
 * exige `assets.viewCost` (D77, a obrigação cruzada). Estes casos são sobre
 * token HERDADO, não sobre permissão: quem recusa `constructor` tem que recusar
 * para qualquer sessão, e passar "pode tudo" mantém o teste falando de uma coisa
 * só. A permissão tem teste próprio em `tests/invariantes/dado-sensivel.test.ts`.
 */
const PODE_TUDO = () => true;

describe('export de ativos — token herdado é 422, não arquivo truncado', () => {
  for (const herdado of HERDADOS) {
    it(`recusa "${herdado}" com a lista dos válidos`, () => {
      expect(() => colunasDoExport([herdado], PODE_TUDO)).toThrow(/Coluna desconhecida/);
    });
  }

  it('a lista boa continua passando, na ordem pedida e sem repetição', () => {
    const { tokens } = colunasDoExport(['serial', 'assetTag', 'serial'], PODE_TUDO);
    expect(tokens).toEqual(['serial', 'assetTag']);
  });

  it('cada coluna devolvida tem título e leitor — é o que o stream chama', () => {
    for (const coluna of colunasDoExport(undefined, PODE_TUDO).colunas) {
      expect(typeof coluna.titulo).toBe('string');
      expect(typeof coluna.valor).toBe('function');
    }
  });
});

describe('report builder — token herdado é 422, não 500', () => {
  for (const herdado of HERDADOS) {
    it(`\`coluna("${herdado}")\` recusa`, () => {
      expect(() => coluna(herdado)).toThrow(/Coluna desconhecida/);
    });

    it(`\`selectDasColunas(["${herdado}"])\` recusa`, () => {
      expect(() => selectDasColunas([herdado])).toThrow(/Coluna desconhecida/);
    });

    it(`\`colunaDeAgrupamento("${herdado}")\` recusa como DESCONHECIDA`, () => {
      // E não como "não pode agrupar": `COLUNAS['toString']` é uma função, cujo
      // `.agrupavel` é `undefined` — a mensagem antiga dizia que a coluna existe
      // e não serve para agrupar, que é falso duas vezes.
      expect(() => colunaDeAgrupamento(herdado)).toThrow(/Coluna desconhecida/);
    });
  }

  it('a coluna boa passa, e o fragmento SQL existe', () => {
    expect(coluna('responsavel').rotulo).toBe('Responsável');
    expect(selectDasColunas(['assetTag', 'responsavel'])).toBeTruthy();
  });

  it('agrupar por dinheiro continua recusado — e com a mensagem de VALOR', () => {
    expect(() => colunaDeAgrupamento('purchaseCost')).toThrow(/não pode agrupar/);
  });
});

describe('campos da etiqueta — token herdado é 422', () => {
  for (const herdado of HERDADOS) {
    it(`recusa "${herdado}"`, () => {
      expect(() => validarCampos([herdado])).toThrow(/Campo de etiqueta desconhecido/);
    });
  }

  it('o campo bom passa', () => {
    expect(validarCampos(['assetTag', 'model'])).toEqual(['assetTag', 'model']);
  });

  it('etiqueta sem nenhum campo é recusada: sairia só com barras', () => {
    expect(() => validarCampos([])).toThrow(/ao menos um campo/);
  });
});
