import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/core/database/prismaClient';
import {
  ehPermissaoConhecida, PERMISSION_CATALOG, TODAS_AS_PERMISSOES,
} from '../../server/domain/access/helpers/permission-catalog';
import {
  ROTAS_POR_PERMISSAO, exigenciaDaRota,
} from '../../server/domain/access/helpers/route-permissions';
import { unirPermissoes } from '../../server/domain/access/use-cases/effective-permissions.usecase';

// AS INVARIANTES DO ACESSO (F11) — as duas pontas do silêncio que o D76 teme.
//
// ═════════════════════════════════════════════════════════════════════════════
// O RISCO DESTE MODELO É QUE ELE FALHA CALADO, NOS DOIS SENTIDOS.
//
// Chave digitada errada em `groups.permissions` não dá erro nenhum: o
// `preHandler` procura `assets.view`, não encontra `assets.viw`, e a pessoa
// simplesmente não vê ativo. Nada falha, nada loga.
//
// Rota sem exigência declarada é o espelho: ela ficaria aberta a qualquer
// sessão, e também sem erro nenhum. É por isso que o boot derruba o processo
// (D137) — e por isso este arquivo prova a mesma coisa sem precisar subir em
// produção para descobrir.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rotas DECLARADAS que podem legitimamente não estar registradas.
 *
 * São as que nascem atrás de uma variável de ambiente. Declará-las de qualquer
 * forma é o certo: no dia em que alguém ligar a variável em produção, elas
 * nascem protegidas em vez de derrubar o boot — e o custo de uma linha no mapa é
 * zero.
 *
 * ⚠️ ESTA LISTA É CURTA DE PROPÓSITO, e cada entrada precisa de um motivo
 * escrito. Ela é o único jeito de uma declaração morta passar — ou seja, é
 * exatamente por onde um caminho digitado errado escaparia do teste.
 */
const ROTAS_CONDICIONAIS = new Set([
  // `BACKUP_ENABLED` desligado é o padrão, e é como a suíte roda (F10, Etapa A).
  'GET /api/backups',
  'POST /api/backups',
  'POST /api/backups/prune',
  'GET /api/backups/:nome/download',
]);

let api: ApiDeTeste;

beforeAll(async () => { api = await criarApi(); });
afterAll(async () => { await api.fechar(); });

describe('catálogo × mapa de rotas — nenhuma ponta inventa chave', () => {
  it('toda chave exigida por uma rota existe no catálogo', () => {
    const foraDoCatalogo = Object.entries(ROTAS_POR_PERMISSAO)
      .filter(([, exigencia]) => exigencia !== null && !ehPermissaoConhecida(exigencia))
      .map(([rota, exigencia]) => `${rota} → ${exigencia}`);

    // Uma chave aqui que não exista no catálogo não "nega por engano": ela cai
    // no 500 de `exigirPermissao`, que é o certo — mas acontecendo em produção,
    // numa rota, em vez de aqui.
    expect(foraDoCatalogo).toEqual([]);
  });

  it('o mapa não declara rota que não existe', () => {
    // O ESPELHO DA CONFERÊNCIA DO BOOT, e ele pega o que ela não pega.
    //
    // O boot acusa rota registrada SEM declaração. O contrário — declaração sem
    // rota — não derruba nada e é igualmente defeito: uma linha com o caminho
    // digitado errado (`/api/user/:id` por `/api/users/:id`) deixa a declaração
    // MORTA aqui e a rota real sem declaração lá. O boot acusaria a segunda
    // metade sem dizer onde está o erro; este teste nomeia a primeira, que é
    // onde o dedo escorregou.
    //
    // `hasRoute` e NÃO parse de `printRoutes`: aquele devolve texto formatado
    // para humano ler, e depender do formato de uma função de depuração é o
    // mesmo erro que o `permission-guard.ts` evitou usando o hook `onRoute`.
    const orfas = Object.keys(ROTAS_POR_PERMISSAO)
      .filter((chave) => !ROTAS_CONDICIONAIS.has(chave))
      .filter((chave) => {
        const [method, ...resto] = chave.split(' ');
        return !api.app.hasRoute({ method: method as 'GET', url: resto.join(' ') });
      });

    expect(orfas).toEqual([]);
  });

  it('nenhuma rota de API fica sem exigência — é o que o boot confere', () => {
    // A conferência do boot já rodou (o `criarApi` chama `buildApp`, que a
    // executa e LANÇA). Este caso existe para o motivo da falha aparecer como
    // asserção e não como exceção de `beforeAll`, que o vitest reporta sem
    // dizer qual rota.
    const semDeclaracao = [...Object.keys(ROTAS_POR_PERMISSAO)]
      .filter((chave) => exigenciaDaRota(chave.split(' ')[0], chave.split(' ').slice(1).join(' ')) === undefined);
    expect(semDeclaracao).toEqual([]);
  });
});

describe('o grupo gravado × o catálogo do código', () => {
  it('toda chave gravada em algum grupo existe no catálogo', async () => {
    // A TERCEIRA REDE. A primeira é o zod da gravação (422 com o nome da
    // chave); a segunda é o `unirPermissoes`, que descarta o desconhecido. Esta
    // pega a linha que entrou por `psql` — que é como entra a maioria das
    // surpresas num JsonB.
    const grupos = await prisma.group.findMany({ select: { name: true, permissions: true } });

    const invalidas: string[] = [];
    for (const grupo of grupos) {
      for (const chave of Object.keys(grupo.permissions as object)) {
        if (!ehPermissaoConhecida(chave)) invalidas.push(`${grupo.name} → ${chave}`);
      }
    }
    expect(invalidas).toEqual([]);
  });

  it('o grupo Administrador tem EXATAMENTE as chaves do catálogo', async () => {
    // A prova de que o seed e o catálogo não derivaram. O grupo é `isSystem`, e
    // o seed o reescreve a cada execução a partir de `permissoesDeAdministrador()`
    // — se este caso ficar vermelho, é porque o literal da migração ficou para
    // trás e o banco não passou pelo seed.
    const grupo = await prisma.group.findUnique({
      where: { name: 'Administrador' },
      select: { permissions: true, isSystem: true },
    });

    expect(grupo?.isSystem).toBe(true);
    expect(Object.keys(grupo!.permissions as object).sort()).toEqual([...TODAS_AS_PERMISSOES].sort());
  });

  it('o rótulo de toda chave é uma frase, não a própria chave', () => {
    // O rótulo vai para a mensagem do 403 ("Seu acesso não inclui …") e para a
    // caixa de seleção da tela. Uma chave sem rótulo escrito à mão sairia como
    // `assets.viewCost` no meio de uma frase em português.
    for (const chave of TODAS_AS_PERMISSOES) {
      expect(PERMISSION_CATALOG[chave]).not.toBe(chave);
      expect(PERMISSION_CATALOG[chave].length).toBeGreaterThan(3);
    }
  });
});

describe('união de permissões — a regra do D76', () => {
  it('une as chaves de vários grupos', () => {
    const unido = unirPermissoes([
      { permissions: { 'assets.view': true } },
      { permissions: { 'users.view': true, 'assets.view': true } },
    ]);
    expect([...unido].sort()).toEqual(['assets.view', 'users.view']);
  });

  it('`false` NÃO concede — e isso não é `deny`, é ausência', () => {
    // O D76 descartou negação por grupo. `false` existir no JsonB é uma tela
    // gravando o que devia ter removido, e tratá-lo como concessão tornaria
    // "permissão é união" falso.
    const unido = unirPermissoes([{ permissions: { 'assets.view': false } }]);
    expect(unido.has('assets.view')).toBe(false);
  });

  it('`false` num grupo não desfaz `true` em outro', () => {
    const unido = unirPermissoes([
      { permissions: { 'assets.view': true } },
      { permissions: { 'assets.view': false } },
    ]);
    // Se um dia isto virar `false`, alguém implementou `deny` sem decidir por
    // isso — e a ordem dos grupos passaria a importar.
    expect(unido.has('assets.view')).toBe(true);
  });

  it('descarta chave fora do catálogo', () => {
    const unido = unirPermissoes([{ permissions: { 'assets.viw': true, 'nada.aqui': true } }]);
    expect([...unido]).toEqual([]);
  });

  it('não estoura com `permissions` que não é objeto', () => {
    // `Json` não é `Record`: o Postgres aceita `null`, array e número na coluna.
    // `Object.keys(null)` estoura, e um boot que cai porque um grupo tem `null`
    // é pior do que um grupo que não concede nada.
    const unido = unirPermissoes([
      { permissions: null },
      { permissions: [1, 2] },
      { permissions: 3 },
      { permissions: 'assets.view' },
    ]);
    expect([...unido]).toEqual([]);
  });
});

describe('nunca sem administrador', () => {
  it('recusa (409) tirar a última pessoa com access.manage', async () => {
    const resposta = await api.put(`/api/users/${api.adminId}/groups`, { groupIds: [] });

    expect(resposta.status).toBe(409);
    expect(JSON.stringify(resposta.body)).toMatch(/sem nenhum administrador/i);

    // E NÃO APLICOU PELA METADE: a checagem roda depois da escrita, dentro da
    // transação, então o `throw` desfez o `set`. Sem o rollback, o 409 teria
    // trancado o sistema ao mesmo tempo que avisava que não ia trancar.
    const depois = await api.get<{ grupos: { name: string }[] }>(`/api/users/${api.adminId}/permissions`);
    expect(depois.body.grupos.map((g) => g.name)).toContain('Administrador');
  });

  it('recusa (409) apagar o grupo de sistema', async () => {
    const grupo = await prisma.group.findUnique({ where: { name: 'Administrador' }, select: { id: true } });
    const resposta = await api.delete(`/api/groups/${grupo!.id}`);

    expect(resposta.status).toBe(409);
    expect(JSON.stringify(resposta.body)).toMatch(/grupo de sistema/i);
  });

  it('recusa (409) editar as permissões do grupo de sistema', async () => {
    const grupo = await prisma.group.findUnique({ where: { name: 'Administrador' }, select: { id: true } });
    const resposta = await api.put(`/api/groups/${grupo!.id}`, { permissions: ['assets.view'] });

    expect(resposta.status).toBe(409);
    // A mensagem ensina a saída certa: tirar a pessoa do grupo, não enfraquecer
    // o grupo.
    expect(JSON.stringify(resposta.body)).toMatch(/tire a pessoa deste grupo|crie um grupo/i);
  });

  it('DEIXA mexer nos membros do grupo de sistema', async () => {
    // A recusa é das PERMISSÕES e do nome, nunca da composição: entrar e sair
    // do grupo é justamente a forma de conceder e tirar acesso total.
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Segundo Administrador', email: 'segundo.admin@teste.local',
    });
    const grupo = await prisma.group.findUnique({ where: { name: 'Administrador' }, select: { id: true } });

    const resposta = await api.put(`/api/users/${pessoa.body.id}/groups`, { groupIds: [grupo!.id] });
    expect(resposta.status).toBe(200);
  });
});

describe('a porta fechada por padrão', () => {
  it('sessão sem grupo nenhum entra e não alcança nada', async () => {
    const sem = await api.comoUsuario([]);

    // Entrou: `/api/auth/me` é dispensa DECLARADA, e tem que ser — sem ela não
    // há como desenhar nem a tela que explica que a pessoa não tem acesso.
    const eu = await sem.get<{ permissions: string[] }>('/api/auth/me');
    expect(eu.status).toBe(200);
    expect(eu.body.permissions).toEqual([]);

    // E não alcança o resto.
    for (const url of ['/api/assets', '/api/users', '/api/licenses', '/api/groups']) {
      const resposta = await sem.get(url);
      expect(resposta.status, `${url} devia ser 403`).toBe(403);
    }
  });

  it('o 403 NOMEIA a chave que falta', async () => {
    const sem = await api.comoUsuario([]);
    const resposta = await sem.get<{ error: string; permissao?: string }>('/api/assets');

    // O risco do modelo é negar em silêncio (D76). Dizer só "sem permissão"
    // manda a investigação começar pelo `preHandler`; dizendo a chave, a
    // primeira parada é a tela de grupos — que é onde a resposta está.
    //
    // `permissao` na RAIZ do corpo, e não sob `details`: o error-handler
    // ESPALHA os `details` do `AppError` na resposta
    // (`core/errors/error-handler.ts`), e é a forma que todo 4xx do sistema tem.
    expect(resposta.body.permissao).toBe('assets.view');
    // E a frase traz o rótulo em português, não a chave crua.
    expect(resposta.body.error).toMatch(/Ver ativos/);
  });

  it('a chave certa abre, e só ela', async () => {
    const soAtivos = await api.comoUsuario(['assets.view']);

    expect((await soAtivos.get('/api/assets')).status).toBe(200);
    // Ver ativo não deixa CRIAR ativo: as ações são chaves separadas.
    expect((await soAtivos.post('/api/assets', {})).status).toBe(403);
    // Nem ver pessoas.
    expect((await soAtivos.get('/api/users')).status).toBe(403);
  });

  it('a permissão é relida a cada requisição, como o usuário', async () => {
    const pessoa = await api.comoUsuario(['assets.view']);
    expect((await pessoa.get('/api/assets')).status).toBe(200);

    // Tirar o grupo tem efeito na requisição SEGUINTE, sem esperar o token
    // expirar: as permissões saem da releitura de sessão, não do JWT. Se
    // estivessem assinadas dentro do token, revogar acesso dependeria de a
    // pessoa deslogar — e o token vale 8 horas.
    await api.put(`/api/users/${pessoa.userId}/groups`, { groupIds: [] });

    expect((await pessoa.get('/api/assets')).status).toBe(403);
  });
});
