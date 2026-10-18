import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarLicenca, criarLocal, diasAFrente, idsDoSeed,
} from '../helpers/fixtures';
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

    // `DEPLOYABLE` ("Disponível", no seed) quer dizer *está no estoque, pode
    // ser entregue* — frase falsa sobre um equipamento que está na mão de alguém.
    const { status, body } = await api.put<{ error: string }>(`/api/assets/${ativo.id}`, {
      statusId: cenario.statusDeployableId,
    });

    expect(status).toBe(409);
    // A mensagem é metade da invariante: ela precisa ENSINAR a saída, não só
    // recusar. "Bloqueia, nunca limpa sozinho" (D28).
    expect(body.error).toMatch(/devolu[çc][ãa]o/i);
  });

  it('ACEITA os estados que descrevem operação real com responsável', async () => {
    // A estreiteza é de propósito: é 1 proibido de 8. `PENDING` com
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

describe('a devolução escopada ao posto', () => {
  // A ficha do posto manda `targetLocationId` no checkin: a posse só fecha se
  // for DAQUELE posto. Sem isso, uma ficha velha — o ativo foi devolvido e
  // entregue a outra pessoa entre o carregar e o clique — fecharia a posse da
  // pessoa achando que tirava um mouse da mesa.
  it('recusa fechar a posse que não é deste posto, e diz com quem o ativo está', async () => {
    const mesa2 = await criarLocal(api, { name: 'Mesa 2 do escopo', isWorkstation: true });
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

    // Entregue à Laura, não à Mesa 1: é a ficha velha da Mesa 1 clicando.
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    })).status).toBe(201);

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkin`, {
      targetLocationId: cenario.mesa1,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/n[ãa]o est[áa] entregue a este posto/i);
    expect(body.error).toContain('Laura Souza');

    // E a posse da Laura continua aberta: é o que o escopo existe para proteger.
    const aberta = await prisma.assignment.findFirst({ where: { assetId: ativo.id, checkinAt: null } });
    expect(aberta?.targetUserId).toBe(cenario.laura);

    // Posse em OUTRO posto é a mesma recusa: Mesa 2 não devolve o que é da Mesa 1.
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    })).status).toBe(201);
    const deOutraMesa = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkin`, {
      targetLocationId: mesa2,
    });
    expect(deOutraMesa.status).toBe(409);
    expect(deOutraMesa.body.error).toContain('Mesa 1');

    // Do posto certo, fecha.
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {
      targetLocationId: cenario.mesa1,
    })).status).toBe(200);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id, checkinAt: null } })).toBe(0);
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
    expect(recusa.body.error).toMatch(/desativad/i);

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
    expect(recusa.body.error).toMatch(/desativad/i);

    // E não ficou meia ocupação.
    expect(await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, userId: pessoa, endedAt: null },
    })).toBe(0);
  });

  it('desativar quem ainda responde por algo é 409 — a mesma recusa da exclusão', async () => {
    // Invariante 6: desativado não responde por nada. A desativação tira a
    // pessoa dos seletores, e a posse que ficasse aberta naquele nome não teria
    // mais quem a devolvesse pela tela.
    const pessoa = await criarColaborador(api, {
      name: 'Bia Costa', email: 'bia.com.posse@teste.local',
    });
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook da Bia',
    });
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: pessoa,
    })).status).toBe(201);

    const recusa = await api.put<{ error: string }>(`/api/users/${pessoa}`, { isActive: false });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/responde por 1 ativo/);
    expect(recusa.body.error).toMatch(/antes de desativar/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pessoa } })).isActive).toBe(true);

    // Devolvido o equipamento, a desativação passa.
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);
    expect((await api.put(`/api/users/${pessoa}`, { isActive: false })).status).toBe(200);
  });

  it('desativado some dos seletores de pessoa', async () => {
    const pessoa = await criarColaborador(api, {
      name: 'Caio Seletor', email: 'caio.seletor@teste.local',
    });
    const antes = await api.get<{ id: string }[]>('/api/users/options?q=Caio');
    expect(antes.body.map((opcao) => opcao.id)).toContain(pessoa);

    expect((await api.put(`/api/users/${pessoa}`, { isActive: false })).status).toBe(200);
    const depois = await api.get<{ id: string }[]>('/api/users/options?q=Caio');
    expect(depois.body.map((opcao) => opcao.id)).not.toContain(pessoa);
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

describe('a baixa recusa', () => {
  it('o ativo entregue — devolva antes', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: cenario.laura });

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Faça a devolução antes/);
  });

  it('o ativo que ocupa assento de licença — o assento ficaria preso a uma máquina vendida', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    const { categoriaLicencaId } = await idsDoSeed();
    const licenca = await criarLicenca(api, { name: 'Office da máquina vendida', categoryId: categoriaLicencaId, seatsTotal: 1 });
    const assento = await api.post(`/api/licenses/${licenca.id}/checkout-seat`, { assignedAssetId: ativo.id });
    expect(assento.status).toBe(201);

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(status).toBe(409);
    expect(body.error).toMatch(/assento/);
  });

  it('a data futura — a baixa não acontece na semana que vem', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    const { status } = await api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO', retiredAt: diasAFrente(7) });
    expect(status).toBe(422);
  });

  it('dar baixa duas vezes', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'DOADO' })).status).toBe(200);
    expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'DOADO' })).status).toBe(409);
  });
});

describe('ativo baixado', () => {
  it('não é entregue, mesmo com status disponível — a baixa não mexe no status', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    const baixa = await api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(baixa.status).toBe(200);

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/teve baixa/);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);

    // Desfeita a baixa, volta a poder sair.
    expect((await api.post(`/api/assets/${ativo.id}/unretire`)).status).toBe(200);
    const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: cenario.laura });
    expect(entrega.status).toBe(201);
  });
});

describe('o status escolhido à mão', () => {
  // Um uuid bem formado que não existe: o zod deixa passar, e quem responde é
  // o use-case — 404 com nome, no lugar do P2003 "em uso por outro cadastro".
  const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  it('cadastro e edição de ativo com status inexistente dão 404', async () => {
    const cadastro = await api.post<{ error: string }>('/api/assets', {
      statusId: INEXISTENTE, modelId: cenario.modelId,
    });
    expect(cadastro.status).toBe(404);
    expect(cadastro.body.error).toBe('Status não encontrado.');

    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    const edicao = await api.put<{ error: string }>(`/api/assets/${ativo.id}`, { statusId: INEXISTENTE });
    expect(edicao.status).toBe(404);
    expect(edicao.body.error).toBe('Status não encontrado.');
  });

  it('edição de ativo para um modelo inexistente dá 404, como o cadastro', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    const { status, body } = await api.put<{ error: string }>(`/api/assets/${ativo.id}`, { modelId: INEXISTENTE });
    expect(status).toBe(404);
    expect(body.error).toBe('Modelo não encontrado.');
  });

  it('a entrega recusa status de ESTOQUE com 422 — o erro é do formulário', async () => {
    // A guarda estado × posse também recusaria, mas com 409 e "faça a
    // devolução antes", que manda devolver quem está entregando.
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura, statusId: cenario.statusDeployableId,
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/status de estoque/);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);
  });

  it('a entrega com status inexistente dá 404', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura, statusId: INEXISTENTE,
    });
    expect(status).toBe(404);
    expect(body.error).toBe('Status não encontrado.');
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);
  });
});
