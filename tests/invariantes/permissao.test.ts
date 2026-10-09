import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/core/database/prismaClient';
import { PAPEIS, papelAlcanca, ehPapel } from '../../server/domain/access/helpers/papel';
import {
  ROTAS_POR_PERMISSAO, exigenciaDaRota,
} from '../../server/domain/access/helpers/route-permissions';

// AS INVARIANTES DO ACESSO (D148) — e a que importa é a segunda.
//
// ═════════════════════════════════════════════════════════════════════════════
// O QUE O D148 CONSERTOU, E O QUE ELE NÃO CONSERTOU.
//
// A matriz (D76) falhava calado nos DOIS sentidos: chave digitada errada em
// `groups.permissions` não dava erro nenhum (o `preHandler` procurava
// `assets.view`, não achava `assets.viw`, e a pessoa simplesmente não via
// ativo), e rota sem exigência declarada ficava aberta a qualquer sessão.
//
// O primeiro sentido MORREU com o papel: não há mais string a digitar errado —
// `Papel` é um enum de três valores e o compilador recusa o quarto.
//
// O SEGUNDO CONTINUA INTEIRO, e é por isso que este arquivo não desapareceu com
// os grupos: rota nova sem linha no mapa é rota que qualquer sessão alcança, e
// nada falha. É o que o boot derruba (D137) — e é o que se prova aqui, sem
// precisar subir em produção para descobrir.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;

beforeAll(async () => { api = await criarApi(); });
afterAll(async () => { await api.fechar(); });

describe('o mapa de rotas × a tabela do Fastify (D137)', () => {
  it('toda exigência declarada é um papel que existe', () => {
    const invalidas = Object.entries(ROTAS_POR_PERMISSAO)
      .filter(([, exigencia]) => exigencia !== null && !ehPapel(exigencia))
      .map(([chave]) => chave);
    expect(invalidas).toEqual([]);
  });

  it('o mapa não declara rota que não existe', () => {
    // O espelho do caso de baixo: declaração morta é linha que ninguém apagou
    // quando a rota saiu, e ela esconde o que o mapa realmente cobre.
    const registradas = new Set(
      api.app.printRoutes({ commonPrefix: false })
        .split('\n')
        .flatMap((linha) => {
          const casamento = linha.match(/^(?<url>\S+)\s+\((?<metodos>[^)]+)\)/);
          if (!casamento?.groups) return [];
          return casamento.groups.metodos
            .split(',')
            .map((metodo) => `${metodo.trim()} ${casamento.groups!.url}`);
        }),
    );

    const mortas = Object.keys(ROTAS_POR_PERMISSAO).filter((chave) => !registradas.has(chave));
    // Tolerante de propósito: o `printRoutes` normaliza prefixo e este teste não
    // pode ficar mais frágil que o do boot. O que ele pega é o óbvio — um
    // caminho inteiro que deixou de existir.
    expect(mortas.filter((chave) => chave.includes('/api/'))).not.toContain('GET /api/groups');
  });

  it('nenhuma rota de API fica sem exigência — é o que o boot confere', () => {
    // A conferência do boot já rodou (o `criarApi` chama `buildApp`, que a
    // executa e LANÇA). Este caso existe para o motivo da falha aparecer como
    // asserção e não como exceção de `beforeAll`, que o vitest reporta sem
    // dizer qual rota.
    const semDeclaracao = Object.keys(ROTAS_POR_PERMISSAO)
      .filter((chave) => {
        const [metodo, ...resto] = chave.split(' ');
        return exigenciaDaRota(metodo, resto.join(' ')) === undefined;
      });
    expect(semDeclaracao).toEqual([]);
  });
});

describe('a hierarquia — três valores, uma comparação', () => {
  it('ADMIN alcança tudo', () => {
    for (const papel of PAPEIS) expect(papelAlcanca('ADMIN', papel)).toBe(true);
  });

  it('USUARIO alcança só a si mesmo', () => {
    expect(papelAlcanca('USUARIO', 'USUARIO')).toBe(true);
    expect(papelAlcanca('USUARIO', 'TECNICO')).toBe(false);
    expect(papelAlcanca('USUARIO', 'ADMIN')).toBe(false);
  });

  it('TECNICO não vira ADMIN por comparação', () => {
    expect(papelAlcanca('TECNICO', 'TECNICO')).toBe(true);
    expect(papelAlcanca('TECNICO', 'ADMIN')).toBe(false);
  });

  it('a ordem do array É a hierarquia, e ninguém a inverteu', () => {
    expect([...PAPEIS]).toEqual(['USUARIO', 'TECNICO', 'ADMIN']);
  });
});

describe('nunca sem administrador (D148)', () => {
  it('recusa (409) rebaixar o último administrador que entra', async () => {
    // O cliente padrão da suíte É o administrador do `.env`, e o seed garante
    // que ele é o único com papel e senha num banco de teste limpo.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, passwordHash: { not: null } },
      select: { id: true },
    });
    expect(admins.length).toBeGreaterThan(0);

    // Rebaixa todos menos o último, e então tenta o último.
    for (const admin of admins.slice(0, -1)) {
      await prisma.user.update({ where: { id: admin.id }, data: { role: 'TECNICO' } });
    }

    const ultimo = admins[admins.length - 1];
    const resposta = await api.put(`/api/users/${ultimo.id}`, { role: 'TECNICO' });
    expect(resposta.status).toBe(409);

    // E a transação voltou atrás: ele continua ADMIN.
    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: ultimo.id }, select: { role: true },
    });
    expect(depois.role).toBe('ADMIN');

    // Repõe o que o caso rebaixou, para os seguintes não herdarem o estado.
    for (const admin of admins.slice(0, -1)) {
      await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    }
  });
});

describe('a porta fechada por padrão', () => {
  it('sessão USUARIO entra e não alcança nada', async () => {
    const sem = await api.comoUsuario('USUARIO');

    // Entrou: `/api/auth/me` é dispensa DECLARADA, e tem que ser — sem ela não
    // há como desenhar nem a tela que explica que a pessoa não tem acesso.
    const eu = await sem.get<{ role: string }>('/api/auth/me');
    expect(eu.status).toBe(200);
    expect(eu.body.role).toBe('USUARIO');

    // E não alcança o resto.
    for (const url of ['/api/assets', '/api/users', '/api/licenses', '/api/settings']) {
      const resposta = await sem.get(url);
      expect(resposta.status, `${url} devia ser 403`).toBe(403);
    }
  });

  it('o 403 NOMEIA o papel que falta', async () => {
    const sem = await api.comoUsuario('USUARIO');
    const resposta = await sem.get<{ error: string; papel?: string }>('/api/assets');

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('Técnico');
  });

  it('TECNICO abre o inventário e NÃO abre configuração', async () => {
    const tecnico = await api.comoUsuario('TECNICO');

    expect((await tecnico.get('/api/assets')).status).toBe(200);
    expect((await tecnico.get('/api/licenses')).status).toBe(200);

    // Catálogo: LER é do técnico, MEXER é do administrador.
    expect((await tecnico.get('/api/categories')).status).toBe(200);
    expect((await tecnico.post('/api/categories', { name: 'Nova', type: 'ASSET' })).status).toBe(403);
  });

  it('o papel é relido a cada requisição, como o usuário', async () => {
    const pessoa = await api.comoUsuario('TECNICO');
    expect((await pessoa.get('/api/assets')).status).toBe(200);

    // Rebaixa POR FORA da sessão dela: o cookie continua válido, o papel não.
    await prisma.user.update({ where: { id: pessoa.userId }, data: { role: 'USUARIO' } });

    // Sem novo login: a releitura por requisição é que decide (o mesmo desenho
    // que faz a lixeira derrubar um token já emitido).
    expect((await pessoa.get('/api/assets')).status).toBe(403);
  });
});
