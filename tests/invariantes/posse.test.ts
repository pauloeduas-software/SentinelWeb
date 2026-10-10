import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarColaborador } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS INVARIANTES DO MODELO DE POSSE — `docs/referencia/invariantes.md`, 1, 2 e 4.
//
// São os fatos que nunca podem ser falsos no banco. Cada uma é testada pela
// PORTA que o usuário usa, não pelo use-case: metade da defesa é o índice
// parcial no Postgres e a outra metade é a mensagem que o use-case dá, e só a
// requisição HTTP exercita as duas juntas.
//
// Se um teste daqui ficar vermelho, o dado já pode estar errado no banco — não
// é um detalhe de resposta.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

describe('invariante 1 — uma posse aberta por ativo', () => {
  it('recusa entregar um ativo que já está com alguém', async () => {
    const primeira = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });
    expect(primeira.status).toBe(201);

    // O duplo checkout: dois responsáveis pelo mesmo notebook, nenhum dos dois
    // sabendo — e a Camada 3 sem como escolher entre eles.
    const segunda = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.ana,
    });
    expect(segunda.status).toBe(409);

    // E o banco confirma: UMA linha aberta, não duas.
    const abertas = await prisma.assignment.count({
      where: { assetId: cenario.ativo.id, checkinAt: null },
    });
    expect(abertas).toBe(1);
  });

  it('libera uma nova entrega depois da devolução', async () => {
    // O índice é PARCIAL (`WHERE checkinAt IS NULL`) justamente para isto: o
    // histórico fechado é ilimitado, o mesmo ativo pode ser entregue cem vezes.
    const devolucao = await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {});
    expect(devolucao.status).toBe(200);

    const denovo = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.ana,
    });
    expect(denovo.status).toBe(201);

    const total = await prisma.assignment.count({ where: { assetId: cenario.ativo.id } });
    expect(total).toBe(2);

    await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {});
  });
});

describe('invariante 2 — uma ocupação aberta por (posto, pessoa)', () => {
  it('recusa a mesma pessoa duas vezes no mesmo posto', async () => {
    const primeira = await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.laura,
      shift: 'Manhã',
    });
    expect(primeira.status).toBe(201);

    // Sem esta recusa, a Laura apareceria DUPLICADA em toda resolução de
    // responsável da Mesa 1, e "quantas pessoas usam esta mesa?" mentiria.
    const segunda = await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.laura,
      shift: 'Tarde',
    });
    expect(segunda.status).toBe(409);
  });

  it('permite DUAS pessoas no MESMO posto — que é o ponto do modelo', async () => {
    // A chave do índice é o PAR (posto, pessoa). Laura de manhã e Ana à tarde
    // na mesma Mesa 1 é o caso que o Snipe-IT não modela e que o
    // docs/referencia/modelo-de-posse.md existe para resolver (D48).
    const ana = await api.post(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: cenario.ana,
      shift: 'Tarde',
    });
    expect(ana.status).toBe(201);

    const ocupantes = await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, endedAt: null },
    });
    expect(ocupantes).toBe(2);
  });

  it('faz o ativo entregue ao POSTO responder pelas duas pessoas (Camada 3)', async () => {
    // A responsabilidade DERIVADA, que é a razão de as camadas 1 e 2 existirem
    // separadas: ninguém escreveu "Laura e Ana respondem por este monitor" —
    // o sistema deduz de quem ocupa a mesa AGORA.
    const entrega = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'LOCATION',
      targetLocationId: cenario.mesa1,
    });
    expect(entrega.status).toBe(201);

    const { status, body } = await api.get<{ posse: { responsaveis: { name: string }[]; postoVago: boolean } }>(
      `/api/assets/${cenario.ativo.id}`,
    );
    expect(status).toBe(200);
    expect(body.posse.responsaveis.map((r) => r.name).sort()).toEqual(['Ana Lima', 'Laura Souza']);
    expect(body.posse.postoVago).toBe(false);

    await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {});
  });
});

describe('invariante 4 — estado × posse', () => {
  it('recusa mandar para o estoque um ativo que está com alguém', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook da invariante 4',
    });

    await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });

    // "Pronto p/ Uso" quer dizer *está no estoque, pode ser entregue* — frase
    // falsa sobre um equipamento que está na mão de alguém.
    const { status, body } = await api.put<{ error: string }>(`/api/assets/${ativo.id}`, {
      statusId: cenario.statusDeployableId,
    });

    expect(status).toBe(409);
    // A mensagem é metade da invariante: ela precisa ENSINAR a saída, não só
    // recusar. "Bloqueia, nunca limpa sozinho" (D28).
    expect(body.error).toMatch(/devolu[çc][ãa]o/i);
  });

  it('recusa arquivar um ativo que está com alguém', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook do arquivamento',
    });

    await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.ana,
    });

    // Arquivar sumiria com ele do relatório enquanto continua na mão dela.
    const { status } = await api.put(`/api/assets/${ativo.id}`, {
      statusId: cenario.statusArquivadoId,
    });
    expect(status).toBe(409);
  });

  it('ACEITA os estados que descrevem operação real com responsável', async () => {
    // A estreiteza é de propósito: são 2 proibidos de 10. `PENDING` com
    // responsável é o notebook que foi à assistência e VOLTA para a mesma
    // pessoa — fechar a posse ali perderia a continuidade de quem responde.
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook em manutenção',
    });

    await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });

    const manutencao = await prisma.statusLabel.findFirstOrThrow({
      where: { type: 'PENDING' },
      select: { id: true },
    });

    const { status } = await api.put(`/api/assets/${ativo.id}`, { statusId: manutencao.id });
    expect(status).toBe(200);
  });
});

describe('quem não está ativo na empresa não recebe equipamento', () => {
  it('desativar pela API recusa o checkout (409) e registra no histórico', async () => {
    const pessoa = await criarColaborador(api, {
      name: 'Marcos Lima', email: 'marcos.inativo@teste.local',
    });

    // A DESATIVAÇÃO PELA PORTA DA TELA — `PUT /api/users/:id` com `isActive`.
    // É o caminho que o formulário usa, e é ele que precisa estar fechado: a
    // guarda do checkout já existia, mas até aqui nada na API sabia desativar
    // alguém, então a recusa era inalcançável por quem usa o sistema.
    const desativada = await api.put<{ id: string }>(`/api/users/${pessoa}`, { isActive: false });
    expect(desativada.status).toBe(200);

    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook do inativo',
    });

    const recusa = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: pessoa,
    });

    // 409 e não 404: a pessoa existe, é o ESTADO dela que recusa.
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/desligad|inativ/i);

    // O ativo continua no estoque — a recusa não deixou meia entrega.
    const semPosse = await prisma.assignment.count({
      where: { assetId: ativo.id, checkinAt: null },
    });
    expect(semPosse).toBe(0);

    // E a mudança FICA NO HISTÓRICO da pessoa, com ator: é o que responde
    // "quem desativou, e quando" agora que não há coluna de data.
    const historico = await api.get<{ rows: { action: string; changes: Record<string, unknown> }[] }>(
      `/api/users/${pessoa}/history`,
    );
    const desativacao = historico.body.rows.find(
      (evento) => evento.action === 'UPDATE' && 'isActive' in (evento.changes ?? {}),
    );
    expect(desativacao, JSON.stringify(historico.body.rows)).toBeDefined();
    expect(desativacao!.changes.isActive).toMatchObject({ de: true, para: false });
  });

  it('e também não ocupa posto de trabalho (409 simétrico)', async () => {
    // A ASSIMETRIA QUE EXISTIA ATÉ AQUI: `checkoutAsset` recusava quem saiu da
    // empresa, e `addLocationOccupant` só conferia existência. Como responsável
    // de ativo em posto é DERIVADO da ocupação (`resolverResponsaveis`), a
    // brecha reabria por fora do checkout a posse que a desativação fecha — e a
    // fila de reconciliação chegava a oferecer o botão que fazia isso.
    const pessoa = await criarColaborador(api, {
      name: 'Rita Alves', email: 'rita.inativa@teste.local',
    });
    expect((await api.put(`/api/users/${pessoa}`, { isActive: false })).status).toBe(200);

    const recusa = await api.post<{ error: string }>(`/api/locations/${cenario.mesa1}/occupants`, {
      userId: pessoa,
      shift: 'Manhã',
    });

    // Mesmo código e mesma razão do checkout: a pessoa existe, o estado recusa.
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/desativad|desligad|inativ/i);

    // E não ficou meia ocupação.
    expect(await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, userId: pessoa, endedAt: null },
    })).toBe(0);
  });

  it('reativar pela API libera a entrega de novo', async () => {
    const pessoa = await criarColaborador(api, {
      name: 'Rita Alves', email: 'rita.volta@teste.local',
    });
    await api.put(`/api/users/${pessoa}`, { isActive: false });
    expect((await api.put(`/api/users/${pessoa}`, { isActive: true })).status).toBe(200);

    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook da volta',
    });

    const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER',
      targetUserId: pessoa,
    });
    expect(entrega.status).toBe(201);
  });
});
