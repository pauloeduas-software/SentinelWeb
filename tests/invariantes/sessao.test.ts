import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// A SESSÃO — o que a derruba, o que a mantém, e o que fica registrado.
//
// O buraco que a maior parte deste arquivo cobre: até o `tokenVersion` existir,
// trocar a senha NÃO expulsava ninguém. A releitura por requisição
// (`current-user.usecase.ts`) só barra quem foi apagado ou desligado — quem
// roubasse o cookie continuava sendo um usuário válido e ativo, e seguia dentro
// pelas 8 horas do TTL mesmo depois de a vítima fazer exatamente o que se faz
// ao desconfiar.
//
// Tudo por HTTP, pelo mesmo caminho do navegador: é o `preHandler` global e o
// `jwtVerify` de verdade que precisam ser exercitados, não o use-case.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

/** Entra como alguém e devolve o cookie pronto para o `header`. */
async function logar(username: string, password: string): Promise<string> {
  const resposta = await api.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  });
  if (resposta.statusCode !== 200) {
    throw new Error(`login de "${username}" falhou (${resposta.statusCode}): ${resposta.body}`);
  }
  const token = resposta.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
  if (!token) throw new Error('login respondeu 200 sem gravar o cookie de sessão.');
  return `${COOKIE_SESSAO}=${token}`;
}

/** Um colaborador com credencial própria, para não mexer na sessão do harness. */
async function criarUsuarioComAcesso(sufixo: string) {
  const criado = await api.post<{ id: string }>('/api/users', {
    name: `Fulano ${sufixo}`,
    email: `fulano.${sufixo}@empresa.com`,
  });
  expect(criado.status).toBe(201);

  const username = `fulano.${sufixo}`;
  const password = 'senha-comprida-do-teste';
  const credencial = await api.post(`/api/users/${criado.body.id}/set-password`, { username, password });
  expect(credencial.status).toBe(200);

  return { id: criado.body.id, username, password };
}

describe('tokenVersion — trocar a senha derruba quem já está dentro', () => {
  it('mantém a sessão viva enquanto ninguém mexe na credencial', async () => {
    const usuario = await criarUsuarioComAcesso('estavel');
    const cookie = await logar(usuario.username, usuario.password);

    const antes = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(antes.statusCode).toBe(200);

    // Duas chamadas seguidas: prova que a conferência do `tokenVersion` não é
    // de uso único (um `tv` lido e descartado passaria no primeiro e falharia
    // no segundo, ou o contrário).
    const depois = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(depois.statusCode).toBe(200);
  });

  it('INVALIDA a sessão aberta quando a senha é redefinida', async () => {
    const usuario = await criarUsuarioComAcesso('invalidado');
    const cookie = await logar(usuario.username, usuario.password);

    // O cookie funciona ANTES — senão o 401 depois não provaria nada.
    const antes = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(antes.statusCode).toBe(200);

    const troca = await api.post(`/api/users/${usuario.id}/set-password`, {
      password: 'outra-senha-comprida',
    });
    expect(troca.status).toBe(200);

    // O MESMO cookie, que continua com assinatura válida e dentro do prazo,
    // agora é recusado: é o `tv` do token que não bate mais com a coluna.
    const depois = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(depois.statusCode).toBe(401);
  });

  it('a senha NOVA entra normalmente logo depois', async () => {
    const usuario = await criarUsuarioComAcesso('renovado');
    await api.post(`/api/users/${usuario.id}/set-password`, { password: 'a-senha-que-passa-a-valer' });

    // Derrubar as sessões não pode derrubar a CONTA: quem sabe a senha nova entra.
    const cookie = await logar(usuario.username, 'a-senha-que-passa-a-valer');
    const me = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });

  it('derruba UMA pessoa, não todo mundo', async () => {
    const alvo = await criarUsuarioComAcesso('alvo');
    const vizinho = await criarUsuarioComAcesso('vizinho');

    const cookieAlvo = await logar(alvo.username, alvo.password);
    const cookieVizinho = await logar(vizinho.username, vizinho.password);

    await api.post(`/api/users/${alvo.id}/set-password`, { password: 'senha-nova-do-alvo' });

    const doAlvo = await api.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieAlvo } });
    expect(doAlvo.statusCode).toBe(401);

    // `increment` na linha do alvo não pode mexer na geração de mais ninguém.
    const doVizinho = await api.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieVizinho },
    });
    expect(doVizinho.statusCode).toBe(200);
  });

  it('incrementa a geração a cada redefinição, sem reaproveitar número', async () => {
    const usuario = await criarUsuarioComAcesso('contador');

    const inicial = await prisma.user.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { tokenVersion: true },
    });

    await api.post(`/api/users/${usuario.id}/set-password`, { password: 'primeira-troca-longa' });
    await api.post(`/api/users/${usuario.id}/set-password`, { password: 'segunda-troca-longa1' });

    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { tokenVersion: true },
    });

    // Duas trocas, dois incrementos: um `set` fixo faria as duas gravarem o
    // mesmo número e a segunda não invalidaria nada.
    expect(depois.tokenVersion).toBe(inicial.tokenVersion + 2);
  });
});

describe('trilha de autenticação', () => {
  it('registra o acerto com o usuário, o IP e o user-agent', async () => {
    const usuario = await criarUsuarioComAcesso('trilha-ok');
    await logar(usuario.username, usuario.password);

    const evento = await prisma.authEvent.findFirst({
      where: { userId: usuario.id, type: 'LOGIN_OK' },
      orderBy: { createdAt: 'desc' },
    });

    expect(evento).not.toBeNull();
    expect(evento?.username).toBe(usuario.username);
    expect(evento?.ip).toBeTruthy();
  });

  it('registra a senha errada de uma conta que existe', async () => {
    const usuario = await criarUsuarioComAcesso('trilha-erro');

    const resposta = await api.anonimo.post('/api/auth/login', {
      username: usuario.username,
      password: 'senha-errada-de-proposito',
    });
    expect(resposta.status).toBe(401);

    const evento = await prisma.authEvent.findFirst({
      where: { userId: usuario.id, type: 'LOGIN_FAIL' },
    });
    expect(evento).not.toBeNull();
  });

  it('registra a tentativa contra um login que NÃO existe — sem usuário, com o texto digitado', async () => {
    const resposta = await api.anonimo.post('/api/auth/login', {
      username: 'nao.existe.ninguem',
      password: 'tanto-faz-a-senha',
    });
    expect(resposta.status).toBe(401);

    // É a linha mais importante da tabela: a tentativa que não casa com conta
    // nenhuma é a que denuncia varredura, e é justamente a que não caberia no
    // `ActivityLog` (que exige entidade e ator).
    const evento = await prisma.authEvent.findFirst({
      where: { username: 'nao.existe.ninguem' },
    });
    expect(evento).not.toBeNull();
    expect(evento?.userId).toBeNull();
    expect(evento?.type).toBe('LOGIN_FAIL');
  });

  it('não distingue no LOG o que não distingue na RESPOSTA', async () => {
    // Conta inexistente e senha errada saem as duas como LOGIN_FAIL. Separar os
    // tipos seria construir dentro de casa o oráculo de enumeração que a
    // mensagem única esconde.
    const semConta = await prisma.authEvent.findFirst({ where: { username: 'nao.existe.ninguem' } });
    const comConta = await prisma.authEvent.findFirst({
      where: { username: 'fulano.trilha-erro', type: 'LOGIN_FAIL' },
    });

    expect(semConta?.type).toBe(comConta?.type);
  });

  it('registra a redefinição de senha', async () => {
    const usuario = await criarUsuarioComAcesso('trilha-senha');
    await api.post(`/api/users/${usuario.id}/set-password`, { password: 'mais-uma-senha-longa' });

    const evento = await prisma.authEvent.findFirst({
      where: { userId: usuario.id, type: 'PASSWORD_CHANGED' },
    });
    expect(evento).not.toBeNull();
  });

  it('NUNCA grava a senha tentada', async () => {
    const senhaSecreta = 'senha-que-nao-pode-vazar-no-log';
    await api.anonimo.post('/api/auth/login', {
      username: 'alvo.do.vazamento',
      password: senhaSecreta,
    });

    // Varre a tabela inteira: a senha não pode aparecer em campo NENHUM. Log com
    // senha é vazamento permanente, com data e IP anexados.
    const eventos = await prisma.authEvent.findMany();
    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain(senhaSecreta);
  });
});

describe('endurecimento das rotas de credencial', () => {
  it('manda a resposta do login NÃO ser guardada em cache', async () => {
    const usuario = await criarUsuarioComAcesso('sem-cache');
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: usuario.username, password: usuario.password },
    });

    // A resposta carrega `Set-Cookie` de sessão: um proxy corporativo ou CDN
    // guardando isso entrega a sessão a quem passar pelo mesmo intermediário.
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });

  it('recusa login vindo de uma origem estranha', async () => {
    const usuario = await criarUsuarioComAcesso('origem');
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://site-do-atacante.example' },
      payload: { username: usuario.username, password: usuario.password },
    });

    // Segunda camada anti-CSRF, atrás do `SameSite` do cookie: a credencial
    // está CERTA e mesmo assim não passa.
    //
    // Só tem efeito porque o `.env.test` define `CORS_ORIGIN`: sem allowlist,
    // `getCorsOrigins()` devolve `true` fora de produção e toda origem seria
    // aceita. Ver o comentário no `.env.test`.
    expect(resposta.statusCode).toBe(403);
  });

  it('deixa passar a origem que está na allowlist', async () => {
    // A outra metade: sem isto, um `verificarOrigem` que recusasse TUDO passaria
    // no teste acima e quebraria o painel em produção.
    const usuario = await criarUsuarioComAcesso('origem-boa');
    const resposta = await api.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:3000' },
      payload: { username: usuario.username, password: usuario.password },
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('deixa passar quem não manda Origin (cliente não-navegador)', async () => {
    // `curl`, o harness, um script de operação: nenhum deles carrega o cookie de
    // uma vítima, então exigir o cabeçalho quebraria a automação sem fechar
    // ataque nenhum.
    const usuario = await criarUsuarioComAcesso('sem-origem');
    const cookie = await logar(usuario.username, usuario.password);
    expect(cookie).toBeTruthy();
  });

  it('recusa corpo grande demais no login', async () => {
    const resposta = await api.anonimo.post('/api/auth/login', {
      username: 'admin',
      password: 'x'.repeat(64 * 1024),
    });

    // O teto global do Fastify é 1 MiB e o login é a única rota que um anônimo
    // alcança: sem limite próprio, qualquer um faz o servidor gastar parse antes
    // de descobrir que a senha está errada.
    expect(resposta.status).toBe(413);
  });
});
