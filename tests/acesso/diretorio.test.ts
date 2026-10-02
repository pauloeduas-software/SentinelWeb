import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { buildApp } from '../../server/app';
import { criarApi, type ApiDeTeste, type Cliente } from '../helpers/app';
import { criarColaborador } from '../helpers/fixtures';

// O DIRETÓRIO E O SSO, pela API (F11, Etapa I — D78).
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE DÁ PARA PROVAR SEM UM CONTROLADOR DE DOMÍNIO E SEM UM PROVEDOR DE
// IDENTIDADE — e é mais do que parece.
//
// A suíte roda sem `LDAP_URL` e sem `OIDC_ISSUER`, que é o estado de toda
// instalação que não usa diretório. Então o que este arquivo prova é o
// comportamento do DESLIGADO (que é o padrão e tem de ser seguro) mais tudo que
// não depende de rede:
//
//   - as rotas do SSO NEM EXISTEM sem configuração (404, não 500);
//   - a sincronização recusa com 409 em vez de estourar;
//   - o vínculo explícito (`PUT /api/users/:id/auth-source`) com as suas regras;
//   - a chave que ele exige, que é `access.manage` e não `users.edit`.
//
// A tradução do que o diretório devolve está em `diretorio.puro.test.ts`.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
/** Edita pessoas, mas NÃO administra acesso — é com ela que se prova a chave. */
let semAcesso: Cliente;
let userId = '';

beforeAll(async () => {
  api = await criarApi();
  userId = await criarColaborador(api, {
    name: 'Pessoa do Diretório', email: 'pessoa.diretorio@teste.local',
  });
  semAcesso = await api.comoUsuario(['users.view', 'users.edit']);
});

afterAll(async () => { await api.fechar(); });

describe('o que está ligado neste servidor', () => {
  it('a leitura é PÚBLICA e devolve dois booleanos', async () => {
    // Pública porque quem a lê é a TELA DE LOGIN, que roda sem sessão e precisa
    // saber se desenha o botão de entrada única.
    const resposta = await api.anonimo.get<{ ldap: boolean; oidc: boolean }>('/api/access/directory');

    expect(resposta.status).toBe(200);
    // Na suíte não há configuração: os dois false. É o padrão de toda instalação.
    expect(resposta.body).toEqual({ ldap: false, oidc: false });
  });

  it('não revela endpoint, DN nem client id', async () => {
    const resposta = await api.get<Record<string, unknown>>('/api/access/directory');

    // DUAS CHAVES, e nada mais. Um `issuer` ou um `baseDN` aqui seria dado de
    // infraestrutura numa rota pública.
    expect(Object.keys(resposta.body).sort()).toEqual(['ldap', 'oidc']);
  });
});

describe('as rotas do SSO não existem sem configuração', () => {
  it('`/api/auth/oidc/start` responde 404', async () => {
    const resposta = await api.anonimo.get('/api/auth/oidc/start');

    // 404 E NÃO 500: o maestro só registra as duas rotas quando `OIDC_ISSUER`
    // existe. Uma rota pública que existe sem provedor configurado é superfície de
    // ataque que responde erro — e esta fase evita rota pública acima de tudo.
    expect(resposta.status).toBe(404);
  });

  it('`/api/auth/oidc/callback` também', async () => {
    expect((await api.anonimo.get('/api/auth/oidc/callback?code=x&state=y')).status).toBe(404);
  });
});

describe('com `OIDC_ISSUER` configurado, as rotas NASCEM', () => {
  it('monta uma aplicação com SSO ligado e as duas rotas existem', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // ESTE TESTE MONTA UMA SEGUNDA APLICAÇÃO, com `OIDC_*` no ambiente — e é o
    // único jeito de exercitar o OUTRO lado do `if` do maestro sem um provedor de
    // identidade de verdade.
    //
    // O que ele prova é o REGISTRO, não o fluxo: a configuração é lida quando a
    // rota nasce, e a descoberta (`/.well-known`) só acontece na primeira
    // requisição. Então um issuer falso basta — e trocar o ambiente de volta no
    // `finally` é obrigatório, porque o processo do vitest é um só e o arquivo
    // seguinte herdaria um SSO configurado contra um endereço que não existe.
    // ═════════════════════════════════════════════════════════════════════════
    const anterior = {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      secret: process.env.OIDC_CLIENT_SECRET,
      redirect: process.env.OIDC_REDIRECT_URI,
    };

    process.env.OIDC_ISSUER = 'https://login.exemplo.invalido/tenant/v2.0';
    process.env.OIDC_CLIENT_ID = 'cliente-de-teste';
    process.env.OIDC_CLIENT_SECRET = 'segredo-de-teste';
    process.env.OIDC_REDIRECT_URI = 'http://localhost:3001/api/auth/oidc/callback';

    const comSso = await buildApp();
    try {
      expect(comSso.hasRoute({ method: 'GET', url: '/api/auth/oidc/start' })).toBe(true);
      expect(comSso.hasRoute({ method: 'GET', url: '/api/auth/oidc/callback' })).toBe(true);

      // E a resposta de status muda junto: é ela que faz a tela de login desenhar
      // o botão de entrada única.
      const resposta = await comSso.inject({ method: 'GET', url: '/api/access/directory' });
      expect(JSON.parse(resposta.body)).toEqual({ ldap: false, oidc: true });
    } finally {
      await comSso.close();
      process.env.OIDC_ISSUER = anterior.issuer;
      process.env.OIDC_CLIENT_ID = anterior.clientId;
      process.env.OIDC_CLIENT_SECRET = anterior.secret;
      process.env.OIDC_REDIRECT_URI = anterior.redirect;
    }
  });

  it('e sem configuração a aplicação principal continua sem elas', () => {
    // A guarda do "trocar de volta" acima: se o `finally` falhar, este teste fica
    // vermelho — e é melhor descobrir aqui do que num arquivo que não fala de SSO.
    expect(api.app.hasRoute({ method: 'GET', url: '/api/auth/oidc/start' })).toBe(false);
  });
});

describe('a sincronização sem diretório configurado', () => {
  it('responde 409 com o que fazer — não 500', async () => {
    const resposta = await api.post<{ error: string }>('/api/access/directory/sync');

    expect(resposta.status).toBe(409);
    // A mensagem nomeia as variáveis: quem clicou no botão precisa saber o que
    // falta, e o log do servidor não está ao alcance dele.
    expect(resposta.body.error).toMatch(/LDAP_URL/);
  });

  it('exige `settings.manage`', async () => {
    // A mesma chave do `POST /api/alerts/run`: disparar job à mão é operação de
    // sistema. Quem só edita cadastro não dispara sincronização que escreve em
    // `users` a partir de uma fonte externa.
    expect((await semAcesso.post('/api/access/directory/sync')).status).toBe(403);
  });
});

describe('o vínculo explícito — `PUT /api/users/:id/auth-source`', () => {
  it('toda pessoa nasce LOCAL', async () => {
    const ficha = await api.get<{ authSource: string; directoryMissingAt: string | null }>(
      `/api/users/${userId}`,
    );

    expect(ficha.status).toBe(200);
    // É o que mantém o comportamento de hoje depois da migração: ninguém entra por
    // SSO antes de alguém marcar a conta.
    expect(ficha.body.authSource).toBe('LOCAL');
    expect(ficha.body.directoryMissingAt).toBeNull();
  });

  it('exige `access.manage`, e NÃO `users.edit`', async () => {
    // Marcar uma conta como federada CONCEDE um caminho de login: quem autenticar
    // aquele e-mail no provedor entra como a pessoa, com os grupos dela. Com
    // `users.edit`, quem pudesse corrigir um telefone federaria a conta do
    // administrador.
    const resposta = await semAcesso.put<{ error: string }>(
      `/api/users/${userId}/auth-source`,
      { authSource: 'OIDC' },
    );

    expect(resposta.status).toBe(403);
    // A frase do 403 nomeia a chave que falta — é o que manda o administrador para
    // a tela de grupos em vez de para o log.
    expect(resposta.body.error).toMatch(/grupos|permiss/i);
  });

  it('muda para OIDC e registra o DE→PARA no histórico', async () => {
    const resposta = await api.put<{ authSource: string }>(
      `/api/users/${userId}/auth-source`,
      { authSource: 'OIDC' },
    );

    expect(resposta.status).toBe(200);
    expect(resposta.body.authSource).toBe('OIDC');

    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityType: 'User', entityId: userId, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { changes: true, actorId: true },
    });

    // O DE→PARA é a pergunta de auditoria: "quem federou esta conta, e quando?".
    expect(log.changes).toMatchObject({ authSource: { de: 'LOCAL', para: 'OIDC' } });
    expect(log.actorId).toBe(api.adminId);
  });

  it('repetir o mesmo valor é 409 — não 200 silencioso', async () => {
    const resposta = await api.put(`/api/users/${userId}/auth-source`, { authSource: 'OIDC' });

    // A tela que manda isto acha que está mudando algo, e um `ActivityLog` de
    // "mudou de OIDC para OIDC" é ruído numa trilha que existe para ser auditada.
    expect(resposta.status).toBe(409);
  });

  it('valor fora do enum é 422', async () => {
    const resposta = await api.put(`/api/users/${userId}/auth-source`, { authSource: 'SAML' });
    expect(resposta.status).toBe(422);
  });

  it('campo desconhecido é 422 (o `strictObject` da borda)', async () => {
    const resposta = await api.put(`/api/users/${userId}/auth-source`, {
      authSource: 'LDAP', externalId: 'oidc:forjado',
    });

    // ESTA É A ASSERÇÃO QUE IMPORTA: sem o `strictObject`, um `externalId` vindo do
    // cliente seria o caminho para alguém se amarrar ao `oid` de outra pessoa no
    // provedor — e o campo é gravado só pela sincronização e pelo primeiro login.
    expect(resposta.status).toBe(422);
  });

  it('voltar para LOCAL limpa o `externalId` e as marcas do diretório', async () => {
    // Prepara o estado que a sincronização produziria: identificador externo e a
    // marca de ausência. Pelo Prisma porque não há diretório na suíte para
    // produzi-lo — e é o estado, não o caminho, que esta asserção persegue.
    await prisma.user.update({
      where: { id: userId },
      data: {
        externalId: 'guid:abc123',
        directorySyncedAt: new Date(),
        directoryMissingAt: new Date(),
      },
    });

    const resposta = await api.put(`/api/users/${userId}/auth-source`, { authSource: 'LOCAL' });
    expect(resposta.status).toBe(200);

    const linha = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { externalId: true, directorySyncedAt: true, directoryMissingAt: true },
    });

    // AS TRÊS JUNTAS. Deixar o `externalId` gravado manteria a conta casável pelo
    // identificador do provedor — ou seja, o SSO continuaria encontrando-a depois
    // de alguém ter decidido que ela não é federada.
    expect(linha).toEqual({ externalId: null, directorySyncedAt: null, directoryMissingAt: null });
  });

  it('pessoa inexistente é 404', async () => {
    const resposta = await api.put(
      '/api/users/00000000-0000-0000-0000-000000000000/auth-source',
      { authSource: 'OIDC' },
    );
    expect(resposta.status).toBe(404);
  });
});
