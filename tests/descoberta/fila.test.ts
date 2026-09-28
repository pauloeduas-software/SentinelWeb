import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { rodarReconciliacao } from '../../server/domain/reconciliation/jobs/reconcile.job';
import { prisma } from '../../server/core/database/prismaClient';

// A FILA NÃO PODE VIRAR RUÍDO — o D97.
//
// O job roda de hora em hora sobre a frota inteira e reencontra as MESMAS
// evidências. Três garantias, e nenhuma delas é óbvia:
//
//   1. rodar de novo não empilha        (índice parcial de PENDING)
//   2. recusar não reoferece            (a linha REJECTED fica)
//   3. mas a evidência NOVA reoferece   (o evidenceHash)
//
// A terceira é a que quase ninguém implementa, e é a que o rollout do agente C#
// vai exercitar às centenas: máquina que não mandava serial passa a mandar, e
// "este endpoint é o ATV-00012" vira outra afirmação.

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId: await criarFabricante(api) });
});

afterAll(async () => {
  await api.fechar();
});

const pendentes = () => prisma.reconciliationSuggestion.count({ where: { state: 'PENDING' } });

describe('idempotência', () => {
  it('três rodadas do job não empilham a mesma sugestão', async () => {
    await criarAtivo(api, { statusId, modelId, name: 'pc-fila', serial: 'SN-FILA-1' });

    const agente = await conectarAgente(api, 'fila-1');
    await agente.handshake({ BiosSerial: 'SN-FILA-1', Hostname: 'pc-fila' });
    await esperarPor('a máquina da fila', () => prisma.endpoint.findUnique({ where: { hwid: 'fila-1' } }));
    await agente.fechar();

    await rodarReconciliacao();
    const depoisDaPrimeira = await pendentes();
    expect(depoisDaPrimeira).toBeGreaterThan(0);

    await rodarReconciliacao();
    await rodarReconciliacao();

    // Sem o índice parcial `sugestao_pendente_por_alvo`, uma semana de operação
    // viraria 168 cópias de cada sugestão — e a fila que deveria ser lida por
    // uma pessoa vira uma lista que ninguém abre duas vezes.
    expect(await pendentes()).toBe(depoisDaPrimeira);
  });
});

describe('memória da recusa', () => {
  it('recusar tira da fila, e o job não devolve', async () => {
    await criarAtivo(api, { statusId, modelId, name: 'pc-recusa', serial: 'SN-RECUSA-1' });

    const agente = await conectarAgente(api, 'recusa-1');
    await agente.handshake({ BiosSerial: 'SN-RECUSA-1', Hostname: 'pc-recusa' });
    await esperarPor('a máquina da recusa', () => prisma.endpoint.findUnique({ where: { hwid: 'recusa-1' } }));
    await agente.fechar();

    await rodarReconciliacao();

    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'recusa-1' } });
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, kind: 'LINK', state: 'PENDING' },
    });

    const recusa = await api.post(`/api/reconciliation/suggestions/${sugestao.id}/reject`);
    expect(recusa.status).toBe(200);

    await rodarReconciliacao();
    await rodarReconciliacao();

    expect(await prisma.reconciliationSuggestion.count({
      where: { endpointId: endpoint.id, kind: 'LINK', state: 'PENDING' },
    })).toBe(0);

    // A LINHA FICA. É ela que o `proporSugestao` consulta — apagá-la seria
    // perder a recusa e reoferecer na hora seguinte.
    expect(await prisma.reconciliationSuggestion.count({
      where: { endpointId: endpoint.id, state: 'REJECTED' },
    })).toBe(1);
  });

  it('mas a evidência NOVA volta para a fila', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'pc-evidencia' });

    // Primeiro contato SEM serial: o que casa é o hostname, 60 pontos.
    const agente = await conectarAgente(api, 'evidencia-1');
    await agente.handshake({ Hostname: 'pc-evidencia' });
    await esperarPor('a máquina sem serial', () => prisma.endpoint.findUnique({ where: { hwid: 'evidencia-1' } }));

    await rodarReconciliacao();

    const endpoint = await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'evidencia-1' } });
    const porHostname = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, assetId: ativo.id, state: 'PENDING' },
    });
    expect(porHostname.signal).toBe('HOSTNAME');

    // "Não": o hostname bate por coincidência, e quem opera sabe disso.
    await api.post(`/api/reconciliation/suggestions/${porHostname.id}/reject`);

    // ── AGORA O MUNDO MUDA: o agente é atualizado e passa a mandar o serial,
    // que casa com o MESMO ativo. É outra afirmação sobre o mesmo par.
    await prisma.asset.update({ where: { id: ativo.id }, data: { serial: 'SN-EVID-9' } });
    await agente.handshake({ Hostname: 'pc-evidencia', BiosSerial: 'SN-EVID-9' });
    await esperarPor('o serial chegar', async () => {
      const atual = await prisma.endpoint.findUnique({ where: { hwid: 'evidencia-1' } });
      return atual?.biosSerial ? atual : null;
    });
    await agente.fechar();

    await rodarReconciliacao();

    const nova = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: endpoint.id, assetId: ativo.id, state: 'PENDING' },
    });

    // Com uma recusa "burra" (booleano por par), esta sugestão estaria enterrada
    // para sempre — e ela é a CERTA.
    expect(nova.signal).toBe('SERIAL');
    expect(nova.score).toBe(100);
    expect(nova.evidenceHash).not.toBe(porHostname.evidenceHash);
  });
});

describe('o painel de cobertura fecha a conta', () => {
  it('cadastrados = comAgente + semAgente', async () => {
    const { status, body } = await api.get<{
      cadastrados: number; comAgente: number; semAgente: number;
      orfaos: number; descobertas: number; sugestoesPendentes: number;
    }>('/api/reconciliation/coverage');

    expect(status).toBe(200);
    // Contados um a um, um handshake no meio faria os números não fecharem — e
    // um painel que não soma é um painel em que ninguém confia. Por isso os dez
    // saem da mesma `$transaction`.
    expect(body.comAgente + body.semAgente).toBe(body.cadastrados);
    expect(body.orfaos).toBeLessThanOrEqual(body.descobertas);
  });
});
