import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';
import { clienteComSessao, criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';

// O TOKEN PESSOAL DE API (F11, Etapa H).
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO PERSEGUE: um token que faz MAIS do que a pessoa, ou MENOS do
// que precisa.
//
// MAIS seria o furo: um token que alcança rota de credencial (e emite outro
// token, ou desliga o segundo fator), ou que revoga o token de outra pessoa
// mandando um id, ou que ignora as permissões do dono. Os três têm asserção aqui.
//
// MENOS seria inútil: um token que não autentica requisição nenhuma é só uma
// linha bonita numa tabela. Então a primeira asserção é que ele ENTRA.
//
// O token age COMO a pessoa — mesmas chaves, mesmo `actorId`. É isso que o torna
// uma credencial de integração e não um perfil paralelo.
// ═════════════════════════════════════════════════════════════════════════════

interface TokenNaLista {
  id: string;
  name: string;
  ownerType: 'AGENT' | 'USER';
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface TokenEmitido extends TokenNaLista {
  token: string;
}

let api: ApiDeTeste;

/** A pessoa que emite o token. Tem `assets.view` e NÃO tem `licenses.view`. */
let dela: Cliente;
let userId = '';
let token = '';
let tokenId = '';

/** Uma segunda pessoa, para o teste do "revogar o que não é seu". */
let doOutro: Cliente;

/** Um cliente que só fala por cabeçalho — sem cookie nenhum. */
function comToken(valor: string): Cliente {
  const headers = { authorization: `Bearer ${valor}` };
  return {
    get: (url, o) => api.anonimo.get(url, { headers: { ...headers, ...(o?.headers ?? {}) } }),
    post: (url, body, o) => api.anonimo.post(url, body, { headers: { ...headers, ...(o?.headers ?? {}) } }),
    put: (url, body, o) => api.anonimo.put(url, body, { headers: { ...headers, ...(o?.headers ?? {}) } }),
    patch: (url, body, o) => api.anonimo.patch(url, body, { headers: { ...headers, ...(o?.headers ?? {}) } }),
    delete: (url, body, o) => api.anonimo.delete(url, body, { headers: { ...headers, ...(o?.headers ?? {}) } }),
  };
}

/** Cria a conta, dá senha, entra — e devolve o cliente mais o id. */
async function contaComSessao(marca: string, permissoes: readonly string[]) {
  const senha = 'Senha-Do-Token-Pessoal-1';

  const pessoa = await api.post<{ id: string }>('/api/users', {
    name: `Dona do token ${marca}`,
    email: `${marca}@teste.local`,
  });
  expect(pessoa.status).toBe(201);

  if (permissoes.length > 0) {
    const grupo = await api.post<{ id: string }>('/api/groups', {
      name: `Grupo ${marca}`, permissions: [...permissoes],
    });
    expect([200, 201]).toContain(grupo.status);
    const vinculo = await api.put(`/api/users/${pessoa.body.id}/groups`, { groupIds: [grupo.body.id] });
    expect(vinculo.status).toBe(200);
  }

  const credencial = await api.post(`/api/users/${pessoa.body.id}/set-password`, {
    username: marca, password: senha,
  });
  expect(credencial.status).toBe(200);

  const entrada = await api.app.inject({
    method: 'POST', url: '/api/auth/login', payload: { username: marca, password: senha },
  });
  expect(entrada.statusCode).toBe(200);
  const valor = entrada.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
  if (!valor) throw new Error('login sem cookie');

  return { cliente: clienteComSessao(api.app, valor), id: pessoa.body.id };
}

beforeAll(async () => {
  api = await criarApi();

  const marca = `tok${Date.now()}`;
  // `assets.view` e NADA de licença: é esse contraste que prova que o token
  // herda as permissões da pessoa em vez de ter as suas.
  const principal = await contaComSessao(marca, ['assets.view']);
  dela = principal.cliente;
  userId = principal.id;

  const segunda = await contaComSessao(`${marca}b`, []);
  doOutro = segunda.cliente;
});

afterAll(async () => { await api.fechar(); });

describe('emitir', () => {
  it('devolve o segredo UMA vez, com a marca do projeto', async () => {
    const resposta = await dela.post<TokenEmitido>('/api/me/tokens', { name: 'Script de inventário' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.ownerType).toBe('USER');
    // `sw_` no começo: quem vir isso num log sabe de onde é.
    expect(resposta.body.token.startsWith('sw_')).toBe(true);
    expect(resposta.body.token).toContain('.');
    expect(resposta.body.prefix.startsWith('sw_')).toBe(true);

    token = resposta.body.token;
    tokenId = resposta.body.id;
  });

  it('a listagem traz o prefixo e NUNCA o segredo nem o hash', async () => {
    const resposta = await dela.get<TokenNaLista[]>('/api/me/tokens');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(1);
    const linha = resposta.body[0];
    expect(linha.prefix).toBeTruthy();
    expect(Object.hasOwn(linha, 'token')).toBe(false);
    expect(Object.hasOwn(linha, 'tokenHash')).toBe(false);
    // E a varredura: o segredo não está em NENHUM campo do corpo, com outro nome.
    expect(JSON.stringify(resposta.body)).not.toContain(token.split('.')[1]);
  });

  it('o que foi gravado é o SHA-256, não o segredo', async () => {
    const linha = await prisma.apiToken.findUniqueOrThrow({
      where: { id: tokenId },
      select: { tokenHash: true, userId: true, ownerType: true },
    });

    expect(linha.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(linha.userId).toBe(userId);
    expect(linha.ownerType).toBe('USER');
  });
});

describe('o token autentica — e só até onde a pessoa alcança', () => {
  it('entra sem cookie nenhum, e `/api/auth/me` devolve a PESSOA', async () => {
    const resposta = await comToken(token).get<{ id: string; permissions: string[] }>('/api/auth/me');

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe(userId);
    // As permissões vêm da MESMA consulta de sessão do caminho do cookie: um
    // token não é atalho para escapar da autorização.
    expect(resposta.body.permissions).toEqual(['assets.view']);
  });

  it('alcança o que a chave da pessoa abre', async () => {
    const resposta = await comToken(token).get('/api/assets');
    expect(resposta.status).toBe(200);
  });

  it('e leva 403 no que ela não alcança', async () => {
    const resposta = await comToken(token).get('/api/licenses');
    expect(resposta.status).toBe(403);
  });

  it('carimba o `lastUsedAt` — que é como se vê um token esquecido em uso', async () => {
    await comToken(token).get('/api/auth/me');

    // A escrita é FORA do caminho de resposta (sem `await` no use-case), então
    // pode chegar depois do corpo. Espera ativa curta em vez de `sleep` fixo.
    let carimbado: Date | null = null;
    for (let tentativa = 0; tentativa < 20 && !carimbado; tentativa += 1) {
      const linha = await prisma.apiToken.findUniqueOrThrow({
        where: { id: tokenId }, select: { lastUsedAt: true },
      });
      carimbado = linha.lastUsedAt;
      if (!carimbado) await new Promise((pronto) => setTimeout(pronto, 25));
    }

    expect(carimbado).not.toBeNull();
  });

  it('token inexistente, mal formado ou de outro formato é 401', async () => {
    for (const bruto of ['sw_naoexiste.segredo', 'sem-marca.segredo', 'sw_semponto', token.split('.')[0]]) {
      const resposta = await comToken(bruto).get('/api/auth/me');
      expect(resposta.status).toBe(401);
    }
  });

  it('o cabeçalho GANHA do cookie quando os dois vêm juntos', async () => {
    // O navegador de quem está logado manda o cookie em TODA requisição. Se o
    // cookie ganhasse, um script rodando de dentro do painel autenticaria pela
    // sessão do operador — com as permissões DELE — e o `lastUsedAt` do token
    // nunca andaria.
    const resposta = await api.get<{ id: string }>('/api/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(resposta.status).toBe(200);
    expect(resposta.body.id).toBe(userId);
    expect(resposta.body.id).not.toBe(api.adminId);
  });
});

describe('o que o token NÃO pode fazer', () => {
  it('não emite outro token', async () => {
    const resposta = await comToken(token).post<{ error: string }>('/api/me/tokens', { name: 'Filhote' });

    // 403 e não 401: a credencial é válida; o que ela não é é suficiente. Um token
    // que emite tokens é um token que não se revoga.
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toMatch(/sessão do painel/i);
  });

  it('não revoga a si mesmo pela rota (quem revoga é a sessão)', async () => {
    const resposta = await comToken(token).post(`/api/me/tokens/${tokenId}/revoke`);
    expect(resposta.status).toBe(403);
  });

  it('não cadastra nem desliga o segundo fator', async () => {
    expect((await comToken(token).post('/api/auth/totp/enroll')).status).toBe(403);
    expect((await comToken(token).post('/api/auth/totp/disable', { codigo: '000000' })).status).toBe(403);
  });

  it('não troca senha de ninguém — nem a própria', async () => {
    const resposta = await comToken(token).post(`/api/users/${userId}/set-password`, {
      password: 'Outra-Senha-Bem-Longa-1',
    });
    expect(resposta.status).toBe(403);
  });
});

describe('o escopo do dono', () => {
  it('a listagem de uma pessoa não mostra o token da outra', async () => {
    const outra = await doOutro.get<TokenNaLista[]>('/api/me/tokens');
    expect(outra.status).toBe(200);
    expect(outra.body).toHaveLength(0);
  });

  it('revogar o token de outra pessoa é 404 — não 403', async () => {
    const resposta = await doOutro.post<{ error: string }>(`/api/me/tokens/${tokenId}/revoke`);

    // 404 de propósito: um 403 confirmaria que aquele id existe. "Não é seu" e
    // "não existe" dão a mesma resposta.
    expect(resposta.status).toBe(404);

    // E o token continua VÁLIDO: a tentativa não pode ter efeito nenhum.
    const linha = await prisma.apiToken.findUniqueOrThrow({
      where: { id: tokenId }, select: { revokedAt: true },
    });
    expect(linha.revokedAt).toBeNull();
  });

  it('a lista de tokens de AGENTE não mistura token pessoal', async () => {
    const agentes = await api.get<TokenNaLista[]>('/api/agent-tokens');
    expect(agentes.status).toBe(200);
    expect(agentes.body.every((linha) => linha.ownerType === 'AGENT')).toBe(true);
    expect(agentes.body.some((linha) => linha.id === tokenId)).toBe(false);
  });

  it('o token pessoal NÃO autentica no caminho do agente', async () => {
    // O `authenticateApiToken` recebe o `ownerType` esperado por parâmetro, e o
    // `/agent-hub` pede `AGENT`. Sem essa conferência, um token pessoal abriria o
    // hub da frota — que é onde se manda comando para máquina.
    const resposta = await api.anonimo.get('/agent-hub', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
  });
});

describe('revogar', () => {
  it('a sessão da dona revoga, e o token para de autenticar na requisição seguinte', async () => {
    const revogado = await dela.post<TokenNaLista>(`/api/me/tokens/${tokenId}/revoke`);
    expect(revogado.status).toBe(200);
    expect(revogado.body.revokedAt).toBeTruthy();

    const depois = await comToken(token).get('/api/auth/me');
    expect(depois.status).toBe(401);
  });

  it('revogar duas vezes é 409', async () => {
    const resposta = await dela.post(`/api/me/tokens/${tokenId}/revoke`);
    expect(resposta.status).toBe(409);
  });

  it('a linha CONTINUA na lista, com a data — revogar não apaga', async () => {
    const lista = await dela.get<TokenNaLista[]>('/api/me/tokens');

    const linha = lista.body.find((t) => t.id === tokenId);
    expect(linha).toBeDefined();
    expect(linha!.revokedAt).toBeTruthy();
    // É o que mantém respondível "este token foi usado DEPOIS de vazar?" — um
    // `DELETE` levaria o `lastUsedAt` junto.
    expect(Object.hasOwn(linha!, 'lastUsedAt')).toBe(true);
  });
});
