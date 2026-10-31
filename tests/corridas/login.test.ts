import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A RAJADA DE SENHAS ERRADAS.
//
// O contador lia o número de antes do argon2 e gravava ele mais um: dez
// tentativas juntas liam todas zero, o contador ficava em 1, a auditoria dizia
// "tentativa 1" dez vezes, e o bloqueio de cinco erros não chegava. Com o
// `increment`, quem conta é o banco.
//
// E a rajada DURANTE o bloqueio: todas procuravam a linha "bloqueada" antes de
// qualquer uma gravar, e cada uma gravava a sua — a mesma tabela cheia que a
// regra de uma linha por bloqueio existe para evitar.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('dez senhas erradas ao mesmo tempo na mesma conta', () => {
  it('contam dez, cada linha da auditoria com o seu número, e a conta trava', async () => {
    const email = 'rajada@teste.local';
    const criada = { body: await api.criarConta({ name: 'Alvo da Rajada', email }, 'senha-da-rajada-1') };

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => api.anonimo.post('/api/auth/login', { email, password: 'senha-errada-000' })),
    );
    expect(respostas.every((r) => r.status === 401)).toBe(true);

    const conta = await prisma.user.findUniqueOrThrow({ where: { id: criada.body.id } });
    expect(conta.failedLoginCount).toBe(10);
    expect(conta.lockedUntil).not.toBeNull();

    const linhas = await prisma.auditLog.findMany({ where: { entityId: criada.body.id, action: 'LOGIN_FAILED' } });
    const numeros = linhas.map((l) => (l.changes as { tentativas: number }).tentativas).sort((x, y) => x - y);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('dez tentativas ao mesmo tempo na conta bloqueada', () => {
  it('gravam UMA linha "bloqueada"', async () => {
    const email = 'rajada-bloqueada@teste.local';
    const criada = { body: await api.criarConta({ name: 'Alvo Bloqueado', email }, 'senha-da-rajada-2') };
    await prisma.user.update({
      where: { id: criada.body.id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) },
    });

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => api.anonimo.post('/api/auth/login', { email, password: 'senha-da-rajada-2' })),
    );
    expect(respostas.every((r) => r.status === 423)).toBe(true);

    const linhas = await prisma.auditLog.findMany({ where: { entityId: criada.body.id, action: 'LOGIN_FAILED' } });
    expect(linhas.map((l) => (l.changes as { motivo: string }).motivo)).toEqual(['bloqueada']);
  });
});
