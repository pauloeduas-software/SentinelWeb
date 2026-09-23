import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// O TOKEN DE API — D80 (uma tabela, dono polimórfico) e D89 (a convivência).
//
// O que esta suíte protege é a parte mais sensível do sistema: a credencial que
// abre o `/agent-hub`. Três garantias, e nenhuma é do tipo que se percebe
// quebrada em produção antes do estrago:
//
//   1. o SEGREDO nunca volta — nem na listagem, nem em lugar nenhum;
//   2. revogar significa alguma coisa — o token para de funcionar na hora;
//   3. o CHECK do banco recusa a linha incoerente que nenhuma tela saberia ler.

interface TokenEmitido {
  id: string;
  name: string;
  prefix: string;
  token: string;
  revokedAt: string | null;
}

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

async function emitir(name: string) {
  const { status, body } = await api.post<TokenEmitido>('/api/agent-tokens', { name });
  expect(status).toBe(201);
  return body;
}

describe('emissão', () => {
  it('devolve o segredo UMA vez, no formato `prefixo.segredo`', async () => {
    const token = await emitir('Notebook da Laura');

    expect(token.token).toMatch(/^sw_[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/);
    expect(token.token.startsWith(token.prefix)).toBe(true);
  });

  it('guarda o HASH, nunca o segredo', async () => {
    const token = await emitir('Token do hash');

    const linha = await prisma.apiToken.findUniqueOrThrow({
      where: { id: token.id },
      select: { tokenHash: true },
    });

    // sha256 em hex. E o segredo NÃO está no banco em lugar nenhum: quem lê o
    // dump não consegue autenticar, que é a razão inteira de haver hash.
    expect(linha.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const segredo = token.token.split('.')[1];
    expect(linha.tokenHash).not.toContain(segredo);
  });

  it('a LISTAGEM nunca devolve o segredo nem o hash', async () => {
    await emitir('Token listado');

    const { status, body } = await api.get<Record<string, unknown>[]>('/api/agent-tokens');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);

    for (const linha of body) {
      expect(linha).not.toHaveProperty('tokenHash');
      expect(linha).not.toHaveProperty('token');
      // O PREFIXO sai: ele é público por construção e é o que identifica a
      // linha na tela sem revelar nada.
      expect(linha).toHaveProperty('prefix');
    }
  });

  it('exige nome — um token anônimo numa lista de trinta ninguém ousa revogar', async () => {
    expect((await api.post('/api/agent-tokens', {})).status).toBe(422);
    expect((await api.post('/api/agent-tokens', { name: '' })).status).toBe(422);
  });

  it('exige sessão', async () => {
    expect((await api.anonimo.post('/api/agent-tokens', { name: 'x' })).status).toBe(401);
    expect((await api.anonimo.get('/api/agent-tokens')).status).toBe(401);
  });
});

describe('o hub aceita o token e recusa o inválido', () => {
  it('conecta com um ApiToken válido', async () => {
    const token = await emitir('Token que conecta');

    const resposta = await api.app.inject({
      method: 'GET',
      url: '/agent-hub',
      headers: {
        authorization: `Bearer ${token.token}`,
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    });

    // 401 é o que o `preHandler` responde quando recusa. Qualquer outra coisa
    // significa que ele deixou passar — o upgrade em si o `inject` não conclui.
    expect(resposta.statusCode).not.toBe(401);
  });

  it('recusa token com a FORMA certa e segredo errado', async () => {
    const token = await emitir('Token adulterado');
    const adulterado = `${token.prefix}.${'A'.repeat(43)}`;

    const resposta = await api.app.inject({
      method: 'GET',
      url: '/agent-hub',
      headers: { authorization: `Bearer ${adulterado}` },
    });
    expect(resposta.statusCode).toBe(401);
  });

  it('recusa prefixo inexistente', async () => {
    const resposta = await api.app.inject({
      method: 'GET',
      url: '/agent-hub',
      headers: { authorization: `Bearer sw_000000000000.${'A'.repeat(43)}` },
    });
    expect(resposta.statusCode).toBe(401);
  });
});

describe('revogação', () => {
  it('revogar tira o acesso NA HORA, e a linha continua na tabela', async () => {
    const token = await emitir('Token a revogar');

    const revogou = await api.post(`/api/agent-tokens/${token.id}/revoke`);
    expect(revogou.status).toBe(200);

    const resposta = await api.app.inject({
      method: 'GET',
      url: '/agent-hub',
      headers: { authorization: `Bearer ${token.token}` },
    });
    expect(resposta.statusCode).toBe(401);

    // NÃO apaga: "qual token esta máquina usava em março?" precisa continuar
    // respondível, e o `lastUsedAt` diria se ele foi usado depois de vazar.
    const linha = await prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
    expect(linha.revokedAt).toBeInstanceOf(Date);
  });

  it('revogar duas vezes responde 409', async () => {
    const token = await emitir('Token revogado duas vezes');
    expect((await api.post(`/api/agent-tokens/${token.id}/revoke`)).status).toBe(200);
    expect((await api.post(`/api/agent-tokens/${token.id}/revoke`)).status).toBe(409);
  });

  it('token inexistente responde 404', async () => {
    const { status } = await api.post('/api/agent-tokens/11111111-1111-4111-8111-111111111111/revoke');
    expect(status).toBe(404);
  });
});

describe('o CHECK de coerência do dono (D80)', () => {
  it('recusa USER com endpointId', async () => {
    // O CHECK mora no BANCO porque o Prisma não o expressa. Sem ele, nada
    // impede um token pessoal amarrado a uma máquina — uma linha que nenhuma
    // das duas telas saberia mostrar e que o caminho de autenticação trataria
    // como válida.
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO "api_tokens" ("id","name","ownerType","userId","endpointId","prefix","tokenHash","createdAt")
        VALUES (gen_random_uuid(), 'incoerente', 'USER', gen_random_uuid(), gen_random_uuid(), 'sw_ffffffffffff', 'x', now())
      `),
    ).rejects.toThrow();
  });

  it('recusa USER sem userId', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO "api_tokens" ("id","name","ownerType","prefix","tokenHash","createdAt")
        VALUES (gen_random_uuid(), 'sem dono', 'USER', 'sw_eeeeeeeeeeee', 'x', now())
      `),
    ).rejects.toThrow();
  });

  it('ACEITA AGENT sem endpointId — é o estado de antes do primeiro handshake', async () => {
    // Não é brecha: o token é gerado quando o agente é INSTALADO, e a máquina
    // só existe no sistema quando ela se apresenta pela primeira vez.
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO "api_tokens" ("id","name","ownerType","prefix","tokenHash","createdAt")
        VALUES (gen_random_uuid(), 'antes do handshake', 'AGENT', 'sw_dddddddddddd', 'x', now())
      `),
    ).resolves.toBe(1);
  });
});
