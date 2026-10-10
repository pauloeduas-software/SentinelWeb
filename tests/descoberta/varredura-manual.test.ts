import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// RECONCILIAR AGORA — `POST /api/reconciliation/run`.
//
// A varredura roda de hora em hora e toma a janela da hora (D79): quem cadastra
// o ativo às 10h05 e quer ver a sugestão nascer esperava as 11h, ou reiniciava
// o servidor — e reiniciar dentro da mesma hora não roda nada, porque a janela
// já foi tomada. A rota é a mesma função do job, sem a janela.
//
// Três coisas, e a terceira é a que não se vê: o placar sai na resposta; é de
// `ADMIN`; e é UMA por vez — a segunda chamada enquanto a primeira roda é 409,
// não uma segunda varredura por cima da primeira.

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

interface Placar {
  endpoints: number; sugeridas: number; vinculadas: number; encerradas: number;
}

describe('POST /api/reconciliation/run', () => {
  it('varre agora e devolve o placar: a sugestão nasce sem esperar a hora virar', async () => {
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'pc-agora', serial: 'SN-AGORA-1' });

    const agente = await conectarAgente(api, 'agora-1');
    await agente.handshake({ BiosSerial: 'SN-AGORA-1', Hostname: 'pc-agora' });
    const maquina = await esperarPor('a máquina de agora', () => prisma.endpoint.findUnique({ where: { hwid: 'agora-1' } }));
    await agente.fechar();

    // Antes do clique: nada. Nenhuma rodada rodou — o harness não liga o job.
    expect(await prisma.reconciliationSuggestion.count({ where: { endpointId: maquina.id } })).toBe(0);

    const { status, body } = await api.post<Placar>('/api/reconciliation/run');

    expect(status).toBe(200);
    expect(body.endpoints).toBeGreaterThanOrEqual(1);
    expect(body.sugeridas).toBeGreaterThanOrEqual(1);

    const sugestao = await prisma.reconciliationSuggestion.findFirst({
      where: { endpointId: maquina.id, kind: 'LINK', state: 'PENDING' },
    });
    expect(sugestao?.assetId).toBe(ativo.id);
  });

  it('é de ADMIN: o técnico leva 403', async () => {
    const tecnico = await api.comoUsuario('TECNICO');
    const { status } = await tecnico.post('/api/reconciliation/run');
    expect(status).toBe(403);
  });

  it('duas ao mesmo tempo: uma varre, a outra é 409', async () => {
    // Sem `await` entre as duas: a primeira marca "em andamento" antes de
    // ceder ao banco, e a segunda chega com a marca ligada. Uma varredura só.
    const [a, b] = await Promise.all([
      api.post<{ error?: string }>('/api/reconciliation/run'),
      api.post<{ error?: string }>('/api/reconciliation/run'),
    ]);

    const status = [a.status, b.status].sort();
    expect(status).toEqual([200, 409]);
    const recusada = a.status === 409 ? a : b;
    expect(recusada.body.error).toMatch(/em andamento/i);

    // E depois de terminar, roda de novo: a marca é da rodada, não do dia.
    expect((await api.post('/api/reconciliation/run')).status).toBe(200);
  });
});
