import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { cenarioDePosse, criarAtivo, criarColaborador } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// ═════════════════════════════════════════════════════════════════════════════
// A FILA TEM TRÊS PORTAS DE SAÍDA, E SÓ DUAS ESTAVAM ABERTAS
// (docs/FASE-7-PLANO-ITAM.md, D109–D112).
//
// Uma sugestão sai da fila quando alguém a aceita, quando alguém a recusa — e
// quando o MUNDO MUDA e ela deixa de descrever qualquer coisa. A terceira é a
// mais comum das três e era a que não existia.
//
// Os quatro grupos deste arquivo provam as quatro correções, e cada um deles
// falhava antes:
//
//   1. recusar uma sugestão de POSSE e ela não volta no dia seguinte      (D109)
//   2. o cadastro mudar sozinho tira a sugestão da fila                   (D110)
//   3. desvincular a máquina encerra o que se dizia através dela          (D110)
//   4. `discoveryMode = OFF` desliga a descoberta de verdade              (D112)
//
// O nº 2 é o que mais importava: aceitar uma sugestão que o mundo já realizou
// gravava uma DEVOLUÇÃO QUE NUNCA ACONTECEU no histórico de posse do ativo.
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
 * O que se simula aqui é o CALENDÁRIO, não um formulário.
 *
 * A "API" que escreve estas linhas é o agente mandando handshake em dias
 * diferentes, e nenhum teste pode esperar três dias — é a mesma justificativa
 * do `observar()` em `posto-compartilhado.test.ts`.
 */
async function observar(
  endpointId: string, userKey: string, userId: string | null,
  opcoes: { dias: number; horaUtc: number; apartirDe?: number } = { dias: 3, horaUtc: 13 },
) {
  const hoje = new Date();
  const primeiro = opcoes.apartirDe ?? 1;
  for (let voltar = primeiro; voltar < primeiro + opcoes.dias; voltar += 1) {
    const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - voltar));
    const instante = new Date(dia.getTime() + opcoes.horaUtc * 60 * 60 * 1000);
    await prisma.endpointUserDaily.create({
      data: { endpointId, userKey, userId, day: dia, firstSeenAt: instante, lastSeenAt: instante, samples: 6 },
    });
  }
}

/** Um dia a mais de presença HOJE: o contador cresce, a afirmação não muda. */
async function umDiaAMais(endpointId: string, userKey: string, userId: string, horaUtc = 13) {
  const hoje = new Date();
  const dia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const instante = new Date(dia.getTime() + horaUtc * 60 * 60 * 1000);
  await prisma.endpointUserDaily.upsert({
    where: { endpointId_userKey_day: { endpointId, userKey, day: dia } },
    update: { samples: { increment: 6 }, lastSeenAt: instante },
    create: { endpointId, userKey, userId, day: dia, firstSeenAt: instante, lastSeenAt: instante, samples: 6 },
  });
}

async function maquinaVinculada(hwid: string, assetId: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId });
  return endpoint.id;
}

async function novoAtivo(nome: string, serial?: string) {
  return criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: nome, serial,
  });
}

const pendentesDe = (endpointId: string, kind: string) =>
  prisma.reconciliationSuggestion.count({
    where: { endpointId, kind: kind as never, state: 'PENDING' },
  });

// ─────────────────────────────────────────────────────────────────────────────

describe('a memória da recusa sobrevive ao calendário (D109)', () => {
  it('recusar um CHECKOUT e ganhar um dia de presença NÃO o traz de volta', async () => {
    const ativo = await novoAtivo('pc-memoria');
    const endpointId = await maquinaVinculada('memoria-1', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, { dias: 3, horaUtc: 13 });

    await rodarReconciliacao();
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect((await api.post(`/api/reconciliation/suggestions/${sugestao.id}/reject`)).status).toBe(200);

    // ⚠️ O CASO QUE FALHAVA. A evidência carrega `dias`, `amostras`, `horas` e
    // `ultimoDia` — todos crescem sozinhos. Com o hash sobre a evidência
    // inteira, um dia a mais de presença gerava hash novo e a sugestão RECUSADA
    // voltava para a fila como se fosse outra afirmação. Não era: é a mesma
    // frase ("a Laura usa esta máquina") com o contador incrementado.
    await umDiaAMais(endpointId, 'laura', cenario.laura);
    await rodarReconciliacao();
    await rodarReconciliacao();

    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(0);
  });

  it('mas a evidência VISÍVEL acompanha o calendário na sugestão que está na fila', async () => {
    const ativo = await novoAtivo('pc-evidencia-viva');
    const endpointId = await maquinaVinculada('memoria-2', ativo.id);
    await observar(endpointId, 'ana', cenario.ana, { dias: 3, horaUtc: 18 });

    await rodarReconciliacao();
    const antes = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect((antes.evidence as { dias: number }).dias).toBe(3);

    await umDiaAMais(endpointId, 'ana', cenario.ana, 18);
    await rodarReconciliacao();

    const depois = await prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id: antes.id } });

    // A EVIDÊNCIA CRESCE E O HASH FICA. Quem abre a fila amanhã precisa ler o
    // número de hoje; congelar a evidência para proteger o hash resolveria a
    // memória mentindo na tela, que é trocar um defeito por outro.
    expect((depois.evidence as { dias: number }).dias).toBe(4);
    expect(depois.evidenceHash).toBe(antes.evidenceHash);
    expect(depois.state).toBe('PENDING');
  });

  it('uma afirmação DIFERENTE sobre o mesmo ativo continua sendo reoferecida', async () => {
    const ativo = await novoAtivo('pc-outra-pessoa');
    const endpointId = await maquinaVinculada('memoria-3', ativo.id);
    const bruno = await criarColaborador(api, { name: 'Bruno Reis', email: 'bruno.reis@teste.local' });
    await observar(endpointId, 'laura', cenario.laura, { dias: 3, horaUtc: 13 });

    await rodarReconciliacao();
    const daLaura = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    await api.post(`/api/reconciliation/suggestions/${daLaura.id}/reject`);

    // A Laura sai de cena e o Bruno passa a usar a máquina. "Entregar ao Bruno"
    // é OUTRA frase — recusar a primeira não pode enterrar esta (D97).
    await prisma.endpointUserDaily.deleteMany({ where: { endpointId, userKey: 'laura' } });
    await observar(endpointId, 'bruno.reis', bruno, { dias: 4, horaUtc: 14 });
    await rodarReconciliacao();

    const doBruno = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    expect(doBruno.targetUserId).toBe(bruno);
    expect(doBruno.evidenceHash).not.toBe(daLaura.evidenceHash);
  });
});

describe('o mundo muda sozinho e a fila acompanha (D110)', () => {
  it('entregar o ativo à mão para a MESMA pessoa encerra a sugestão', async () => {
    const ativo = await novoAtivo('pc-ja-feito');
    const endpointId = await maquinaVinculada('mundo-1', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, { dias: 4, horaUtc: 13 });

    await rodarReconciliacao();
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });

    // Alguém faz à mão exatamente o que a sugestão propunha.
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    })).status).toBe(201);

    await rodarReconciliacao();

    // SUPERSEDED e não REJECTED: ninguém disse não. Recusa é ato de gente e tem
    // memória; isto é o mundo tendo andado.
    const depois = await prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id: sugestao.id } });
    expect(depois.state).toBe('SUPERSEDED');
    expect(depois.resolvedAt).not.toBeNull();
  });

  it('⚠️ aceitar uma sugestão já realizada NÃO inventa devolução no histórico', async () => {
    const ativo = await novoAtivo('pc-sem-devolucao-falsa');
    const endpointId = await maquinaVinculada('mundo-2', ativo.id);
    await observar(endpointId, 'ana', cenario.ana, { dias: 4, horaUtc: 18 });

    await rodarReconciliacao();
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId, kind: 'CHECKOUT', state: 'PENDING' },
    });
    await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: cenario.ana });

    // O aceite SEM o job ter passado: é a janela de até uma hora entre o mundo
    // mudar e a varredura seguinte, e a guarda tem que existir nos dois lugares.
    const aceite = await api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`);
    expect(aceite.status).toBe(409);

    // A ASSERÇÃO QUE JUSTIFICA O ARQUIVO. O aceite de reatribuição é checkin +
    // checkout; com o ativo já entregue à Ana, os dois passos gravavam uma
    // devolução que nunca aconteceu. Num sistema cujo núcleo é o razão de posse,
    // uma afirmação falsa sobre o passado é pior que um inventário errado —
    // ninguém tem como descobrir que ela é falsa.
    expect(await prisma.assignment.count({
      where: { assetId: ativo.id, checkinAt: { not: null } },
    })).toBe(0);
    expect(await prisma.assignment.count({
      where: { assetId: ativo.id, checkinAt: null },
    })).toBe(1);
  });

  it('a posse virando de POSTO tira a sugestão de checkout da fila', async () => {
    const ativo = await novoAtivo('pc-virou-posto');
    const endpointId = await maquinaVinculada('mundo-3', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, { dias: 4, horaUtc: 13 });

    await rodarReconciliacao();
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(1);

    // O D47 protegido no TEMPO: a sugestão nasceu quando o ativo não era de
    // ninguém. Com ele entregue ao posto, aceitá-la fecharia a posse do posto —
    // então ela nem deve continuar oferecida.
    await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });
    await rodarReconciliacao();

    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(0);
  });

  it('desvincular a máquina encerra o que se dizia através dela', async () => {
    const ativo = await novoAtivo('pc-desvincula');
    const endpointId = await maquinaVinculada('mundo-4', ativo.id);
    await observar(endpointId, 'laura', cenario.laura, { dias: 4, horaUtc: 13 });

    await rodarReconciliacao();
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(1);

    expect((await api.delete(`/api/endpoints/${endpointId}/link`)).status).toBe(200);

    // Sem esperar o job: a sugestão de posse fala do ativo ATRAVÉS desta
    // máquina, e desfeito o vínculo a frase perdeu o sujeito. Aceitá-la
    // entregaria um ativo com base na evidência que o operador acabou de
    // invalidar de propósito.
    expect(await pendentesDe(endpointId, 'CHECKOUT')).toBe(0);
  });
});

describe('discoveryMode = OFF desliga a descoberta (D112)', () => {
  it('não nasce sugestão de vínculo, e volta a nascer em SUGGEST', async () => {
    const ativo = await novoAtivo('pc-desligado', 'SN-OFF-777');

    await api.put('/api/settings/discovery', { discoveryMode: 'OFF' });

    const agente = await conectarAgente(api, 'off-1');
    await agente.handshake({ Hostname: 'pc-desligado', BiosSerial: 'SN-OFF-777' });
    const endpoint = await esperarPor('a máquina de OFF', () => prisma.endpoint.findUnique({ where: { hwid: 'off-1' } }));
    await agente.fechar();

    await rodarReconciliacao();

    // O enum tinha três valores e só `ON` era lido: `OFF` se comportava como
    // `SUGGEST`, então quem desligava a descoberta continuava recebendo tudo.
    // Configuração que não faz nada é pior que configuração que falta.
    expect(await pendentesDe(endpoint.id, 'LINK')).toBe(0);

    await api.put('/api/settings/discovery', { discoveryMode: 'SUGGEST' });
    await rodarReconciliacao();

    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, kind: 'LINK', state: 'PENDING' },
    });
    expect(sugestao.assetId).toBe(ativo.id);
    expect(sugestao.signal).toBe('SERIAL');
  });
});
