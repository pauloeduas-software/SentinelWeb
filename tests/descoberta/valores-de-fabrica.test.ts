import { describe, expect, it } from 'vitest';
import { normalizeSerial, normalizeUuid } from '../../server/modules/reconciliation/helpers/normalize-identity.helper';

// O LIXO DE FÁBRICA RECONHECIDO SEM SEPARADORES (CT) — funções puras, sem banco.
//
// O SentinelAgente confere o serial sem `-`, `:` e espaço antes de mandar; se a
// limpeza daqui olhasse o valor com separadores, `0000-0000` passaria, e toda
// máquina com ele casaria com o mesmo computador.

describe('o serial de fábrica', () => {
  it.each([
    'System Serial Number',
    'SystemSerialNumber',
    '0000-0000',
    '00 00 00 00',
    '0:0:0:0',
    'Default',
    'Base Board Serial Number',
    'Not Available',
    '1234567890',
    'A-B-C',
  ])('"%s" vira null', (valor) => {
    expect(normalizeSerial(valor)).toBeNull();
  });

  it('o serial de verdade volta como veio, em minúsculas e com os separadores', () => {
    expect(normalizeSerial(' 5CG-1234XYZ ')).toBe('5cg-1234xyz');
  });
});

describe('o UUID de fábrica', () => {
  it.each([
    '03000200-0400-0500-0006-000700080009',
    '00020003-0004-0005-0006-000700080009',
    '03020100-0504-0706-0809-0A0B0C0D0E0F',
    '00010203-0405-0607-0809-0a0b0c0d0e0f',
    '10000000-0000-8000-0040-000000000000',
  ])('%s vira null', (valor) => {
    expect(normalizeUuid(valor)).toBeNull();
  });
});
