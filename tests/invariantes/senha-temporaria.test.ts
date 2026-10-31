import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { COOKIE_SESSAO } from '../../server/modules/auth/helpers/session-cookie.helper';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A SENHA TEMPORÁRIA E "MINHA CONTA" (AR).
//
// O administrador gera uma senha para quem esqueceu a sua; a conta fica marcada e
// só alcança "quem sou eu", "sair" e a troca da própria senha, até a pessoa
// escolher a dela. Quem troca a PRÓPRIA senha não é derrubado — as outras sessões
// da conta, sim.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const SENHA = 'senha-comprida-do-teste';
let contador = 0;

/** Uma conta que já trocou a temporária do cadastro por `SENHA` (AU). */
async function criarConta() {
  const email = `temporaria.${++contador}@empresa.com`;
  const { id } = await api.criarConta({ name: `Conta ${contador}`, email }, SENHA);
  return { id, email };
}

async function entrar(email: string, password: string): Promise<{ cookie: string; corpo: Record<string, unknown> }> {
  const resposta = await api.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  expect(resposta.statusCode).toBe(200);
  const token = resposta.cookies.find((c) => c.name === COOKIE_SESSAO)!.value;
  return { cookie: `${COOKIE_SESSAO}=${token}`, corpo: resposta.json() };
}

function chamar(cookie: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) {
  return api.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
}

async function gerarTemporaria(id: string): Promise<string> {
  const resposta = await api.post<{ temporaryPassword: string }>(`/api/users/${id}/temporary-password`);
  expect(resposta.status).toBe(200);
  return resposta.body.temporaryPassword;
}

describe('gerar a senha temporária', () => {
  it('devolve uma senha legível, marca a conta e derruba as sessões abertas dela', async () => {
    const { id, email } = await criarConta();
    const antiga = await entrar(email, SENHA);

    const temporaria = await gerarTemporaria(id);
    expect(temporaria).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);

    const conta = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(conta.mustChangePassword).toBe(true);
    // A sessão aberta de antes caiu, e a senha antiga deixou de valer.
    expect((await chamar(antiga.cookie, 'GET', '/api/auth/me')).statusCode).toBe(401);
    expect((await api.anonimo.post('/api/auth/login', { email, password: SENHA })).status).toBe(401);
  });

  it('destrava a conta que se trancou fora', async () => {
    const { id, email } = await criarConta();
    await prisma.user.update({ where: { id }, data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });

    const temporaria = await gerarTemporaria(id);
    const { corpo } = await entrar(email, temporaria);
    expect(corpo.mustChangePassword).toBe(true);
  });

  it('é 409 para a PRÓPRIA conta, e 404 para quem não existe', async () => {
    expect((await api.post(`/api/users/${api.adminId}/temporary-password`)).status).toBe(409);
    expect((await api.post('/api/users/00000000-0000-4000-8000-000000000000/temporary-password')).status).toBe(404);
  });

  it('não vai para a auditoria: só o fato de ter sido gerada', async () => {
    const { id } = await criarConta();
    const temporaria = await gerarTemporaria(id);

    const linhas = await prisma.auditLog.findMany({ where: { entityId: id, action: 'UPDATE' } });
    expect(linhas.some((l) => (l.changes as { senha?: string }).senha === 'temporária')).toBe(true);
    expect(JSON.stringify(linhas)).not.toContain(temporaria);
  });

  it('a resposta não vai para cache', async () => {
    const { id } = await criarConta();
    const resposta = await api.post(`/api/users/${id}/temporary-password`);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });
});

describe('com a senha temporária, a sessão é estreita', () => {
  it('alcança /me, sair e a troca da senha, e mais nada', async () => {
    const { id, email } = await criarConta();
    const { cookie, corpo } = await entrar(email, await gerarTemporaria(id));
    expect(corpo.mustChangePassword).toBe(true);

    const me = await chamar(cookie, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().mustChangePassword).toBe(true);

    for (const [method, url] of [['GET', '/api/assets'], ['GET', '/api/users'], ['PATCH', '/api/auth/me']] as const) {
      const bloqueada = await chamar(cookie, method, url, method === 'PATCH' ? { name: 'Outro' } : undefined);
      expect(bloqueada.statusCode, `${method} ${url}`).toBe(403);
      expect(bloqueada.json().error).toContain('Troque a senha temporária');
    }

    expect((await chamar(cookie, 'POST', '/api/auth/logout')).statusCode).toBe(200);
  });
});

describe('a pessoa troca a PRÓPRIA senha', () => {
  it('com a temporária: a marca cai, a sessão que trocou sobrevive e o resto do sistema abre', async () => {
    const { id, email } = await criarConta();
    const temporaria = await gerarTemporaria(id);
    const { cookie } = await entrar(email, temporaria);
    const outraAba = await entrar(email, temporaria);

    // Sem a atual (AU): a temporária acabou de ser provada no login.
    const trocou = await chamar(cookie, 'PUT', '/api/auth/password', { newPassword: 'minha-senha-nova-123' });
    expect(trocou.statusCode).toBe(200);
    expect(trocou.json().mustChangePassword).toBe(false);

    // O cookie NOVO vem na resposta, e com ele a pessoa segue dentro.
    const novoToken = trocou.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
    expect(novoToken).toBeDefined();
    const novoCookie = `${COOKIE_SESSAO}=${novoToken}`;
    expect((await chamar(novoCookie, 'GET', '/api/auth/me')).json().mustChangePassword).toBe(false);
    expect((await chamar(novoCookie, 'GET', '/api/assets')).statusCode).toBe(200);

    // Quem não trocou perdeu a sessão: a da outra aba e a de antes da troca.
    expect((await chamar(outraAba.cookie, 'GET', '/api/auth/me')).statusCode).toBe(401);
    expect((await chamar(cookie, 'GET', '/api/auth/me')).statusCode).toBe(401);

    // E a senha nova entra; a temporária não.
    expect((await api.anonimo.post('/api/auth/login', { email, password: temporaria })).status).toBe(401);
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'minha-senha-nova-123' })).status).toBe(200);
  });

  it('com a temporária, a nova não pode ser a própria temporária', async () => {
    const { id, email } = await criarConta();
    const temporaria = await gerarTemporaria(id);
    const { cookie } = await entrar(email, temporaria);

    const repetiu = await chamar(cookie, 'PUT', '/api/auth/password', { newPassword: temporaria });
    expect(repetiu.statusCode).toBe(422);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).mustChangePassword).toBe(true);
  });

  it('com a senha comum, sem marca nenhuma', async () => {
    const { email } = await criarConta();
    const { cookie } = await entrar(email, SENHA);

    const trocou = await chamar(cookie, 'PUT', '/api/auth/password', { currentPassword: SENHA, newPassword: 'outra-senha-nova-456' });
    expect(trocou.statusCode).toBe(200);
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'outra-senha-nova-456' })).status).toBe(200);
  });

  it('recusa a atual errada (422, e não 401: a sessão é válida), a igual e a curta', async () => {
    const { email } = await criarConta();
    const { cookie } = await entrar(email, SENHA);

    const errada = await chamar(cookie, 'PUT', '/api/auth/password', { currentPassword: 'nao-e-essa-aqui', newPassword: 'minha-senha-nova-123' });
    expect(errada.statusCode).toBe(422);
    expect(errada.json().error).toBe('A senha atual não confere.');

    const igual = await chamar(cookie, 'PUT', '/api/auth/password', { currentPassword: SENHA, newPassword: SENHA });
    expect(igual.statusCode).toBe(422);

    const curta = await chamar(cookie, 'PUT', '/api/auth/password', { currentPassword: SENHA, newPassword: 'curta' });
    expect(curta.statusCode).toBe(422);

    // Fora da troca obrigatória a atual é exigida: a sessão sozinha não prova quem está no teclado.
    const semAtual = await chamar(cookie, 'PUT', '/api/auth/password', { newPassword: 'minha-senha-nova-123' });
    expect(semAtual.statusCode).toBe(422);

    // Nada disso derrubou a sessão.
    expect((await chamar(cookie, 'GET', '/api/auth/me')).statusCode).toBe(200);
  });

  it('a troca vai para a auditoria sem a senha', async () => {
    const { id, email } = await criarConta();
    const { cookie } = await entrar(email, SENHA);
    await chamar(cookie, 'PUT', '/api/auth/password', { currentPassword: SENHA, newPassword: 'senha-que-nao-vai-pro-log' });

    const linhas = await prisma.auditLog.findMany({ where: { entityId: id, action: 'UPDATE' } });
    expect(linhas.some((l) => (l.changes as { senha?: string }).senha === 'alterada')).toBe(true);
    expect(JSON.stringify(linhas)).not.toContain('senha-que-nao-vai-pro-log');
  });

});

describe('ninguém escolhe a senha de outra pessoa (AU)', () => {
  it('o cadastro nasce com uma temporária, que sai uma vez e não vai para a auditoria', async () => {
    const email = `cadastro.${++contador}@empresa.com`;
    const criada = await api.post<{ id: string; temporaryPassword: string }>('/api/users', { name: 'Conta Nova', email });
    expect(criada.status).toBe(201);
    const { id, temporaryPassword } = criada.body;
    expect(temporaryPassword).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).mustChangePassword).toBe(true);

    // Com ela, a pessoa entra só para escolher a dela.
    const { cookie, corpo } = await entrar(email, temporaryPassword);
    expect(corpo.mustChangePassword).toBe(true);
    expect((await chamar(cookie, 'GET', '/api/assets')).statusCode).toBe(403);

    const linhas = await prisma.auditLog.findMany({ where: { entityId: id } });
    expect(JSON.stringify(linhas)).not.toContain(temporaryPassword);
  });

  it('o cadastro e a edição recusam senha no corpo', async () => {
    const email = `com-senha.${++contador}@empresa.com`;
    expect((await api.post('/api/users', { name: 'Com Senha', email, password: 'senha-escolhida-123' })).status).toBe(422);

    const { id } = await criarConta();
    expect((await api.put(`/api/users/${id}`, { password: 'senha-escolhida-123' })).status).toBe(422);
    expect((await api.put(`/api/users/${api.adminId}`, { password: 'senha-escolhida-123' })).status).toBe(422);
  });
});

describe('Minha conta: o nome', () => {
  it('troca o próprio nome e só o nome', async () => {
    const { id, email } = await criarConta();
    const { cookie } = await entrar(email, SENHA);

    const trocou = await chamar(cookie, 'PATCH', '/api/auth/me', { name: 'Nome Novo' });
    expect(trocou.statusCode).toBe(200);
    expect(trocou.json().name).toBe('Nome Novo');
    expect(trocou.json().role).toBe('ADMIN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).name).toBe('Nome Novo');

    // Cargo, e-mail e qualquer outro campo são recusados: o corpo é estrito.
    for (const corpo of [{ email: 'outro@empresa.com' }, { role: 'ADMIN' }, { isActive: false }, { name: 'X', password: 'senha-comprida-123' }]) {
      expect((await chamar(cookie, 'PATCH', '/api/auth/me', corpo)).statusCode).toBe(422);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).email).toBe(email);
  });
});
