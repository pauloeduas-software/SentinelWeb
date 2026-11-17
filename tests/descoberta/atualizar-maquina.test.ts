import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { atualizarMaquina } from '../../server/modules/endpoint/use-cases/refresh-endpoint.usecase';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor, type AgenteDeTeste } from '../helpers/agente';

// ATUALIZAR AGORA (DK) — `POST /api/endpoints/:id/refresh`.
//
// O 200 diz que a máquina RESPONDEU, e não só que o pedido saiu: a rota manda o
// `REFRESH` e volta quando o handshake e a telemetria que ele provocou estão
// gravados. O agente de teste faz o papel do SentinelAgente 0.2.0: lê o pedido do
// outro lado do socket e responde com o inventário novo.

const UUID_QUE_NAO_EXISTE = '00000000-0000-0000-0000-000000000000';

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

/** Uma máquina conectada, com o agente na versão dada. */
async function maquina(hwid: string, versao: string | null): Promise<{ agente: AgenteDeTeste; id: string }> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid, LocalIp: '10.0.0.10', ...(versao ? { AgentVersion: versao } : {}) });
  const { id } = await esperarPor('a máquina do handshake', () => prisma.endpoint.findUnique({ where: { hwid } }));
  return { agente, id };
}

/** O agente 0.2.0: lê o `REFRESH` e manda o inventário e a telemetria de novo. */
async function responder(agente: AgenteDeTeste, inventario: Record<string, unknown>): Promise<void> {
  const pedido = await agente.receber('o pedido de atualização');
  expect(pedido).toMatchObject({ Type: 'Command', Payload: { Action: 'REFRESH' } });
  await agente.handshake({ Hostname: agente.hwid, AgentVersion: '0.2.0', ...inventario });
  await agente.telemetria({ CpuUsagePercentage: 77 });
}

describe('com o agente que entende o pedido', () => {
  it('volta quando a máquina respondeu, com o inventário e a telemetria já gravados, e o Técnico pode', async () => {
    const { agente, id } = await maquina('atualizar-ok', '0.2.0');
    const tecnico = await api.comoUsuario('TECNICO');

    const [{ status, body }] = await Promise.all([
      tecnico.post<{ message: string }>(`/api/endpoints/${id}/refresh`, {}),
      responder(agente, { LocalIp: '10.0.0.99' }),
    ]);

    expect(status).toBe(200);
    expect(body.message).toBe('Máquina atualizada.');
    // Já gravados quando a rota volta: a ficha relida mostra o dado novo.
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id } })).localIp).toBe('10.0.0.99');
    expect((await prisma.telemetry.findFirstOrThrow({ where: { endpointId: id }, orderBy: { timestamp: 'desc' } })).cpuUsage).toBe(77);

    // Quem pediu fica na auditoria, como o comando (AB).
    const linha = await prisma.auditLog.findFirstOrThrow({ where: { action: 'COMMAND', entityId: id } });
    expect(linha).toMatchObject({ actorId: tecnico.userId, changes: { comando: 'REFRESH' } });
    await agente.fechar();
  });

  it('dois pedidos juntos esperam a mesma resposta, e só um sai para a máquina', async () => {
    const { agente, id } = await maquina('atualizar-duplo', '0.3.1');

    const [primeiro, segundo] = await Promise.all([
      api.post(`/api/endpoints/${id}/refresh`, {}),
      api.post(`/api/endpoints/${id}/refresh`, {}),
      responder(agente, {}),
    ]);

    expect([primeiro.status, segundo.status]).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { action: 'COMMAND', entityId: id } })).toBe(1);
    await agente.fechar();
  });

  it('sem resposta no prazo é 504, e diz que os dados ficaram como estavam', async () => {
    const { agente, id } = await maquina('atualizar-mudo', '0.2.0');

    // Pelo use-case, com prazo curto: pela rota seriam 15 s de espera.
    await expect(atualizarMaquina(id, { tipo: 'SYSTEM', origem: 'teste' }, 200)).rejects.toMatchObject({
      status: 504,
      message: 'atualizar-mudo não respondeu em 0.2 s. Os dados ficam como estavam; tente de novo em instantes.',
    });
    await agente.fechar();
  });
});

describe('quem espera junto', () => {
  it('recebe a mesma recusa de quem pediu primeiro', async () => {
    const { agente, id } = await maquina('atualizar-junto-mudo', '0.2.0');
    const sistema = { tipo: 'SYSTEM' as const, origem: 'teste' };

    const [primeiro, segundo] = await Promise.allSettled([
      atualizarMaquina(id, sistema, 200),
      atualizarMaquina(id, sistema, 200),
    ]);

    expect(primeiro).toMatchObject({ status: 'rejected', reason: { status: 504 } });
    expect(segundo).toMatchObject({ status: 'rejected', reason: { status: 504 } });
    // Um pedido só saiu para a máquina.
    expect(await prisma.auditLog.count({ where: { action: 'COMMAND', entityId: id } })).toBe(1);
    await agente.fechar();
  });
});

describe('o que a rota recusa', () => {
  it('o agente anterior à 0.2.0 é 409, e o pedido não sai', async () => {
    const { agente, id } = await maquina('atualizar-velho', '0.1.0');

    const { status, body } = await api.post<{ error: string }>(`/api/endpoints/${id}/refresh`, {});

    expect(status).toBe(409);
    expect(body.error).toBe('O agente de atualizar-velho é anterior à versão 0.2.0 e não atualiza sob pedido. Atualize o agente da máquina.');
    expect(await prisma.auditLog.count({ where: { action: 'COMMAND', entityId: id } })).toBe(0);
    await agente.fechar();
  });

  it('o agente que não informa a versão também é 409', async () => {
    const { agente, id } = await maquina('atualizar-sem-versao', null);
    expect((await api.post(`/api/endpoints/${id}/refresh`, {})).status).toBe(409);
    await agente.fechar();
  });

  it('a máquina desconectada é 409', async () => {
    const { agente, id } = await maquina('atualizar-caida', '0.2.0');
    await agente.fechar();
    await esperarPor('a máquina virar OFFLINE', async () => {
      const agora = await prisma.endpoint.findUnique({ where: { id }, select: { status: true } });
      return agora?.status === 'OFFLINE' ? agora : null;
    });

    const { status, body } = await api.post<{ error: string }>(`/api/endpoints/${id}/refresh`, {});
    expect(status).toBe(409);
    expect(body.error).toBe('O agente de atualizar-caida não está conectado agora.');
  });

  it('uuid que não é de máquina nenhuma é 404', async () => {
    expect((await api.post(`/api/endpoints/${UUID_QUE_NAO_EXISTE}/refresh`, {})).status).toBe(404);
  });
});
