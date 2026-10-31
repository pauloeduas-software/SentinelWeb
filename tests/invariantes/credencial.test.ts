import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { registerErrorHandler } from '../../server/infra/errors/error-handler';
import { COOKIE_SESSAO } from '../../server/modules/auth/helpers/session-cookie.helper';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A CREDENCIAL — o cookie que sai do login, o que a conta responde a quem erra,
// e o que a sessão recusa. O que o `sessao.test.ts` não cobre: lá a pergunta é
// "a troca de senha derruba a sessão"; aqui é "o cookie e as recusas têm a forma
// certa", que é o que impede uma regressão de segurança passar em silêncio.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const SENHA = 'senha-comprida-do-teste';

/** Assina um token com o payload que o teste quiser: o tipo do projeto exige `tv`, e é a ausência dele que se prova. */
function assinar(payload: Record<string, unknown>, opcoes?: { expiresIn: string }): string {
  return (api.app.jwt.sign as (p: object, o?: object) => string)(payload, opcoes);
}

async function criarConta(sufixo: string) {
  const email = `credencial.${sufixo}@empresa.com`;
  const { id } = await api.criarConta({ name: `Credencial ${sufixo}`, email }, SENHA);
  return { id, email };
}

describe('o cookie do login', () => {
  it('é httpOnly, SameSite=Lax e vale na raiz', async () => {
    const { email } = await criarConta('cookie');
    const resposta = await api.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: SENHA } });
    expect(resposta.statusCode).toBe(200);

    const cookie = resposta.cookies.find((c) => c.name === COOKIE_SESSAO);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBeGreaterThan(0);
  });
});

describe('quem erra o login não descobre o que errou', () => {
  it('senha errada e e-mail inexistente respondem 401 com o MESMO corpo', async () => {
    const { email } = await criarConta('oraculo');
    const senhaErrada = await api.anonimo.post('/api/auth/login', { email, password: 'senha-errada-000' });
    const semConta = await api.anonimo.post('/api/auth/login', { email: 'nao-existe@empresa.com', password: 'senha-errada-000' });

    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(semConta.body).toEqual(senhaErrada.body);
  });
});

describe('a trava do login', () => {
  it('recomeça do zero quando vence: o primeiro erro depois do desbloqueio NÃO trava de novo', async () => {
    const { id, email } = await criarConta('trava-vencida');
    // A conta travou, e os 15 minutos passaram.
    await prisma.user.update({
      where: { id },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) },
    });

    const erro = await api.anonimo.post('/api/auth/login', { email, password: 'senha-errada-000' });
    expect(erro.status).toBe(401);

    const conta = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(conta.failedLoginCount).toBe(1);
    expect(conta.lockedUntil).toBeNull();

    // E a senha certa entra: não há trava sobrevivente.
    const certa = await api.anonimo.post('/api/auth/login', { email, password: SENHA });
    expect(certa.status).toBe(200);
  });

  it('continua travando no quinto erro seguido', async () => {
    const { id, email } = await criarConta('trava-nova');
    for (let i = 0; i < 5; i++) {
      await api.anonimo.post('/api/auth/login', { email, password: 'senha-errada-000' });
    }
    const conta = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(conta.failedLoginCount).toBe(5);
    expect(conta.lockedUntil).not.toBeNull();

    const certa = await api.anonimo.post('/api/auth/login', { email, password: SENHA });
    expect(certa.status).toBe(423);
  });
});

describe('o que a sessão recusa', () => {
  it('cookie adulterado: 401', async () => {
    const { email } = await criarConta('adulterado');
    const login = await api.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: SENHA } });
    const token = login.cookies.find((c) => c.name === COOKIE_SESSAO)!.value;
    const adulterado = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');

    const resposta = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `${COOKIE_SESSAO}=${adulterado}` } });
    expect(resposta.statusCode).toBe(401);
  });

  it('token vencido: 401', async () => {
    const { id } = await criarConta('vencido');
    const agora = Math.floor(Date.now() / 1000);
    const token = assinar({ sub: id, tv: 0, iat: agora - 3600 }, { expiresIn: '1s' });

    const resposta = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `${COOKIE_SESSAO}=${token}` } });
    expect(resposta.statusCode).toBe(401);
  });

  it('token assinado SEM o campo `tv`: 401 (não há mais tolerância)', async () => {
    const { id } = await criarConta('sem-tv');
    const token = assinar({ sub: id });

    const resposta = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `${COOKIE_SESSAO}=${token}` } });
    expect(resposta.statusCode).toBe(401);
  });
});

describe('o erro inesperado', () => {
  it('vira 500 com frase genérica: a mensagem do erro NÃO vai ao cliente', async () => {
    const servidor = Fastify({ logger: false });
    registerErrorHandler(servidor);
    servidor.get('/explode', async () => {
      throw new Error('connection to postgres://admin:segredo@10.0.0.5 refused');
    });

    const resposta = await servidor.inject({ method: 'GET', url: '/explode' });
    await servidor.close();

    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('postgres');
    expect(resposta.body).not.toContain('segredo');
    expect(resposta.json()).toEqual({ error: 'Erro interno do servidor' });
  });
});
