import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo, criarColaborador } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// O D48 — DUAS PESSOAS NA MESMA MÁQUINA DEIXAM DE SER RUÍDO.
//
// Num modelo `Asset ⟷ User` isto é uma CONTRADIÇÃO: o software precisa escolher
// um vencedor, escolher errado toda semana faz o vínculo oscilar, e o jeito de
// não oscilar é descartar a observação. Não falta dado — falta ONDE GUARDAR.
//
// A asserção final deste arquivo é a frase inteira da fase: **as duas, com
// turno. Nenhum vencedor escolhido.**
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

async function maquinaVinculada(hwid: string, assetId: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
  return endpoint.id;
}

/** Ver a nota em `posse-sugerida.test.ts`: o que se simula aqui é o calendário. */
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

describe('o ativo é de uma pessoa, e duas usam a máquina', () => {
  let assetId: string;
  let endpointId: string;

  it('propõe PROMOVER a posto compartilhado, com as duas na evidência', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'desktop-turnos',
    });
    assetId = ativo.id;
    endpointId = await maquinaVinculada('turnos-1', ativo.id);

    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: cenario.laura });

    // Laura de manhã (13h UTC = 10h em SP), Ana à tarde (18h UTC = 15h em SP).
    await observar(endpointId, 'laura', cenario.laura, 5, 13);
    await observar(endpointId, 'ana', cenario.ana, 5, 18);

    await rodarReconciliacao();

    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'SHARED_POST', state: 'PENDING' },
    });

    const evidencia = sugestao.evidence as { pessoas: { userId: string; turno: string | null }[] };
    expect(evidencia.pessoas).toHaveLength(2);
    expect(evidencia.pessoas.map((pessoa) => pessoa.turno).sort()).toEqual(['Manhã', 'Tarde']);

    // E NÃO NASCEU SUGESTÃO DE POSSE PARA UMA DELAS: com duas pessoas
    // recorrentes, o `suggest-posse` desiste de propósito. Escolher a mais
    // frequente é exatamente o comportamento que esta fase existe para não ter.
    const checkouts = await prisma.reconciliationSuggestion.count({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect(checkouts).toBe(0);
  });

  it('aceitar move a posse para o posto e abre as DUAS ocupações', async () => {
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'SHARED_POST', state: 'PENDING' },
    });

    // O posto vem de quem aceita: o sistema não inventa `Location` sozinho —
    // isso encheria a árvore de locais de "Mesa da máquina turnos-1".
    const aceite = await api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`, {
      locationId: cenario.mesa1,
    });
    expect(aceite.status).toBe(200);

    const posse = await prisma.assignment.findFirstOrThrow({ where: { assetId, checkinAt: null } });
    expect(posse.targetType).toBe('LOCATION');
    expect(posse.targetLocationId).toBe(cenario.mesa1);

    // A posse pessoal anterior foi DEVOLVIDA, não apagada: o histórico continua
    // dizendo que o desktop esteve com a Laura.
    const fechada = await prisma.assignment.findFirst({
      where: { assetId, targetType: 'USER', checkinAt: { not: null } },
    });
    expect(fechada).not.toBeNull();

    const ocupantes = await prisma.locationOccupant.findMany({
      where: { locationId: cenario.mesa1, endedAt: null },
      select: { userId: true, shift: true },
      orderBy: { shift: 'asc' },
    });

    // ⚠️ A FRASE DA FASE: as duas, com turno. Nenhum vencedor escolhido.
    expect(ocupantes).toHaveLength(2);
    expect(ocupantes.map((ocupante) => ocupante.shift).sort()).toEqual(['Manhã', 'Tarde']);
    expect(ocupantes.map((ocupante) => ocupante.userId).sort()).toEqual([cenario.laura, cenario.ana].sort());
  });
});

describe('o ativo JÁ é de um posto', () => {
  it('sugere só as ocupações que faltam', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'desktop-mesa-2',
    });
    const mesa2 = (await api.post<{ id: string }>('/api/locations', { name: 'Mesa 2', isWorkstation: true })).body.id;
    const endpointId = await maquinaVinculada('turnos-2', ativo.id);

    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'LOCATION', targetLocationId: mesa2 });

    const bruno = await criarColaborador(api, { name: 'Bruno Dias', email: 'bruno@teste.local' });
    const carla = await criarColaborador(api, { name: 'Carla Melo', email: 'carla@teste.local' });

    await observar(endpointId, 'bruno', bruno, 4, 13);
    await observar(endpointId, 'carla', carla, 4, 22);

    await rodarReconciliacao();

    const ocupacoes = await prisma.reconciliationSuggestion.findMany({
      where: { endpointId, kind: 'OCCUPANCY', state: 'PENDING' },
      select: { targetUserId: true, targetLocationId: true, shift: true },
    });

    // O cadastro do ATIVO já está certo: não há nada a promover, só gente a
    // cadastrar. Uma sugestão por ocupante que falta.
    expect(ocupacoes).toHaveLength(2);
    expect(ocupacoes.every((ocupacao) => ocupacao.targetLocationId === mesa2)).toBe(true);
    expect(await prisma.reconciliationSuggestion.count({
      where: { endpointId, kind: 'SHARED_POST', state: 'PENDING' },
    })).toBe(0);
  });
});

describe('a allowlist de contas ignoradas', () => {
  it('o técnico de TI não vira ocupante de nada', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'desktop-suporte',
    });
    const endpointId = await maquinaVinculada('turnos-3', ativo.id);
    const tecnico = await criarColaborador(api, { name: 'Tico Suporte', email: 'suporte.ti@teste.local' });

    await observar(endpointId, 'laura', cenario.laura, 5, 13);
    await observar(endpointId, 'suporte.ti', tecnico, 5, 15);

    // Sem a allowlist, isto seria um "posto compartilhado" — e no primeiro dia de
    // uso a fila viria com dezenas deles, porque o técnico loga em toda máquina
    // que atende. Fila cujo primeiro contato é ruído não é revisada uma segunda
    // vez (D101).
    const configuracao = await api.put('/api/settings/discovery', { ignoredUserKeys: ['Suporte.TI'] });
    expect(configuracao.status).toBe(200);

    await rodarReconciliacao();

    expect(await prisma.reconciliationSuggestion.count({
      where: { endpointId, kind: 'SHARED_POST', state: 'PENDING' },
    })).toBe(0);

    // E o que sobra é a leitura certa: a máquina é da Laura.
    const checkout = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect(checkout.targetUserId).toBe(cenario.laura);

    await api.put('/api/settings/discovery', { ignoredUserKeys: [] });
  });
});
