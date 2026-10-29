import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/core/database/prismaClient';
import { CARGOS, cargoAlcanca, ehCargo } from '../../server/domain/access/helpers/cargo';
import Fastify, { type HTTPMethods } from 'fastify';
import { registerPermissionGuard } from '../../server/core/http/permission-guard';
import { ROTAS_POR_PERMISSAO } from '../../server/domain/access/helpers/route-permissions';
import { exigirPermissao } from '../../server/domain/access/helpers/require-permission';
import type { FastifyRequest } from 'fastify';
import { criarAdministrador } from '../../server/domain/access/cli/criar-administrador.cli';
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
// COM UM CARGO SÓ (Z), não há sessão abaixo de ADMIN para levar 403 pela API:
// a mensagem do 403 é provada direto no `exigirPermissao`.
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
});

describe('a hierarquia — um cargo só (Z)', () => {
  it('ADMIN alcança tudo', () => {
    for (const cargo of CARGOS) expect(cargoAlcanca('ADMIN', cargo)).toBe(true);
  });

  it('o único cargo é ADMIN', () => {
    expect([...CARGOS]).toEqual(['ADMIN']);
    expect(ehCargo('INEXISTENTE')).toBe(false);
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

describe('a senha no cadastro — todo usuário entra', () => {
  it('todo usuário nasce com senha: sem ela é 422', async () => {
    const resposta = await api.post<{ error: string }>('/api/users', {
      name: 'Sem Senha', email: 'sem.senha@teste.local',
    });
    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toMatch(/senha/i);
  });

  it('sem cargo, nasce Administrador — o único (Z) — e entra com a senha', async () => {
    const email = 'nasce.admin@teste.local';
    const resposta = await api.post<{ id: string }>('/api/users', {
      name: 'Nasce Administrador', email, password: 'Senha-Do-Admin-12',
    });
    expect(resposta.status).toBe(201);

    const linha = await prisma.user.findUniqueOrThrow({ where: { id: resposta.body.id }, select: { role: true } });
    expect(linha.role).toBe('ADMIN');
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'Senha-Do-Admin-12' })).status)
      .toBe(200);
  });

  it('cargo que não existe é 422, no cadastro e na edição', async () => {
    const resposta = await api.post<{ error: string }>('/api/users', {
      name: 'Cargo Inexistente', email: 'cargo.inexistente@teste.local', role: 'INEXISTENTE', password: 'Senha-Qualquer-123',
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
  it('o 403 NOMEIA o cargo que falta', () => {
    // Sem sessão abaixo de ADMIN para pedir pela API (Z), a recusa é provada
    // na função que o guard chama: uma requisição sem cargo numa exigência de
    // ADMIN.
    const semCargo = {} as FastifyRequest;
    expect(() => exigirPermissao(semCargo, 'ADMIN')).toThrow(/cargo de Administrador/);
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
