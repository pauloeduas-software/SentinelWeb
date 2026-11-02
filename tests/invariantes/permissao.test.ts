import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarLicenca, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';
import { CARGOS, cargoAlcanca, ehCargo } from '../../server/modules/access/helpers/cargo';
import Fastify, { type HTTPMethods } from 'fastify';
import { registerPermissionGuard } from '../../server/infra/http/permission-guard';
import { ROTAS_POR_PERMISSAO } from '../../server/modules/access/helpers/route-permissions';
import { exigirPermissao } from '../../server/modules/access/helpers/require-permission';
import type { FastifyRequest } from 'fastify';
import { criarAdministrador } from '../../server/modules/access/cli/criar-administrador.cli';
import { ADMIN_DE_TESTE } from '../setup/database';

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
// O primeiro sentido MORREU com o cargo: não há mais string a digitar errado —
// `Cargo` é um enum fechado e o compilador recusa o que não está nele.
//
// O SEGUNDO CONTINUA INTEIRO, e é por isso que este arquivo não desapareceu com
// os grupos: rota nova sem linha no mapa é rota que qualquer sessão alcança, e
// nada falha. É o que o boot derruba (D137) — e é o que se prova aqui, sem
// precisar subir em produção para descobrir.
//
// E COM TRÊS CARGOS (AV), a outra metade: o cargo logo abaixo do mínimo de cada
// rota leva 403 pela API, numa varredura gerada do próprio mapa — rota nova entra
// sozinha.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;

beforeAll(async () => { api = await criarApi(); });
afterAll(async () => { await api.fechar(); });

describe('o mapa de rotas × a tabela do Fastify (D137)', () => {
  it('toda exigência declarada é um cargo que existe', () => {
    const invalidas = Object.entries(ROTAS_POR_PERMISSAO)
      .filter(([, exigencia]) => exigencia !== null && !ehCargo(exigencia))
      .map(([chave]) => chave);
    expect(invalidas).toEqual([]);
  });

  it('o mapa não declara rota que não existe', () => {
    // O ESPELHO do caso de baixo, e o que ele pega é declaração MORTA: linha que
    // ninguém apagou quando a rota saiu. Ela não abre acesso nenhum — o guard só
    // consulta o mapa a partir de uma rota real —, mas esconde o que o mapa de
    // fato cobre, e é a primeira coisa que mente numa revisão.
    //
    // `hasRoute` E NÃO `printRoutes`: a versão anterior deste caso parseava o
    // texto de `printRoutes({ commonPrefix: false })`, e aquele texto é uma
    // ÁRVORE — as linhas começam com `├──` e cada caminho é relativo ao nó pai.
    // O regex não casava nenhuma linha, o conjunto de rotas registradas saía
    // VAZIO, e `mortas` era o mapa INTEIRO; a asserção que sobrava
    // (`not.toContain('GET /api/groups')`) passava por isso, não por acerto.
    // `hasRoute` pergunta ao roteador, com o padrão exato que o mapa declara.
    const mortas = Object.keys(ROTAS_POR_PERMISSAO).filter((chave) => {
      const [metodo, ...resto] = chave.split(' ');
      return !api.app.hasRoute({ method: metodo as HTTPMethods, url: resto.join(' ') });
    });

    expect(mortas).toEqual([]);
  });

  it('rota registrada fora do mapa derruba a conferência de cobertura', async () => {
    // A CONFERÊNCIA DO BOOT (D137), exercitada pelos dois lados numa instância
    // descartável. Não dá para provar isto na aplicação real: lá ela já rodou
    // dentro do `buildApp()` do `beforeAll` e, se falhasse, o arquivo inteiro
    // morreria antes da primeira asserção. O que se testa aqui é o MECANISMO —
    // mesma função, mesmo objeto que protege o boot.
    const declaradas = new Set(['GET /declarada']);
    const opcoes = {
      exigenciaDaRota: (metodo: string, url: string) =>
        (declaradas.has(`${metodo.toUpperCase()} ${url}`) ? 'ADMIN' : undefined),
      autorizar: () => {},
      rotasPublicas: [],
      foraDaConferencia: [],
      estaticoPublico: false,
    };

    const coberta = Fastify();
    const guardaCoberta = registerPermissionGuard(coberta, opcoes);
    coberta.get('/declarada', async () => 'ok');
    await coberta.ready();
    expect(() => guardaCoberta.verificarCobertura()).not.toThrow();
    await coberta.close();

    const furada = Fastify();
    const guardaFurada = registerPermissionGuard(furada, opcoes);
    furada.get('/declarada', async () => 'ok');
    furada.post('/esquecida', async () => 'ok');
    await furada.ready();
    // A mensagem tem que NOMEAR a rota: é o que faz o erro do boot ser
    // acionável em vez de "alguma coisa não está declarada".
    expect(() => guardaFurada.verificarCobertura()).toThrow(/POST \/esquecida/);
    await furada.close();
  });

  it('em produção, os arquivos do painel ficam fora da conferência; a API esquecida, não', async () => {
    // O que o E2E achou em 2026-10-30: em produção o `@fastify/static` registra
    // uma rota por arquivo do `dist` (`GET /`, `GET /assets/<hash>.js`), mais o
    // catch-all `GET /*` — nenhuma no mapa, e o boot caía. O flag
    // `estaticoPublico` as dispensa pela regra do guard de sessão (GET fora de
    // `/api`), e SÓ elas: a rota de API esquecida continua derrubando.
    const declaradas = new Set(['GET /api/declarada']);
    const opcoes = {
      exigenciaDaRota: (metodo: string, url: string) =>
        (declaradas.has(`${metodo.toUpperCase()} ${url}`) ? 'ADMIN' : undefined),
      autorizar: () => {},
      rotasPublicas: [],
      foraDaConferencia: [],
      estaticoPublico: true,
    };

    const painel = Fastify();
    const guardaDoPainel = registerPermissionGuard(painel, opcoes);
    painel.get('/api/declarada', async () => 'ok');
    painel.get('/', async () => 'index');
    painel.get('/assets/index-abc123.js', async () => 'js');
    painel.get('/*', async () => 'index');
    await painel.ready();
    expect(() => guardaDoPainel.verificarCobertura()).not.toThrow();
    // E em tempo de requisição: o asset responde, sem cair no "não declarada" —
    // também no `HEAD`, que o Fastify cria junto com todo `GET`.
    const asset = await painel.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(asset.statusCode).toBe(200);
    const cabecalho = await painel.inject({ method: 'HEAD', url: '/assets/index-abc123.js' });
    expect(cabecalho.statusCode).toBe(200);
    await painel.close();

    const furada = Fastify();
    const guardaFurada = registerPermissionGuard(furada, opcoes);
    furada.get('/*', async () => 'index');
    furada.get('/api/esquecida', async () => 'ok');
    await furada.ready();
    expect(() => guardaFurada.verificarCobertura()).toThrow(/GET \/api\/esquecida/);
    await furada.close();
  });
});

describe('a hierarquia — Técnico < Supervisor < Administrador (AV)', () => {
  it('a ordem é a do enum', () => {
    expect([...CARGOS]).toEqual(['TECNICO', 'SUPERVISOR', 'ADMIN']);
    expect(ehCargo('INEXISTENTE')).toBe(false);
  });

  it('o maior alcança o menor, e nunca o contrário', () => {
    for (const cargo of CARGOS) expect(cargoAlcanca('ADMIN', cargo)).toBe(true);
    expect(cargoAlcanca('SUPERVISOR', 'TECNICO')).toBe(true);
    expect(cargoAlcanca('SUPERVISOR', 'ADMIN')).toBe(false);
    expect(cargoAlcanca('TECNICO', 'SUPERVISOR')).toBe(false);
  });
});

describe('o cargo abaixo do mínimo leva 403, rota por rota (AV)', () => {
  // UMA SESSÃO POR CARGO, e cada rota do mapa pedida pelo cargo logo abaixo do
  // mínimo dela. O guard roda antes do handler, então o id inventado e o corpo
  // vazio não chegam a ser lidos: o que volta é a recusa do cargo, e nada além.
  const ID = '00000000-0000-4000-8000-000000000000';
  const sessoes = new Map<string, Awaited<ReturnType<ApiDeTeste['comoUsuario']>>>();

  beforeAll(async () => {
    sessoes.set('TECNICO', await api.comoUsuario('TECNICO'));
    sessoes.set('SUPERVISOR', await api.comoUsuario('SUPERVISOR'));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [...sessoes.values()].map((s) => s.userId) } } });
  });

  it('nenhuma rota abre para quem está abaixo do cargo dela', async () => {
    const abertas: string[] = [];
    for (const [chave, exigencia] of Object.entries(ROTAS_POR_PERMISSAO)) {
      if (exigencia === null || exigencia === 'TECNICO') continue;
      const abaixo = CARGOS[CARGOS.indexOf(exigencia) - 1];
      const [metodo, ...resto] = chave.split(' ');
      const url = resto.join(' ').replace(/:[A-Za-z]+/g, ID);
      const cliente = sessoes.get(abaixo)!;
      const resposta = metodo === 'GET' ? await cliente.get(url)
        : metodo === 'POST' ? await cliente.post(url, {})
        : metodo === 'PUT' ? await cliente.put(url, {})
        : metodo === 'PATCH' ? await cliente.patch(url, {})
        : await cliente.delete(url);
      // A FRASE, e não só o 403: outra recusa (a origem das rotas de credencial,
      // a troca de senha pendente) também é 403, e esconderia um cargo baixado
      // por engano.
      const recusa = (resposta.body as { error?: string } | undefined)?.error ?? '';
      if (resposta.status !== 403 || !/exige o cargo de/.test(recusa)) {
        abertas.push(`${chave} (${abaixo}: ${resposta.status} ${recusa})`);
      }
    }
    expect(abertas).toEqual([]);
  });

  it('o Técnico alcança o que é dele', async () => {
    const tecnico = sessoes.get('TECNICO')!;
    for (const url of ['/api/assets', '/api/stock/items', '/api/licenses', '/api/people', '/api/workstations', '/api/endpoints', '/api/categories/options']) {
      expect((await tecnico.get(url)).status, url).toBe(200);
    }
  });

  it('a lixeira, pela listagem, é do Supervisor', async () => {
    for (const url of ['/api/assets?view=trashed', '/api/people?view=trashed']) {
      expect((await sessoes.get('TECNICO')!.get(url)).status, url).toBe(403);
      expect((await sessoes.get('SUPERVISOR')!.get(url)).status, url).toBe(200);
    }
  });

  it('desativar vai pela edição, e só o Supervisor desativa', async () => {
    const tecnico = sessoes.get('TECNICO')!;
    const supervisor = sessoes.get('SUPERVISOR')!;
    const pessoa = await api.post<{ id: string }>('/api/people', { name: 'Quem Sai' });
    expect(pessoa.status).toBe(201);

    const recusada = await tecnico.put<{ error: string }>(`/api/people/${pessoa.body.id}`, { isActive: false });
    expect(recusada.status).toBe(403);
    expect(recusada.body.error).toMatch(/Supervisor ou acima/);
    expect((await tecnico.put(`/api/people/${pessoa.body.id}`, { name: 'Quem Fica', email: null, notes: null })).status).toBe(200);
    expect((await supervisor.put(`/api/people/${pessoa.body.id}`, { isActive: false })).status).toBe(200);
  });
});

describe('ninguém tira a si mesmo do jogo (W)', () => {
  // O cliente padrão da suíte É o administrador do `.env`, e o seed garante que
  // ele é o único administrador num banco de teste limpo. Cada caso põe um
  // segundo administrador: com dois, a rede do último deixaria passar, e quem
  // recusa é a regra da própria conta.
  let outro: Awaited<ReturnType<ApiDeTeste['comoUsuario']>>;

  beforeAll(async () => { outro = await api.comoUsuario('ADMIN'); });
  // Volta a um administrador só, como os casos seguintes esperam.
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: outro.userId } }); });

  it('desativar a si mesmo é 409', async () => {
    const resposta = await api.put<{ error: string }>(`/api/users/${api.adminId}`, { isActive: false });
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/desativar a si mesmo/i);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: api.adminId }, select: { isActive: true } });
    expect(depois.isActive).toBe(true);
  });

  it('excluir a si mesmo é 409', async () => {
    const resposta = await api.delete<{ error: string }>(`/api/users/${api.adminId}`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/excluir a si mesmo/i);
    expect(await prisma.user.findUnique({ where: { id: api.adminId } })).not.toBeNull();
  });

  it('reenviar o próprio cargo sem mudá-lo passa', async () => {
    const resposta = await api.put(`/api/users/${api.adminId}`, { role: 'ADMIN' });
    expect(resposta.status).toBe(200);
  });
});

describe('nunca sem administrador (D148)', () => {
  // Com a regra da própria conta (W), o último administrador não alcança mais a
  // rede sozinho: desativar e excluir a si mesmo são recusados antes.
  // O caminho que sobra é a CORRIDA — dois administradores tirando um ao outro
  // no mesmo instante, cada um contando "sobra eu".
  it('dois administradores desativando um ao outro ao mesmo tempo: sobra um', async () => {
    const outro = await api.comoUsuario('ADMIN');
    expect(await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })).toBe(2);

    // SEM `await` entre as duas (ver `tests/corridas/posse.test.ts`). A
    // perdedora volta 409 — a rede, depois da fila do `travarAdministracao` —
    // ou 401, se a sessão dela já caiu antes de entrar.
    const respostas = await Promise.all([
      api.put(`/api/users/${outro.userId}`, { isActive: false }),
      outro.put(`/api/users/${api.adminId}`, { isActive: false }),
    ]);
    expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })).toBe(1);

    // Repõe: o administrador da suíte ativo, o outro fora.
    await prisma.user.update({ where: { id: api.adminId }, data: { isActive: true } });
    await prisma.user.delete({ where: { id: outro.userId } });
  });
});

describe('o cargo no cadastro', () => {
  it('sem cargo, nasce Técnico — o de menor acesso (AV) — e entra com a temporária', async () => {
    const email = 'nasce.tecnico@teste.local';
    const resposta = await api.post<{ id: string; temporaryPassword: string }>('/api/users', {
      name: 'Nasce Técnico', email,
    });
    expect(resposta.status).toBe(201);

    const linha = await prisma.user.findUniqueOrThrow({ where: { id: resposta.body.id }, select: { role: true } });
    expect(linha.role).toBe('TECNICO');
    expect((await api.anonimo.post('/api/auth/login', { email, password: resposta.body.temporaryPassword })).status)
      .toBe(200);
  });

  it('cargo que não existe é 422, no cadastro e na edição', async () => {
    const resposta = await api.post<{ error: string }>('/api/users', {
      name: 'Cargo Inexistente', email: 'cargo.inexistente@teste.local', role: 'INEXISTENTE',
    });
    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toMatch(/cargo/i);
    expect((await api.put(`/api/users/${api.adminId}`, { role: 'INEXISTENTE' })).status).toBe(422);
  });
});

describe('o comando que cria administrador (AP)', () => {
  it('cria a conta como Administrador, e ela entra com a senha', async () => {
    const email = 'pelo.terminal@teste.local';
    const conta = await criarAdministrador({ nome: 'Pelo Terminal', email, senha: 'Senha-Do-Terminal-12' });

    const linha = await prisma.user.findUniqueOrThrow({ where: { id: conta.id }, select: { role: true, isActive: true } });
    expect(linha).toEqual({ role: 'ADMIN', isActive: true });
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'Senha-Do-Terminal-12' })).status)
      .toBe(200);
  });

  it('cria mesmo com administrador no sistema: é a saída de quem perdeu a senha', async () => {
    expect(await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })).toBeGreaterThan(0);
    await expect(criarAdministrador({ nome: 'Socorro', email: 'socorro@teste.local', senha: 'Senha-Do-Socorro-12' }))
      .resolves.toMatchObject({ email: 'socorro@teste.local' });
  });

  it('as regras são as do cadastro: e-mail em uso e senha curta são recusados', async () => {
    await expect(criarAdministrador({ nome: 'Repetido', email: ADMIN_DE_TESTE.email, senha: 'Senha-Repetida-12' }))
      .rejects.toThrow('E-mail já está em uso.');
    await expect(criarAdministrador({ nome: 'Curta', email: 'curta@teste.local', senha: 'curta' }))
      .rejects.toThrow(/12/);
    expect(await prisma.user.findUnique({ where: { email: 'curta@teste.local' } })).toBeNull();
  });
});

describe('a porta fechada por padrão', () => {
  it('o 403 NOMEIA o cargo que falta', async () => {
    const semCargo = {} as FastifyRequest;
    expect(() => exigirPermissao(semCargo, 'ADMIN')).toThrow(/cargo de Administrador\./);

    const supervisor = await api.comoUsuario('SUPERVISOR');
    const resposta = await supervisor.get<{ error: string }>('/api/users');
    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toMatch(/cargo de Administrador\./);
    await prisma.user.delete({ where: { id: supervisor.userId } });
  });

  it('o custo, do computador e da licença, só sai para o Supervisor (D77)', async () => {
    const seed = await idsDoSeed();
    const modelId = await criarModelo(api, {
      categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api, 'Fabricante do Custo'),
    });
    const tecnico = await api.comoUsuario('TECNICO');
    const supervisor = await api.comoUsuario('SUPERVISOR');

    // O Técnico cadastra, e o valor que ele manda é descartado: quem não vê o
    // custo não o escreve.
    const doTecnico = await tecnico.post<{ id: string }>('/api/assets', {
      statusId: seed.statusDeployableId, modelId, purchaseCost: '1.00',
    });
    expect(doTecnico.status).toBe(201);
    const gravado = await prisma.asset.findUniqueOrThrow({ where: { id: doTecnico.body.id }, select: { purchaseCost: true } });
    expect(gravado.purchaseCost).toBeNull();

    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId });
    await prisma.asset.update({ where: { id: ativo.id }, data: { purchaseCost: 4200 } });
    expect((await tecnico.get<Record<string, unknown>>(`/api/assets/${ativo.id}`)).body).not.toHaveProperty('purchaseCost');
    expect(Number((await supervisor.get<{ purchaseCost: unknown }>(`/api/assets/${ativo.id}`)).body.purchaseCost)).toBe(4200);

    // A licença também é dinheiro: a listagem e o detalhe não leem o custo para o Técnico.
    const licenca = await criarLicenca(api, { name: 'Licença do Custo', categoryId: seed.categoriaLicencaId, seatsTotal: 2 });
    await prisma.license.update({ where: { id: licenca.id }, data: { purchaseCost: 900 } });
    expect((await tecnico.get<Record<string, unknown>>(`/api/licenses/${licenca.id}`)).body).not.toHaveProperty('purchaseCost');
    const listaDoTecnico = await tecnico.get<{ rows: Record<string, unknown>[] }>('/api/licenses');
    expect(listaDoTecnico.body.rows.length).toBeGreaterThan(0);
    for (const linha of listaDoTecnico.body.rows) expect(linha).not.toHaveProperty('purchaseCost');
    expect(Number((await supervisor.get<{ purchaseCost: unknown }>(`/api/licenses/${licenca.id}`)).body.purchaseCost)).toBe(900);

    await prisma.user.deleteMany({ where: { id: { in: [tecnico.userId, supervisor.userId] } } });
  });

  it('o cargo é relido a cada requisição: desativado por fora, a sessão cai', async () => {
    const pessoa = await api.comoUsuario('ADMIN');
    expect((await pessoa.get('/api/users')).status).toBe(200);

    // POR FORA da sessão dela: o cookie continua válido, a conta não. Sem novo
    // login, a releitura por requisição é que decide.
    await prisma.user.update({ where: { id: pessoa.userId }, data: { isActive: false } });
    expect((await pessoa.get('/api/assets')).status).toBe(401);

    await prisma.user.delete({ where: { id: pessoa.userId } });
  });
});
