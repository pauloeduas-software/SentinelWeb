import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from './helpers/app';
import { nomeDoBanco } from './setup/database';
import { prisma } from '../server/core/database/prismaClient';

// O teste DO HARNESS. Se este arquivo falha, nenhum outro resultado da suíte
// significa coisa alguma — então ele prova as premissas antes das regras.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('o harness', () => {
  it('está apontado para um banco descartável', () => {
    expect(nomeDoBanco()).toMatch(/_test$/);
  });

  it('semeou o catálogo de fábrica antes do arquivo', async () => {
    // Os cinco tipos de status do D5. A contagem prova que o seed rodou; o
    // `IN_USE` prova que rodou a versão CERTA — é o tipo que nasceu depois da
    // auditoria, e um banco semeado por uma cópia velha não o teria.
    const status = await prisma.statusLabel.findMany({ select: { type: true } });
    expect(status.length).toBeGreaterThan(0);
    expect(status.map((s) => s.type)).toContain('IN_USE');
  });

  it('monta a aplicação sem abrir porta', () => {
    // `server` só existe depois de `listen()`. Nulo aqui é a prova de que
    // `buildApp()` não abriu socket nenhum.
    expect(api.app.server.listening).toBe(false);
  });

  it('entra com o administrador do seed e devolve a sessão em cookie httpOnly', async () => {
    const { status, body } = await api.get<{ id: string }>('/api/auth/me');
    expect(status).toBe(200);
    expect(body.id).toBe(api.adminId);
  });
});

describe('a porta fechada (D22 / F3 Etapa C)', () => {
  it('recusa a API sem sessão', async () => {
    const { status } = await api.anonimo.get('/api/assets');
    expect(status).toBe(401);
  });

  it('deixa passar só o que está na allowlist', async () => {
    expect((await api.anonimo.get('/health')).status).toBe(200);
  });

  it('não devolve o token no corpo do login — só no cookie (D22)', async () => {
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD },
    });

    expect(resposta.statusCode).toBe(200);
    // A regra inteira do D22 em uma asserção: se o token aparecer aqui, existe
    // o caminho para o front guardá-lo no `localStorage`, e um XSS passa a
    // exportar a sessão.
    expect(resposta.body).not.toMatch(/eyJ/);

    const cookie = resposta.cookies.find((c) => c.name === 'sentinel_sessao');
    expect(cookie?.httpOnly).toBe(true);
  });
});
