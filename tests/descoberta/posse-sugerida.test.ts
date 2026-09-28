import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// O D47 — A ÁRVORE INTEIRA, E O RAMO QUE SÓ EXISTE POR CAUSA DO MODELO DE POSSE.
//
// A observação é sempre a mesma: a pessoa U está logada na máquina E, que é o
// ativo A. O que ela SIGNIFICA depende de para quem A está entregue — e o ramo
// do POSTO é o que nenhum ITAM de prateleira consegue ter, porque ele precisa de
// uma camada entre o ativo e a pessoa.
//
// O teste que mais importa deste arquivo é o negativo: com o ativo entregue a um
// posto, NENHUMA sugestão de checkout pode ser gerada. Se ela fosse, aceitá-la
// fecharia a posse do posto e transformaria um ativo compartilhado em pessoal —
// perdendo a outra ocupante, o turno dela e a responsabilidade solidária. O
// operador clicaria em "aceitar" achando que estava corrigindo o inventário.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/**
 * Uma máquina vinculada a um ativo, pronta para observação.
 *
 * O vínculo entra pela rota (`POST /api/endpoints/:id/link`), que é como um
 * operador o faria.
 */
async function maquinaVinculada(hwid: string, assetId: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  const vinculo = await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
  expect(vinculo.status).toBe(201);
  return endpoint.id;
}

/**
 * A presença de alguém ao longo de vários dias.
 *
 * ESTE É O ÚNICO PONTO DA SUÍTE EM QUE UM INSERT DIRETO SE JUSTIFICA, e o
 * motivo é o tempo: a "API" que escreve estas linhas é o agente mandando
 * handshake em dias diferentes, e nenhum teste pode esperar três dias. O que se
 * está simulando é o CALENDÁRIO, não um formulário — o formato da linha é o
 * mesmo que o `registrarUsuarioObservado` grava.
 *
 * `horaUtc` é escolhida de propósito: o turno é inferido em hora LOCAL
 * (America/Sao_Paulo), e 13h UTC são 10h em São Paulo — manhã. Com `new Date()`
 * o rótulo dependeria da hora em que a suíte roda, e o teste passaria de manhã e
 * falharia à noite.
 */
async function observar(endpointId: string, userKey: string, userId: string | null, dias: number, horaUtc: number) {
  const hoje = new Date();

  for (let voltar = 1; voltar <= dias; voltar += 1) {
    const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - voltar));
    const instante = new Date(dia.getTime() + horaUtc * 60 * 60 * 1000);

    await prisma.endpointUserDaily.create({
      data: { endpointId, userKey, userId, day: dia, firstSeenAt: instante, lastSeenAt: instante, samples: 6 },
    });
  }
}

const sugestoesDe = async (endpointId: string) => prisma.reconciliationSuggestion.findMany({
  where: { endpointId, state: 'PENDING' },
});

describe('o ativo não está entregue a ninguém', () => {
  it('sugere o CHECKOUT para quem usa a máquina', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'sem-posse' });
    const endpointId = await maquinaVinculada('posse-sem', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, 4, 13);

    await rodarReconciliacao();

    const sugestoes = await sugestoesDe(endpointId);
    const checkout = sugestoes.find((sugestao) => sugestao.kind === 'CHECKOUT');
    expect(checkout).toBeDefined();
    expect(checkout!.targetUserId).toBe(cenario.laura);
    expect(checkout!.score).toBe(85);
  });
});

describe('o ativo já está com a pessoa certa', () => {
  it('não sugere nada', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'ja-bate' });
    const endpointId = await maquinaVinculada('posse-bate', ativo.id);

    const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    expect(entrega.status).toBe(201);

    await observar(endpointId, 'laura', cenario.laura, 4, 13);
    await rodarReconciliacao();

    expect(await sugestoesDe(endpointId)).toHaveLength(0);
  });
});

describe('o ativo está com OUTRA pessoa', () => {
  it('sugere reatribuição, com pontuação menor', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'outra-pessoa' });
    const endpointId = await maquinaVinculada('posse-outra', ativo.id);

    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: cenario.ana });
    await observar(endpointId, 'laura', cenario.laura, 4, 13);
    await rodarReconciliacao();

    const checkout = (await sugestoesDe(endpointId)).find((sugestao) => sugestao.kind === 'CHECKOUT');
    expect(checkout!.targetUserId).toBe(cenario.laura);
    // 70 e não 85: contrariar um cadastro existente é uma afirmação mais forte
    // do que preencher um vazio, e a fila ordena por pontuação.
    expect(checkout!.score).toBe(70);
    expect((checkout!.evidence as { reatribuicao: boolean }).reatribuicao).toBe(true);
  });
});

describe('O RAMO DO POSTO — o ativo está entregue a uma LOCATION', () => {
  it('sugere OCUPAÇÃO, e NENHUM checkout', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'desktop-mesa-1' });
    const endpointId = await maquinaVinculada('posse-posto', ativo.id);

    const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });
    expect(entrega.status).toBe(201);

    // 13h UTC = 10h em São Paulo → Manhã.
    await observar(endpointId, 'laura', cenario.laura, 4, 13);
    await rodarReconciliacao();

    const sugestoes = await sugestoesDe(endpointId);

    const ocupacao = sugestoes.find((sugestao) => sugestao.kind === 'OCCUPANCY');
    expect(ocupacao).toBeDefined();
    expect(ocupacao!.targetLocationId).toBe(cenario.mesa1);
    expect(ocupacao!.targetUserId).toBe(cenario.laura);
    expect(ocupacao!.shift).toBe('Manhã');

    // ⚠️ A ASSERÇÃO QUE PROTEGE O MODELO INTEIRO.
    expect(sugestoes.filter((sugestao) => sugestao.kind === 'CHECKOUT')).toHaveLength(0);
  });

  it('aceitar a ocupação cria o vínculo pessoa↔posto, com turno', async () => {
    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'posse-posto' } });
    const ocupacao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, kind: 'OCCUPANCY', state: 'PENDING' },
    });

    const aceite = await api.post(`/api/reconciliation/suggestions/${ocupacao.id}/accept`);
    expect(aceite.status).toBe(200);

    // Quem gravou foi o `addLocationOccupant` da F4 — com o zod da borda, o
    // ActivityLog e a invariante 2. A fila propõe; o dono do assunto grava.
    const ocupante = await prisma.locationOccupant.findFirstOrThrow({
      where: { locationId: cenario.mesa1, userId: cenario.laura, endedAt: null },
    });
    expect(ocupante.shift).toBe('Manhã');

    // E a posse do ATIVO continua sendo do posto: a ocupação não a tocou.
    const posse = await prisma.assignment.findFirstOrThrow({
      where: { assetId: (await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'posse-posto' } })).assetId!, checkinAt: null },
    });
    expect(posse.targetType).toBe('LOCATION');
  });
});

describe('a janela entre sugerir e aceitar', () => {
  it('recusa o checkout se o ativo virou de um posto no meio do caminho', async () => {
    const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'virou-posto' });
    const endpointId = await maquinaVinculada('posse-janela', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, 4, 13);

    await rodarReconciliacao();
    const checkout = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });

    // Enquanto a sugestão esperava na fila, alguém entregou o ativo ao posto.
    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'LOCATION', targetLocationId: cenario.mesa1 });

    const aceite = await api.post(`/api/reconciliation/suggestions/${checkout.id}/accept`);
    // 409 com explicação, e não um checkout que apaga a posse do posto em
    // silêncio: a guarda de barriga existe porque a fila é assíncrona por
    // natureza e o mundo muda entre sugerir e aceitar.
    expect(aceite.status).toBe(409);

    const posse = await prisma.assignment.findFirstOrThrow({ where: { assetId: ativo.id, checkinAt: null } });
    expect(posse.targetType).toBe('LOCATION');
  });
});
