import { afterEach, describe, expect, it } from 'vitest';
import { validateEnv } from '../../server/infra/config/env';

// O NODE_ENV é uma igualdade com 'production' (`isProduction`): um erro de
// digitação desligaria em silêncio o cookie Secure, a recusa do segredo fraco e
// a exigência do AGENT_TOKEN. O boot recusa valor fora da lista.

const original = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = original;
});

describe('validateEnv — NODE_ENV', () => {
  it.each(['producao', 'Production', 'prod', 'staging'])('recusa "%s"', (valor) => {
    process.env.NODE_ENV = valor;
    expect(() => validateEnv()).toThrow(/NODE_ENV inválido/);
  });

  it.each(['development', 'production', 'test'])('aceita "%s"', (valor) => {
    process.env.NODE_ENV = valor;
    expect(() => validateEnv()).not.toThrow(/NODE_ENV/);
  });

  it('aceita ausente: é o `bun run dev`', () => {
    delete process.env.NODE_ENV;
    expect(() => validateEnv()).not.toThrow(/NODE_ENV/);
  });
});
