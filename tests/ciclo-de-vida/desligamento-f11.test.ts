import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarLocal } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// O QUE A F11 ACRESCENTOU AO DESLIGAMENTO (Etapa G) — e a amarra que o D82
// protege.
//
// ═════════════════════════════════════════════════════════════════════════════
// O `offboard` NÃO É NOVO: ele existe desde a F4 e já devolvia ativos,
// acessórios e assentos, encerrava ocupações e marcava a saída. O D82 decidiu
// que a F11 o ESTENDE em vez de criar um `terminate` irmão — duas rotas para a
// mesma operação divergem, e a que divergir esquece o passo que não dá erro
// quando falta (encerrar as ocupações de posto).
//
// Então este arquivo testa SÓ o que a F11 somou:
//   a guarda do substituto (passo 1) e a revogação de acesso (passo 5).
//
// O resto continua coberto por `tests/invariantes/posse.test.ts` e
// `tests/corridas/posse.test.ts`, que é onde o `offboard` já era exercitado.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;

beforeAll(async () => { api = await criarApi(); });
afterAll(async () => { await api.fechar(); });

describe('a guarda do substituto', () => {
  it('desliga sem substituto quem não gere nada', async () => {
    const cenario = await cenarioDePosse(api, '-sem-chefia');

    const resposta = await api.post<{ chefiasTransferidas: unknown }>(
      `/api/users/${cenario.ana}/offboard`, {},
    );

    expect(resposta.status).toBe(200);
    // `null` e não um objeto de zeros: "não geria nada" e "transferiu zero
    // coisas" são a mesma coisa para a tela, e o nulo deixa o contrato igual ao
    // do campo que não se aplica.
    expect(resposta.body.chefiasTransferidas).toBeNull();
  });

  it('recusa (409) desligar gestor de LOCALIDADE sem substituto', async () => {
    const cenario = await cenarioDePosse(api, '-gestor-local');
    const andar = await criarLocal(api, { name: 'Andar 2 — gestor-local' });
    await api.put(`/api/locations/${andar}`, { name: 'Andar 2 — gestor-local', managerId: cenario.laura });

    const resposta = await api.post<{ error: string; localidades: number }>(
      `/api/users/${cenario.laura}/offboard`, {},
    );

    expect(resposta.status).toBe(409);
    // A frase nomeia a consequência, não só a regra: é o que faz quem está
    // desligando entender por que o campo apareceu.
    expect(resposta.body.error).toMatch(/termo de aceite/);
    // E os números vão nos `details`, para a tela abrir o campo do substituto
    // sem reparsear português.
    expect(resposta.body.localidades).toBe(1);

    // NADA FOI APLICADO: a recusa é o passo 0, antes de qualquer devolução.
    const pessoa = await prisma.user.findFirst({
      where: { id: cenario.laura }, select: { terminatedAt: true, isActive: true },
    });
    expect(pessoa).toMatchObject({ terminatedAt: null, isActive: true });
  });

  it('recusa (409) desligar gestor de GENTE sem substituto', async () => {
    const cenario = await cenarioDePosse(api, '-gestor-gente');
    await api.put(`/api/users/${cenario.ana}`, {
      name: 'Ana Lima', email: `ana-gestor-gente@teste.local`, managerId: cenario.laura,
    });

    const resposta = await api.post<{ error: string; liderados: number }>(
      `/api/users/${cenario.laura}/offboard`, {},
    );

    expect(resposta.status).toBe(409);
    expect(resposta.body.liderados).toBe(1);
  });

  it('transfere as três chefias para o substituto, numa transação', async () => {
    const cenario = await cenarioDePosse(api, '-transfere');

    // A Laura vira gestora de localidade, de gente e de departamento.
    const andar = await criarLocal(api, { name: 'Andar 3 — transfere' });
    await api.put(`/api/locations/${andar}`, { name: 'Andar 3 — transfere', managerId: cenario.laura });

    const depto = await api.post<{ id: string }>('/api/departments', {
      name: 'Comercial — transfere', managerId: cenario.laura,
    });
    expect(depto.status).toBe(201);

    const terceiro = await api.post<{ id: string }>('/api/users', {
      name: 'Liderado', email: 'liderado-transfere@teste.local', managerId: cenario.laura,
    });

    const resposta = await api.post<{
      chefiasTransferidas: {
        liderados: number; localidades: number; departamentos: number; substitutoNome: string;
      };
    }>(`/api/users/${cenario.laura}/offboard`, { substitutoId: cenario.ana });

    expect(resposta.status).toBe(200);
    expect(resposta.body.chefiasTransferidas).toMatchObject({
      liderados: 1, localidades: 1, departamentos: 1,
      // O `cenarioDePosse` sufixa os nomes para dois `it` do mesmo arquivo não
      // colidirem no `@unique` — daí o nome não ser literalmente "Ana Lima".
      substitutoNome: 'Ana Lima-transfere',
    });

    // E O ESTADO DE FATO MUDOU nas três tabelas — é o que impede este teste de
    // passar com um use-case que só devolve o placar certo.
    const [local, departamento, liderado] = await Promise.all([
      prisma.location.findUnique({ where: { id: andar }, select: { managerId: true } }),
      prisma.department.findUnique({ where: { id: depto.body.id }, select: { managerId: true } }),
      prisma.user.findFirst({ where: { id: terceiro.body.id }, select: { managerId: true } }),
    ]);

    expect(local?.managerId).toBe(cenario.ana);
    expect(departamento?.managerId).toBe(cenario.ana);
    expect(liderado?.managerId).toBe(cenario.ana);
  });

  it('recusa (422) substituto desligado', async () => {
    const cenario = await cenarioDePosse(api, '-subst-desligado');
    const andar = await criarLocal(api, { name: 'Andar 4 — subst' });
    await api.put(`/api/locations/${andar}`, { name: 'Andar 4 — subst', managerId: cenario.laura });

    // A Ana sai primeiro.
    expect((await api.post(`/api/users/${cenario.ana}/offboard`, {})).status).toBe(200);

    // Transferir para ela seria o mesmo buraco com outro nome dentro: o
    // `resolverEscalonamento()` devolveria alguém que não atende o telefone.
    const resposta = await api.post<{ error: string }>(
      `/api/users/${cenario.laura}/offboard`, { substitutoId: cenario.ana },
    );

    expect(resposta.status).toBe(422);
    expect(resposta.body.error).toMatch(/desligado/i);
  });

  it('recusa (422) a própria pessoa como substituta', async () => {
    const cenario = await cenarioDePosse(api, '-subst-proprio');
    const andar = await criarLocal(api, { name: 'Andar 5 — subst' });
    await api.put(`/api/locations/${andar}`, { name: 'Andar 5 — subst', managerId: cenario.laura });

    const resposta = await api.post<{ error: string }>(
      `/api/users/${cenario.laura}/offboard`, { substitutoId: cenario.laura },
    );

    expect(resposta.status).toBe(422);
  });
});

describe('a revogação de acesso', () => {
  it('revoga o token pessoal e derruba a sessão', async () => {
    // Uma pessoa COM login, para haver sessão a derrubar.
    const pessoa = await api.comoUsuario('TECNICO');

    // A sessão dela funciona.
    expect((await pessoa.get('/api/assets')).status).toBe(200);

    // O `tokenVersion` antes, para provar o incremento.
    const antes = await prisma.user.findFirst({
      where: { id: pessoa.userId }, select: { tokenVersion: true },
    });

    const resposta = await api.post<{ acessoRevogado: { sessoesDerrubadas: boolean } }>(
      `/api/users/${pessoa.userId}/offboard`, {},
    );
    expect(resposta.status).toBe(200);
    expect(resposta.body.acessoRevogado.sessoesDerrubadas).toBe(true);

    // ─────────────────────────────────────────────────────────────────────
    // A SESSÃO MORREU NA REQUISIÇÃO SEGUINTE, sem esperar o token expirar.
    //
    // Duas defesas cobrem isto, e as duas valem: a releitura por requisição
    // recusa `isActive: false`, e o `tokenVersion` incrementado mata o token em
    // si. A segunda é a que sobrevive a alguém "reativar" a pessoa sem querer.
    // ─────────────────────────────────────────────────────────────────────
    expect((await pessoa.get('/api/assets')).status).toBe(401);

    const depois = await prisma.user.findFirst({
      where: { id: pessoa.userId }, select: { tokenVersion: true },
    });
    expect(depois!.tokenVersion).toBe(antes!.tokenVersion + 1);
  });

  it('o login dela passa a ser recusado com 403, não 401', async () => {
    const pessoa = await api.comoUsuario('USUARIO');
    const credencial = await prisma.user.findFirst({
      where: { id: pessoa.userId }, select: { username: true },
    });

    expect((await api.post(`/api/users/${pessoa.userId}/offboard`, {})).status).toBe(200);

    // 403 E FRASE PRÓPRIA (F3): quem chegou aqui JÁ PROVOU que sabe a senha —
    // não há nada a enumerar, e "usuário ou senha inválidos" mandaria essa
    // pessoa procurar um erro de digitação que não existe.
    const entrada = await api.anonimo.post<{ error: string }>('/api/auth/login', {
      username: credencial!.username, password: 'Senha-De-Teste-123',
    });

    expect(entrada.status).toBe(403);
    expect(entrada.body.error).toMatch(/desativad/i);
  });
});

describe('D74 — desligar não é apagar, e a consulta que prova', () => {
  it('ninguém desligado continua ocupante aberto de posto nenhum', async () => {
    const cenario = await cenarioDePosse(api, '-d74');

    // As duas ocupam a MESMA mesa — o caso que o modelo de posse existe para
    // modelar, e o que torna o passo 3 do desligamento necessário.
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.laura, shift: 'Manhã' });
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.ana, shift: 'Tarde' });

    expect((await api.post(`/api/users/${cenario.laura}/offboard`, {})).status).toBe(200);

    // A CONSULTA DO D74, literal: nenhuma pessoa desligada ou apagada aparece
    // como ocupante ABERTO. Ela é a prova de que o passo 3 rodou — nenhuma flag
    // em `users` tira a pessoa da lista de ocupantes, porque a extension de
    // soft delete NÃO alcança leitura de relação aninhada (D8).
    const presos = await prisma.$queryRawUnsafe<{ name: string }[]>(`
      SELECT u.name FROM location_occupants o JOIN users u ON u.id = o."userId"
       WHERE o."endedAt" IS NULL
         AND (u."terminatedAt" IS NOT NULL OR u."deletedAt" IS NOT NULL)
    `);
    expect(presos).toEqual([]);

    // E A ANA CONTINUA LÁ: desligar a Laura não desocupou a mesa da colega, e
    // não devolveu o equipamento dela.
    // ARRAY PURO, não envelope: esta listagem não pagina de propósito — um
    // posto tem dois, três ocupantes, e paginar isso seria cerimônia.
    const ocupantes = await api.get<{ user: { id: string } }[]>(
      `/api/locations/${cenario.mesa1}/occupants`,
    );
    expect(ocupantes.body.map((o) => o.user.id)).toEqual([cenario.ana]);
  });

  it('`terminatedAt` é gravado e `deletedAt` NUNCA', async () => {
    const cenario = await cenarioDePosse(api, '-nunca-apaga');
    await api.post(`/api/users/${cenario.laura}/offboard`, {});

    const pessoa = await prisma.user.findFirst({
      where: { id: cenario.laura },
      select: { terminatedAt: true, isActive: true, deletedAt: true },
    });

    expect(pessoa!.terminatedAt).not.toBeNull();
    expect(pessoa!.isActive).toBe(false);
    // `deletedAt` significa *este cadastro não devia existir*. Quem saiu da
    // empresa continua no histórico de posse — é a pergunta "quem estava com o
    // notebook antes?" que o docs/referencia/modelo-de-posse.md protege ao nunca apagar histórico.
    expect(pessoa!.deletedAt).toBeNull();
  });
});
