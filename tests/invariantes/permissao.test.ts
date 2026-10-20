import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { prisma } from '../../server/core/database/prismaClient';
import { CARGOS, cargoAlcanca, ehCargo } from '../../server/domain/access/helpers/cargo';
import Fastify, { type HTTPMethods } from 'fastify';
import { registerPermissionGuard } from '../../server/core/http/permission-guard';
import { ROTAS_POR_PERMISSAO } from '../../server/domain/access/helpers/route-permissions';

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
// `Cargo` é um enum de dois valores e o compilador recusa o terceiro.
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

describe('a hierarquia — dois valores, uma comparação', () => {
  it('ADMIN alcança tudo', () => {
    for (const cargo of CARGOS) expect(cargoAlcanca('ADMIN', cargo)).toBe(true);
  });

  it('TECNICO não vira ADMIN por comparação', () => {
    expect(cargoAlcanca('TECNICO', 'TECNICO')).toBe(true);
    expect(cargoAlcanca('TECNICO', 'ADMIN')).toBe(false);
  });

  it('a ordem do array É a hierarquia, e ninguém a inverteu', () => {
    expect([...CARGOS]).toEqual(['TECNICO', 'ADMIN']);
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

  it('rebaixar a si mesmo é 409 — e rebaixar o outro continua podendo', async () => {
    const resposta = await api.put<{ error: string }>(`/api/users/${api.adminId}`, { role: 'TECNICO' });
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/rebaixar a si mesmo/i);
    const depois = await prisma.user.findUniqueOrThrow({ where: { id: api.adminId }, select: { role: true } });
    expect(depois.role).toBe('ADMIN');

    // A mesma regra pelo outro lado: ele também não se rebaixa...
    expect((await outro.put(`/api/users/${outro.userId}`, { role: 'TECNICO' })).status).toBe(409);
    // ...mas rebaixar OUTRA pessoa continua sendo do administrador.
    expect((await api.put(`/api/users/${outro.userId}`, { role: 'TECNICO' })).status).toBe(200);
    expect((await api.put(`/api/users/${outro.userId}`, { role: 'ADMIN' })).status).toBe(200);
  });

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

  it('reenviar o próprio cargo sem mudá-lo passa: o formulário manda todo campo', async () => {
    const resposta = await api.put(`/api/users/${api.adminId}`, { role: 'ADMIN' });
    expect(resposta.status).toBe(200);
  });
});

describe('nunca sem administrador (D148)', () => {
  // Com a regra da própria conta (W), o último administrador não alcança mais a
  // rede sozinho: rebaixar, desativar e excluir a si mesmo são recusados antes.
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
  it('Técnico e Administrador nascem com senha: sem ela é 422', async () => {
    for (const role of ['TECNICO', 'ADMIN']) {
      const resposta = await api.post<{ error: string }>('/api/users', {
        name: `Sem Senha ${role}`, email: `sem.senha.${role.toLowerCase()}@teste.local`, role,
      });
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toMatch(/senha/i);
    }
  });

  it('sem cargo, nasce Técnico — o menor dos dois — e entra com a senha', async () => {
    const email = 'nasce.tecnico@teste.local';
    const resposta = await api.post<{ id: string }>('/api/users', {
      name: 'Nasce Técnico', email, password: 'Senha-Do-Tecnico-1',
    });
    expect(resposta.status).toBe(201);

    const linha = await prisma.user.findUniqueOrThrow({ where: { id: resposta.body.id }, select: { role: true } });
    expect(linha.role).toBe('TECNICO');
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'Senha-Do-Tecnico-1' })).status)
      .toBe(200);
  });

  it('o cargo antigo de quem só recebia equipamento não existe mais: 422', async () => {
    const resposta = await api.post<{ error: string }>('/api/users', {
      name: 'Só Recebe', email: 'so.recebe@teste.local', role: 'USUARIO', password: 'Senha-Qualquer-123',
    });
    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toMatch(/cargo/i);
  });
});

describe('a porta fechada por padrão', () => {
  it('o 403 das rotas NOMEIA o cargo que falta', async () => {
    // Pelo TECNICO numa rota de ADMIN: é a mensagem do guard.
    const tecnico = await api.comoUsuario('TECNICO');
    // `PUT /api/settings/discovery` é de ADMIN (o `GET` é de técnico): a recusa
    // vem do `preHandler`, antes de o corpo ser lido.
    const resposta = await tecnico.put<{ error: string }>('/api/settings/discovery', { ghostDays: 30 });

    expect(resposta.status).toBe(403);
    expect(resposta.body.error).toContain('Administrador');
  });

  it('TECNICO abre o inventário e NÃO abre configuração', async () => {
    const tecnico = await api.comoUsuario('TECNICO');

    expect((await tecnico.get('/api/assets')).status).toBe(200);
    expect((await tecnico.get('/api/licenses')).status).toBe(200);

    // Catálogo: LER é do técnico, MEXER é do administrador.
    expect((await tecnico.get('/api/categories')).status).toBe(200);
    expect((await tecnico.post('/api/categories', { name: 'Nova', type: 'ASSET' })).status).toBe(403);
  });

  it('TECNICO não abre a tela de Usuários, mas escolhe o colaborador da entrega', async () => {
    const tecnico = await api.comoUsuario('TECNICO');

    // A tela inteira é do administrador — leitura inclusive.
    expect((await tecnico.get('/api/users')).status).toBe(403);

    // O seletor de pessoa do checkout é de colaborador, e continua dele: sem
    // isto não há entrega.
    expect((await tecnico.get('/api/people/options')).status).toBe(200);
  });

  it('o cargo é relido a cada requisição, como o usuário', async () => {
    const pessoa = await api.comoUsuario('ADMIN');
    expect((await pessoa.get('/api/users')).status).toBe(200);

    // Rebaixa POR FORA da sessão dela: o cookie continua válido, o cargo não.
    await prisma.user.update({ where: { id: pessoa.userId }, data: { role: 'TECNICO' } });

    // Sem novo login: a releitura por requisição é que decide (o mesmo desenho
    // que faz a exclusão derrubar um token já emitido).
    expect((await pessoa.get('/api/users')).status).toBe(403);
    expect((await pessoa.get('/api/assets')).status).toBe(200);
  });
});
