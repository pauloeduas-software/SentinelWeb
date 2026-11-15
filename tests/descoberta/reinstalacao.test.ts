import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor, type AgenteDeTeste } from '../helpers/agente';

// A MÁQUINA REINSTALADA HERDA A PRÓPRIA LINHA (CV).
//
// O HWID é da instalação do agente: formatar a máquina dá um HWID novo, e é o
// firmware que diz que ela é a mesma — com as regras do GLPI, e duas travas a
// mais (um candidato só, e desligado). Cada caso usa um serial próprio, porque
// o banco é o mesmo para o arquivo inteiro.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

const buscar = (hwid: string) => prisma.endpoint.findUnique({ where: { hwid } });

/** Conecta, apresenta a máquina e espera o handshake ser gravado. */
async function apresentar(hwid: string, firmware: Record<string, unknown>): Promise<AgenteDeTeste> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: `pc-${hwid}`, ...firmware });
  await esperarPor(`o handshake de ${hwid}`, () => buscar(hwid));
  return agente;
}

/** Desliga o agente e espera a máquina ficar OFFLINE. */
async function desligar(agente: AgenteDeTeste): Promise<void> {
  await agente.fechar();
  await esperarPor(`${agente.hwid} ficar offline`, async () => {
    const linha = await buscar(agente.hwid);
    return linha?.status === 'OFFLINE' ? linha : null;
  });
}

describe('a máquina desligada, instalada de novo, continua a mesma', () => {
  it('serial e UUID iguais: a linha antiga ganha o HWID novo, e o token velho morre', async () => {
    const firmware = { BiosSerial: 'SN-REINST-0001', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a01' };
    const velho = await apresentar('reinst-1-velho', firmware);
    const antiga = await buscar('reinst-1-velho');
    await desligar(velho);

    const novo = await apresentar('reinst-1-novo', firmware);

    const herdada = await buscar('reinst-1-novo');
    expect(herdada?.id).toBe(antiga?.id);
    expect(await buscar('reinst-1-velho')).toBeNull();
    expect(await prisma.agentCredential.findUnique({ where: { hwid: 'reinst-1-velho' } })).toBeNull();

    const auditoria = await prisma.auditLog.findFirst({ where: { entityId: antiga!.id, action: 'REINSTALL' } });
    expect(auditoria?.changes).toEqual({ hwid: { de: 'reinst-1-velho', para: 'reinst-1-novo' } });

    await novo.fechar();
  });

  it('a linha antiga sem UUID herda pelo serial (a regra 12 do GLPI)', async () => {
    const velho = await apresentar('reinst-2-velho', { BiosSerial: 'SN-REINST-0002' });
    const antiga = await buscar('reinst-2-velho');
    await desligar(velho);

    const novo = await apresentar('reinst-2-novo', {
      BiosSerial: 'SN-REINST-0002', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a02',
    });

    expect((await buscar('reinst-2-novo'))?.id).toBe(antiga?.id);
    await novo.fechar();
  });

  it('o handshake sem UUID herda pelo serial (a regra 14 do GLPI)', async () => {
    const velho = await apresentar('reinst-3-velho', {
      BiosSerial: 'SN-REINST-0003', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a03',
    });
    const antiga = await buscar('reinst-3-velho');
    await desligar(velho);

    const novo = await apresentar('reinst-3-novo', { BiosSerial: 'SN-REINST-0003' });

    expect((await buscar('reinst-3-novo'))?.id).toBe(antiga?.id);
    await novo.fechar();
  });
});

describe('na dúvida, a máquina nasce nova', () => {
  it('a máquina antiga ainda ligada não é tomada: o outro agente é um clone', async () => {
    const firmware = { BiosSerial: 'SN-REINST-0004', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a04' };
    const ligada = await apresentar('reinst-4-ligada', firmware);
    const clone = await apresentar('reinst-4-clone', firmware);

    expect(await buscar('reinst-4-ligada')).not.toBeNull();
    expect((await buscar('reinst-4-clone'))?.id).not.toBe((await buscar('reinst-4-ligada'))?.id);

    await ligada.fechar();
    await clone.fechar();
  });

  it('o mesmo serial com outro UUID é outra máquina (a regra 13 do GLPI)', async () => {
    const velho = await apresentar('reinst-5-velho', {
      BiosSerial: 'SN-REINST-0005', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a05',
    });
    await desligar(velho);

    const outra = await apresentar('reinst-5-outra', {
      BiosSerial: 'SN-REINST-0005', SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a55',
    });

    expect(await buscar('reinst-5-velho')).not.toBeNull();
    await outra.fechar();
  });

  it('o UUID sozinho não basta', async () => {
    const uuid = { SystemUuid: '7d3a1c20-5b4e-4f61-9a2b-1c0d9e8f7a06' };
    const velho = await apresentar('reinst-6-velho', uuid);
    await desligar(velho);

    const outra = await apresentar('reinst-6-outra', uuid);

    expect(await buscar('reinst-6-velho')).not.toBeNull();
    await outra.fechar();
  });

  it('o serial de fábrica não reconhece ninguém', async () => {
    const velho = await apresentar('reinst-7-velho', { BiosSerial: 'To Be Filled By O.E.M.' });
    await desligar(velho);

    const outra = await apresentar('reinst-7-outra', { BiosSerial: 'To Be Filled By O.E.M.' });

    expect(await buscar('reinst-7-velho')).not.toBeNull();
    await outra.fechar();
  });

  it('o serial de duas máquinas desligadas é evidência zero (D46)', async () => {
    const primeira = await apresentar('reinst-8-a', { BiosSerial: 'SN-REINST-0008' });
    const segunda = await apresentar('reinst-8-b', { BiosSerial: 'SN-REINST-0008' });
    await desligar(primeira);
    await desligar(segunda);

    const nova = await apresentar('reinst-8-nova', { BiosSerial: 'SN-REINST-0008' });

    expect(await buscar('reinst-8-a')).not.toBeNull();
    expect(await buscar('reinst-8-b')).not.toBeNull();
    await nova.fechar();
  });
});
