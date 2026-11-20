import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { prisma } from '../../server/infra/database/prismaClient';

// AS LISTAS QUE VÃO PARA COLUNA JSON (DB): o `Gpus` do handshake e o `Disks` da
// telemetria. O banco guarda o que a tela lê, item por item, e nada além: nem o
// campo do agente antigo, nem o item sem nome, nem a lista sem fim.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('o Gpus do handshake', () => {
  it('grava só o nome e a memória, sem o item sem nome', async () => {
    const agente = await conectarAgente(api, 'hwid-placas');
    await agente.handshake({
      Gpus: [
        // O agente antigo mandava o fabricante e o PCI de cada placa.
        { Name: 'GeForce MX150', Manufacturer: 'NVIDIA', PciSlot: '0000:01:00.0', MemoryBytes: 2147483648 },
        { MemoryBytes: 1073741824 },
        'texto solto',
      ],
    });

    const endpoint = await esperarPor('as placas gravadas', () =>
      prisma.endpoint.findFirst({ where: { hwid: 'hwid-placas', gpus: { not: undefined } } }));

    expect(endpoint.gpus).toEqual([{ Name: 'GeForce MX150', MemoryBytes: 2147483648 }]);

    await agente.fechar();
  });

  it('para em 16 placas', async () => {
    const agente = await conectarAgente(api, 'hwid-placas-demais');
    await agente.handshake({
      Gpus: Array.from({ length: 40 }, (_, indice) => ({ Name: `Placa ${indice}` })),
    });

    const endpoint = await esperarPor('as placas gravadas', () =>
      prisma.endpoint.findFirst({ where: { hwid: 'hwid-placas-demais', gpus: { not: undefined } } }));

    expect(endpoint.gpus).toHaveLength(16);

    await agente.fechar();
  });
});

describe('o Disks da telemetria', () => {
  it('grava só o nome, o tamanho e o ocupado, e para em 64 discos', async () => {
    const agente = await conectarAgente(api, 'hwid-discos');
    await agente.handshake();
    // Telemetria antes de a máquina existir é descartada: espera o handshake.
    await esperarPor('a máquina do handshake', () => prisma.endpoint.findUnique({ where: { hwid: 'hwid-discos' } }));
    await agente.telemetria({
      Disks: [
        { Name: '/', TotalGb: 476.9, UsedGb: 120.4, FileSystem: 'ext4' },
        { TotalGb: 10, UsedGb: 1 },
        ...Array.from({ length: 80 }, (_, indice) => ({ Name: `/mnt/d${indice}`, TotalGb: 1, UsedGb: 0 })),
      ],
    });

    const amostra = await esperarPor('a amostra gravada', () =>
      prisma.telemetry.findFirst({ where: { endpoint: { hwid: 'hwid-discos' } } }));

    const discos = amostra.disks as unknown[];
    expect(discos).toHaveLength(64);
    expect(discos[0]).toEqual({ Name: '/', TotalGb: 476.9, UsedGb: 120.4 });

    await agente.fechar();
  });
});
