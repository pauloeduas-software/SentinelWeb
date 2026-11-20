import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import {
  markStaleEndpointsOffline,
  STALE_AFTER_MS,
} from '../../server/modules/endpoint/use-cases/mark-stale-endpoints-offline.usecase';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';

// A MÁQUINA QUE SUMIU SEM FECHAR A CONEXÃO — o limite do CS sob teste.
//
// O agente manda `Ping` depois de 30 a 60 s sem mandar nada, e o job de zumbis derruba quem está
// calado há mais de 2 minutos. A folga entre os dois é o que impede uma rede
// lenta de pôr OFFLINE uma máquina viva: o primeiro caso é ela.

let api: ApiDeTeste;

beforeAll(async () => {
  // O job roda sem a app; ela sobe para o `prisma` apontar para o banco de teste e
  // para o `Ping` ter com quem falar.
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

async function maquinaCalada(ha: number) {
  return prisma.endpoint.create({
    data: { hwid: randomUUID(), hostname: 'pc-calado', osVersion: 'Ubuntu 24.04', lastSeen: new Date(Date.now() - ha) },
  });
}

describe('o job de zumbis', () => {
  it('o limite são 2 minutos: o maior intervalo do Ping mais 60 s de folga', () => {
    expect(STALE_AFTER_MS).toBe(2 * 60 * 1000);
  });

  it('não derruba a máquina que atrasou o Ping dentro da folga', async () => {
    const maquina = await maquinaCalada(90 * 1000);

    await markStaleEndpointsOffline();

    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: maquina.id } })).status).toBe('ONLINE');
  });

  it('põe OFFLINE a máquina calada há mais de 2 minutos', async () => {
    const maquina = await maquinaCalada(STALE_AFTER_MS + 1000);

    await markStaleEndpointsOffline();

    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: maquina.id } })).status).toBe('OFFLINE');
  });
});

describe('o Ping', () => {
  it('põe de volta como Conectado a máquina que o job tinha derrubado', async () => {
    const agente = await conectarAgente(api, 'hwid-do-ping');
    await agente.handshake({ Hostname: 'pc-do-ping' });
    await esperarPor('a máquina do handshake', () => prisma.endpoint.findUnique({ where: { hwid: 'hwid-do-ping' } }));
    const calada = new Date(Date.now() - STALE_AFTER_MS - 1000);
    await prisma.endpoint.update({ where: { hwid: 'hwid-do-ping' }, data: { lastSeen: calada } });
    await markStaleEndpointsOffline();
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { hwid: 'hwid-do-ping' } })).status).toBe('OFFLINE');

    await agente.ping();

    const depois = await esperarPor('o Ping gravado', async () => {
      const achado = await prisma.endpoint.findUnique({ where: { hwid: 'hwid-do-ping' } });
      return achado?.status === 'ONLINE' ? achado : null;
    });
    expect(depois.lastSeen.getTime()).toBeGreaterThan(calada.getTime());

    await agente.fechar();
  });
});
