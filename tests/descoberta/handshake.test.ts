import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { prisma } from '../../server/infra/database/prismaClient';

// A BORDA DO AGENTE: o handshake do SentinelAgente, com e sem os campos que a
// máquina nem sempre consegue coletar. Nenhum deles pode ser obrigatório.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const buscar = (hwid: string) => prisma.endpoint.findUnique({ where: { hwid } });

describe('o handshake sem identidade', () => {
  it('cria a máquina sem nenhum campo de identidade', async () => {
    const agente = await conectarAgente(api, 'hwid-agente-antigo');
    await agente.handshake();

    const endpoint = await esperarPor('a máquina antiga aparecer', () => buscar('hwid-agente-antigo'));

    expect(endpoint.hostname).toBe('maquina-de-teste');
    expect(endpoint.status).toBe('ONLINE');
    expect(endpoint.biosSerial).toBeNull();
    expect(endpoint.systemUuid).toBeNull();

    await agente.fechar();
  });
});

describe('o handshake novo traz identidade', () => {
  it('grava a identidade vinda em PascalCase', async () => {
    const agente = await conectarAgente(api, 'hwid-agente-novo');
    await agente.handshake({
      Hostname: 'PC-ANA',
      BiosSerial: 'SN-ABC-123',
      SystemUuid: '4c4c4544-0031-4a10-8051-b7c04f584d32',
      MacAddress: '00-1A-2B-3C-4D-5E',
    });

    const endpoint = await esperarPor('a máquina nova aparecer', async () => {
      const achado = await buscar('hwid-agente-novo');
      return achado?.biosSerial ? achado : null;
    });

    expect(endpoint.biosSerial).toBe('SN-ABC-123');
    expect(endpoint.systemUuid).toBe('4c4c4544-0031-4a10-8051-b7c04f584d32');

    await agente.fechar();
  });
});

describe('o inventário que a aba Máquina mostra (DA)', () => {
  const placa = { Name: 'UHD Graphics 630', MemoryBytes: null };

  it('grava o fabricante, o modelo e as placas de vídeo', async () => {
    const agente = await conectarAgente(api, 'hwid-inventario');
    await agente.handshake({
      Hostname: 'pc-inventario', Manufacturer: 'Dell Inc.', HardwareModel: 'OptiPlex 7080', Gpus: [placa],
    });

    const endpoint = await esperarPor('o inventário gravado', async () => {
      const achado = await buscar('hwid-inventario');
      return achado?.manufacturer ? achado : null;
    });

    expect(endpoint.hardwareModel).toBe('OptiPlex 7080');
    expect(endpoint.gpus).toEqual([placa]);

    // O HANDSHAKE QUE NÃO TRAZ A LISTA NÃO A APAGA, como a série: a leitura que
    // falhou numa conexão não é a placa que saiu da máquina.
    await agente.handshake({ Hostname: 'pc-inventario-2' });
    const depois = await esperarPor('o segundo handshake', async () => {
      const achado = await buscar('hwid-inventario');
      return achado?.hostname === 'pc-inventario-2' ? achado : null;
    });
    expect(depois.gpus).toEqual([placa]);
    expect(depois.manufacturer).toBe('Dell Inc.');

    await agente.fechar();
  });
});

describe('a versão do agente (DE)', () => {
  it('grava o AgentVersion, devolve na lista e na aba Máquina, e o handshake sem ela a apaga', async () => {
    const agente = await conectarAgente(api, 'hwid-versao');
    await agente.handshake({ Hostname: 'pc-versao', AgentVersion: '0.2.0' });
    const endpoint = await esperarPor('a versão gravada', async () => {
      const achado = await buscar('hwid-versao');
      return achado?.agentVersion ? achado : null;
    });
    expect(endpoint.agentVersion).toBe('0.2.0');

    const lista = await api.get<{ rows: { id: string; agentVersion: string | null }[] }>('/api/endpoints');
    expect(lista.body.rows.find((linha) => linha.id === endpoint.id)?.agentVersion).toBe('0.2.0');
    expect((await api.get<{ agentVersion: string | null }>(`/api/endpoints/${endpoint.id}`)).body.agentVersion).toBe('0.2.0');

    // AO CONTRÁRIO DA SÉRIE: o handshake sem versão é de um agente que não
    // a manda (reinstalado com o pacote velho), e a versão gravada mentiria.
    await agente.handshake({ Hostname: 'pc-versao-velha' });
    const depois = await esperarPor('o handshake do agente velho', async () => {
      const achado = await buscar('hwid-versao');
      return achado?.hostname === 'pc-versao-velha' ? achado : null;
    });
    expect(depois.agentVersion).toBeNull();

    await agente.fechar();
  });
});
