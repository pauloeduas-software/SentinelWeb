import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRADA_REGEX, motivoParaRecusarPadrao, normalizarValor, validadorDoFormato,
} from '../../server/domain/custom-field/helpers/field-validator.helper';
import { slugificar } from '../../server/domain/custom-field/helpers/slug.helper';

// O MOTOR DE VALIDAÇÃO POR FORMATO — função pura, então teste sem banco.
//
// `.puro.test.ts` de propósito (ver vitest.config.ts): o `globalSetup` roda em
// TODA invocação, e um arquivo que só exercita função pura não pode depender de
// Postgres de pé para ser rodado sozinho. As três guardas do D63 são a única
// coisa desta fase que um atacante alcança — e elas precisam ser verificáveis
// numa máquina sem contêiner.

type Campo = Parameters<typeof validadorDoFormato>[0];

/** Um campo mínimo do formato pedido. `element: TEXT` para a lista não interferir. */
function campo(format: string, extra: Partial<Campo> = {}): Campo {
  return {
    format: format as Campo['format'],
    element: 'TEXT',
    regexPattern: null,
    listValues: [],
    ...extra,
  } as Campo;
}

const aceita = (format: string, valor: string, extra?: Partial<Campo>) =>
  validadorDoFormato(campo(format, extra), 'Campo').safeParse(valor).success;

describe('slug derivado do nome', () => {
  it('tira acento em vez de trocá-lo por underscore', () => {
    // Sem a decomposição NFD, "Patrimônio" viraria `patrim_nio` — e o slug
    // deixaria de ser adivinhável, que é a única razão de ele ser derivado.
    expect(slugificar('Nº do Patrimônio')).toBe('n_do_patrimonio');
    expect(slugificar('IP Fixo')).toBe('ip_fixo');
  });

  it('não deixa separador sobrando nas pontas', () => {
    expect(slugificar('  --IMEI!!  ')).toBe('imei');
  });
});

describe('normalização — as três formas de "não preenchido"', () => {
  it('trata ausente, nulo e vazio como a MESMA coisa', () => {
    // Se as três não significassem o mesmo, "obrigatório" passaria a depender de
    // como a tela serializa o campo em branco.
    expect(normalizarValor(undefined)).toBeNull();
    expect(normalizarValor(null)).toBeNull();
    expect(normalizarValor('   ')).toBeNull();
  });

  it('converte booleano e número em texto', () => {
    expect(normalizarValor(true)).toBe('true');
    expect(normalizarValor(false)).toBe('false');
    expect(normalizarValor(42)).toBe('42');
  });

  it('recusa objeto e array devolvendo undefined', () => {
    // Quem chama transforma isso em 422: estrutura aninhada dentro de um valor
    // que a tela desenha como `<input>` nunca seria achada pelo filtro.
    expect(normalizarValor({ a: 1 })).toBeUndefined();
    expect(normalizarValor([1, 2])).toBeUndefined();
  });
});

describe('formatos de rede', () => {
  it('IPV4 recusa octeto acima de 255', () => {
    expect(aceita('IPV4', '10.0.0.7')).toBe(true);
    expect(aceita('IPV4', '999.1.1.1')).toBe(false);
  });

  it('IP aceita as duas famílias; IPV4 recusa IPv6', () => {
    expect(aceita('IP', '10.0.0.7')).toBe(true);
    expect(aceita('IP', '2001:db8::1')).toBe(true);
    // Um IPv6 num campo declarado IPv4 é erro de cadastro, não flexibilidade.
    expect(aceita('IPV4', '2001:db8::1')).toBe(false);
  });

  it('MAC exige separador — é regex própria, o zod não tem', () => {
    expect(aceita('MAC', '00:1B:44:11:3A:B7')).toBe(true);
    expect(aceita('MAC', '00-1B-44-11-3A-B7')).toBe(true);
    expect(aceita('MAC', '001B4411 3AB7')).toBe(false);
  });
});

describe('formatos de texto e número', () => {
  it('NUMERIC aceita vírgula e sinal, recusa letra', () => {
    expect(aceita('NUMERIC', '-12,5')).toBe(true);
    expect(aceita('NUMERIC', '1234')).toBe(true);
    expect(aceita('NUMERIC', '12 GB')).toBe(false);
  });

  it('ALPHA aceita acento — `\\p{L}`, não `[a-z]`', () => {
    // Sem a classe unicode, "José" não seria alfabético só por ter acento, e o
    // formato ficaria inútil em português.
    expect(aceita('ALPHA', 'José da Silva')).toBe(true);
    expect(aceita('ALPHA', 'Sala 12')).toBe(false);
    expect(aceita('ALPHANUMERIC', 'Sala 12')).toBe(true);
  });

  it('BOOLEAN valida o TEXTO, porque é texto que se guarda', () => {
    expect(aceita('BOOLEAN', 'true')).toBe(true);
    expect(aceita('BOOLEAN', 'false')).toBe(true);
    expect(aceita('BOOLEAN', 'sim')).toBe(false);
  });

  it('DATE exige AAAA-MM-DD', () => {
    expect(aceita('DATE', '2026-09-30')).toBe(true);
    expect(aceita('DATE', '30/09/2026')).toBe(false);
  });
});

describe('a lista fechada VENCE o formato', () => {
  it('LISTBOX só aceita o que está na lista, ignorando o formato', () => {
    const lista = { element: 'LISTBOX', listValues: ['128', '256'] } as Partial<Campo>;
    expect(aceita('NUMERIC', '256', lista)).toBe(true);
    // `512` é numérico e não está na lista: a lista manda.
    expect(aceita('NUMERIC', '512', lista)).toBe(false);
  });
});

describe('as três guardas do REGEX (D63)', () => {
  it('recusa quantificador aninhado — é o que trava o processo inteiro', () => {
    // O Node é single-threaded: `(a+)+$` contra 40 caracteres não é um 500, é o
    // servidor fora do ar. A guarda é sintática e roda no CADASTRO do campo.
    expect(motivoParaRecusarPadrao('(a+)+$')).toMatch(/quantificador aninhado/);
    expect(motivoParaRecusarPadrao('(a*)*')).toMatch(/quantificador aninhado/);
    expect(motivoParaRecusarPadrao('(a{2,})+')).toMatch(/quantificador aninhado/);
  });

  it('aceita padrão comum, com quantificador NÃO aninhado', () => {
    expect(motivoParaRecusarPadrao('^[A-Z]{3}-\\d{4}$')).toBeNull();
    expect(motivoParaRecusarPadrao('^\\d+$')).toBeNull();
  });

  it('recusa padrão longo demais e padrão sintaticamente inválido', () => {
    expect(motivoParaRecusarPadrao('a'.repeat(300))).toMatch(/passa de/);
    expect(motivoParaRecusarPadrao('([a-z')).toMatch(/não é uma expressão regular válida/);
  });

  it('o TETO DA ENTRADA vem antes do `.regex()` — e a ordem é a guarda', () => {
    // Uma entrada grande é rejeitada por TAMANHO sem nunca chegar ao motor de
    // regex. Invertida, esta cadeia não protegeria nada.
    const validador = validadorDoFormato(campo('REGEX', { regexPattern: '^\\d+$' }), 'Código');
    const gigante = '1'.repeat(MAX_ENTRADA_REGEX + 1);

    const erro = validador.safeParse(gigante);
    expect(erro.success).toBe(false);
    expect(erro.error!.issues[0].message).toMatch(new RegExp(`máximo de ${MAX_ENTRADA_REGEX}`));

    expect(validador.safeParse('12345').success).toBe(true);
    expect(validador.safeParse('12a').success).toBe(false);
  });

  it('padrão AUSENTE faz o campo recusar tudo, nunca aceitar tudo', () => {
    // Um campo configurado para validar que passa a aceitar qualquer coisa é
    // pior do que um que recusa tudo: o primeiro grava lixo em silêncio.
    const semPadrao = validadorDoFormato(campo('REGEX'), 'Código');
    expect(semPadrao.safeParse('qualquer coisa').success).toBe(false);
    expect(semPadrao.safeParse('').success).toBe(false);
  });
});
