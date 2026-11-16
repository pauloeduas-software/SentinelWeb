import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { expurgarTelemetriaAntiga } from '../../server/modules/endpoint/use-cases/purge-telemetry.usecase';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';

// O EXPURGO GUARDA SÓ A ÚLTIMA AMOSTRA DE CADA MÁQUINA (DA): é a única que a aba
// Máquina lê. As amostras entram pelo banco porque o protocolo não tem a hora da
// coleta: pelo agente, todas nasceriam com a hora da chegada.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

async function maquina(hwid: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: hwid });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  return endpoint.id;
}

const amostra = (endpointId: string, horasAtras: number, cpuUsage: number) => ({
  endpointId, cpuUsage, ramTotal: 8589934592n, ramUsed: 4294967296n,
  timestamp: new Date(Date.now() - horasAtras * 60 * 60 * 1000),
});

describe('o expurgo da telemetria', () => {
  it('apaga as amostras mais velhas e guarda a última, mesmo a de uma semana atrás', async () => {
    const ligada = await maquina('expurgo-ligada');
    const desligada = await maquina('expurgo-desligada');
    await prisma.telemetry.createMany({
      data: [
        amostra(ligada, 3, 10), amostra(ligada, 2, 20), amostra(ligada, 1, 30),
        amostra(desligada, 24 * 8, 40), amostra(desligada, 24 * 7, 50),
      ],
    });

    await expurgarTelemetriaAntiga();

    const restantes = await prisma.telemetry.findMany({
      where: { endpointId: { in: [ligada, desligada] } },
      select: { endpointId: true, cpuUsage: true },
    });
    expect(restantes).toHaveLength(2);
    expect(restantes).toContainEqual({ endpointId: ligada, cpuUsage: 30 });
    expect(restantes).toContainEqual({ endpointId: desligada, cpuUsage: 50 });
  });
});
