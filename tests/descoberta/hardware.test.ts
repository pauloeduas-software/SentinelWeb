import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';
import { mudancasDeHardware } from '../../server/domain/reconciliation/helpers/hardware-diff.helper';
import { prisma } from '../../server/core/database/prismaClient';

// A `AssetChange` GANHA ESCRITOR — "esta máquina trocou de peça".
//
// A tabela nasceu na Etapa B e ficou sem ninguém escrevendo nela: o índice
// existia, a FK existia, e nenhuma linha entrava. Tabela sem escritor é uma
// promessa no schema que a tela não cumpre.
//
// Os dois primeiros blocos são puros (a regra do que conta como mudança); o
// terceiro entra por WebSocket de verdade, porque é o handshake que traz o ANTES
// e o DEPOIS no mesmo instante — e é lá que o defeito apareceria (D99).

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId,
    fabricanteId: await criarFabricante(api),
  });
});

afterAll(async () => {
  await api.fechar();
});

const VAZIO = {
  manufacturer: null, hardwareModel: null, chassisType: null,
  biosSerial: null, systemUuid: null, cpuModel: null, osVersion: null,
  ramTotalBytes: null, diskTotalBytes: null,
};

describe('o que NÃO é mudança de hardware', () => {
  it('a primeira coleta de um campo não é troca de peça', () => {
    // O rollout do agente C# vai produzir isso às centenas no mesmo dia — 500
    // máquinas ganhando `biosSerial` de uma vez. Contar como mudança
    // transformaria o histórico de cada ativo num relatório de deploy.
    const depois = { ...VAZIO, biosSerial: 'ABC123', ramTotalBytes: 17179869184n };
    expect(mudancasDeHardware(VAZIO, depois)).toEqual([]);
  });

  it('campo que sumiu não é peça que sumiu — é coleta que falhou (D106)', () => {
    const antes = { ...VAZIO, ramTotalBytes: 17179869184n };
    expect(mudancasDeHardware(antes, VAZIO)).toEqual([]);
  });

  it('espaço nas pontas e caixa vazia não são diferença', () => {
    const antes = { ...VAZIO, manufacturer: 'Dell' };
    const depois = { ...VAZIO, manufacturer: '  Dell  ' };
    expect(mudancasDeHardware(antes, depois)).toEqual([]);

    // String vazia é ausência escrita de outro jeito, não um fabricante novo.
    expect(mudancasDeHardware(antes, { ...VAZIO, manufacturer: '   ' })).toEqual([]);
  });
});

describe('o que É mudança de hardware', () => {
  it('pente de memória trocado entra com os dois valores', () => {
    const antes = { ...VAZIO, ramTotalBytes: 8589934592n };
    const depois = { ...VAZIO, ramTotalBytes: 17179869184n };

    expect(mudancasDeHardware(antes, depois)).toEqual([
      { field: 'ramTotalBytes', oldValue: '8589934592', newValue: '17179869184' },
    ]);
  });

  it('duas trocas no mesmo handshake dão duas linhas', () => {
    const antes = { ...VAZIO, hardwareModel: 'Latitude 5440', diskTotalBytes: 256060514304n };
    const depois = { ...VAZIO, hardwareModel: 'Latitude 5450', diskTotalBytes: 512110190592n };

    const mudancas = mudancasDeHardware(antes, depois);
    expect(mudancas.map((mudanca) => mudanca.field).sort()).toEqual(['diskTotalBytes', 'hardwareModel']);
  });
});

describe('pelo agente de verdade, e só quando há ativo', () => {
  it('máquina NOVA não nasce com histórico de mudança', async () => {
    const agente = await conectarAgente(api, 'hwid-hardware-novo');
    await agente.handshake({ Manufacturer: 'Dell', RamTotalBytes: 8589934592 });

    await esperarPor('a máquina aparecer', () => prisma.endpoint.findUnique({
      where: { hwid: 'hwid-hardware-novo' },
    }));

    expect(await prisma.assetChange.count()).toBe(0);
    await agente.fechar();
  });

  it('⚠️ a troca só vira linha quando a máquina TEM ativo — e aí vira', async () => {
    const hwid = 'hwid-hardware-trocado';
    const agente = await conectarAgente(api, hwid);

    // Primeiro handshake: estabelece o ANTES.
    await agente.handshake({ Manufacturer: 'Dell', RamTotalBytes: 8589934592 });
    const endpoint = await esperarPor('a máquina aparecer', () => prisma.endpoint.findUnique({ where: { hwid } }));

    // Troca ANTES do vínculo: a pergunta que a tabela responde é do patrimônio,
    // e máquina órfã não tem patrimônio para contestar.
    await agente.handshake({ Manufacturer: 'Dell', RamTotalBytes: 17179869184 });
    await esperarPor('a memória mudar no endpoint', async () => {
      const atual = await prisma.endpoint.findUnique({ where: { hwid } });
      return atual?.ramTotalBytes === 17179869184n ? atual : null;
    });
    expect(await prisma.assetChange.count({ where: { endpointId: endpoint.id } })).toBe(0);

    // Agora vincula, e troca de novo.
    const ativo = await criarAtivo(api, { statusId, modelId, name: 'Notebook do teste de hardware' });
    await api.post(`/api/endpoints/${endpoint.id}/link`, { assetId: ativo.id });

    await agente.handshake({ Manufacturer: 'Dell', RamTotalBytes: 34359738368 });

    const mudanca = await esperarPor('a mudança de memória ser detectada', () =>
      prisma.assetChange.findFirst({ where: { assetId: ativo.id, field: 'ramTotalBytes' } }));

    expect(mudanca.oldValue).toBe('17179869184');
    expect(mudanca.newValue).toBe('34359738368');
    expect(mudanca.endpointId).toBe(endpoint.id);

    // E a aba Máquina mostra as duas coisas: a spec de agora e de onde ela veio.
    const { body } = await api.get<{
      especificacoes: { ramTotalBytes: string | null; manufacturer: string | null } | null;
      mudancas: { field: string }[];
    }>(`/api/assets/${ativo.id}/machine`);

    // STRING, e não número: `BigInt` não sobrevive ao `JSON.stringify`, e a rota
    // morreria com "Do not know how to serialize a BigInt" se a conversão saísse.
    expect(body.especificacoes?.ramTotalBytes).toBe('34359738368');
    expect(body.especificacoes?.manufacturer).toBe('Dell');
    expect(body.mudancas.map((linha) => linha.field)).toContain('ramTotalBytes');

    await agente.fechar();
  });
});
