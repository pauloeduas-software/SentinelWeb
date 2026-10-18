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
// `Cargo` é um enum de três valores e o compilador recusa o quarto.
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

describe('a hierarquia — três valores, uma comparação', () => {
  it('ADMIN alcança tudo', () => {
    for (const cargo of CARGOS) expect(cargoAlcanca('ADMIN', cargo)).toBe(true);
  });

  it('USUARIO alcança só a si mesmo', () => {
    expect(cargoAlcanca('USUARIO', 'USUARIO')).toBe(true);
    expect(cargoAlcanca('USUARIO', 'TECNICO')).toBe(false);
    expect(cargoAlcanca('USUARIO', 'ADMIN')).toBe(false);
  });

  it('TECNICO não vira ADMIN por comparação', () => {
    expect(cargoAlcanca('TECNICO', 'TECNICO')).toBe(true);
    expect(cargoAlcanca('TECNICO', 'ADMIN')).toBe(false);
  });

  it('a ordem do array É a hierarquia, e ninguém a inverteu', () => {
    expect([...CARGOS]).toEqual(['USUARIO', 'TECNICO', 'ADMIN']);
  });
});

describe('nunca sem administrador (D148)', () => {
  it('recusa (409) rebaixar o último administrador que entra', async () => {
    // O cliente padrão da suíte É o administrador do `.env`, e o seed garante
    // que ele é o único com cargo e senha num banco de teste limpo.
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

  it('recusa (409) mandar para a lixeira o último administrador — inclusive a si mesmo', async () => {
    // A edição conferia, a exclusão não: o administrador único apagava a si
    // mesmo e o sistema ficava sem ninguém que entrasse.
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, passwordHash: { not: null } },
      select: { id: true },
    });
    expect(admins).toHaveLength(1);

    const resposta = await api.delete<{ error: string }>(`/api/users/${api.adminId}`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.error).toMatch(/sem nenhum administrador/i);

    // A transação voltou atrás: ele continua fora da lixeira.
    const depois = await prisma.user.findUniqueOrThrow({
      where: { id: api.adminId }, select: { deletedAt: true },
    });
    expect(depois.deletedAt).toBeNull();
  });
});

describe('a senha no cadastro — só de quem entra', () => {
  it('Técnico e Administrador nascem com senha: sem ela é 422', async () => {
    for (const role of ['TECNICO', 'ADMIN']) {
      const resposta = await api.post<{ error: string }>('/api/users', {
        name: `Sem Senha ${role}`, email: `sem.senha.${role.toLowerCase()}@teste.local`, role,
      });
      expect(resposta.status).toBe(422);
      expect(resposta.body.error).toMatch(/senha/i);
    }
  });

  it('o colaborador que só recebe equipamento nasce sem senha', async () => {
    const resposta = await api.post('/api/users', {
      name: 'Só Recebe', email: 'so.recebe@teste.local',
    });
    expect(resposta.status).toBe(201);
  });

  it('promover a Técnico quem nunca teve senha exige uma, no mesmo PUT', async () => {
    const email = 'vai.virar.tecnico@teste.local';
    const pessoa = await api.post<{ id: string }>('/api/users', { name: 'Vai Virar Técnico', email });
    expect(pessoa.status).toBe(201);

    const semSenha = await api.put<{ error: string }>(`/api/users/${pessoa.body.id}`, { role: 'TECNICO' });
    expect(semSenha.status).toBe(422);
    expect(semSenha.body.error).toMatch(/senha/i);

    const comSenha = await api.put(`/api/users/${pessoa.body.id}`, {
      role: 'TECNICO', password: 'Senha-Do-Tecnico-1',
    });
    expect(comSenha.status).toBe(200);
    expect((await api.anonimo.post('/api/auth/login', { email, password: 'Senha-Do-Tecnico-1' })).status)
      .toBe(200);
  });

  it('a trilha diz que a senha mudou, e nunca o valor', async () => {
    const email = 'trilha.da.senha@teste.local';
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Trilha da Senha', email, role: 'TECNICO', password: 'Senha-Original-123',
    });
    expect((await api.put(`/api/users/${pessoa.body.id}`, { password: 'Senha-Nova-123456' })).status).toBe(200);

    const linhas = await prisma.activityLog.findMany({
      where: { entityType: 'User', entityId: pessoa.body.id },
      select: { changes: true },
    });
    const texto = JSON.stringify(linhas);
    expect(texto).toContain('senha definida');
    expect(texto).toContain('senha redefinida');
    expect(texto).not.toContain('Senha-Nova-123456');
    expect(texto).not.toContain('argon2');
  });
});

describe('a porta fechada por padrão', () => {
  it('USUARIO não entra no painel, e a recusa explica por quê', async () => {
    // O cargo existe para quem RECEBE equipamento. Como nenhuma rota de
    // inventário o aceita e nenhum item do menu dispensa cargo, deixá-lo entrar
    // produzia um painel vazio respondendo 403 em tudo — que parece defeito.
    // A tela nem mostra o campo de senha para `USUARIO`, mas a API aceita: é o
    // jeito de provar que a recusa é do CARGO, com a senha certa na mão.
    const email = `colab${Date.now()}@teste.local`;
    const senha = 'Senha-De-Teste-123';
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Colaborador Sem Painel', email, password: senha,
    });
    expect(pessoa.status).toBe(201);

    // A conta nasce `USUARIO` pelo `@default` da coluna — ninguém a rebaixou.
    const entrada = await api.anonimo.post<{ error: string }>('/api/auth/login', {
      email, password: senha,
    });

    // 403 e não 401: a senha está CERTA, o que falta é autorização.
    expect(entrada.status).toBe(403);
    expect(entrada.body.error).toMatch(/colaborador/i);
    expect(entrada.body.error).toContain('Técnico');
  });

  it('promovido a TECNICO, o mesmo login passa', async () => {
    // A outra metade: provar que o bloqueio é do CARGO e não da conta, senão
    // uma implementação que recusa todo mundo passaria no caso de cima.
    const email = `promovido${Date.now()}@teste.local`;
    const senha = 'Senha-De-Teste-123';
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Colaborador Promovido', email, password: senha,
    });

    expect((await api.anonimo.post('/api/auth/login', { email, password: senha })).status)
      .toBe(403);

    expect((await api.put(`/api/users/${pessoa.body.id}`, { role: 'TECNICO' })).status).toBe(200);

    expect((await api.anonimo.post('/api/auth/login', { email, password: senha })).status)
      .toBe(200);
  });

  it('o 403 das rotas NOMEIA o cargo que falta', async () => {
    // Agora pelo TECNICO numa rota de ADMIN: é a mesma mensagem do guard, e o
    // caminho que sobrou agora que `USUARIO` não tem sessão.
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

  it('o cargo é relido a cada requisição, como o usuário', async () => {
    const pessoa = await api.comoUsuario('TECNICO');
    expect((await pessoa.get('/api/assets')).status).toBe(200);

    // Rebaixa POR FORA da sessão dela: o cookie continua válido, o cargo não.
    await prisma.user.update({ where: { id: pessoa.userId }, data: { role: 'USUARIO' } });

    // Sem novo login: a releitura por requisição é que decide (o mesmo desenho
    // que faz a lixeira derrubar um token já emitido).
    expect((await pessoa.get('/api/assets')).status).toBe(403);
  });
});
