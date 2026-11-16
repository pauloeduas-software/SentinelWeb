import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import type { HandshakeData } from '../../shared/agent-protocol.types';
import { shortHwid } from '../helpers/hwid.helper';
import { herdarMaquinaReinstalada } from './adopt-reinstalled-endpoint.usecase';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('endpoint.handshake');

// Primeiro contato (ou re-sincronização) de uma máquina: cria o registro ou
// atualiza o inventário dela. O HWID já vem normalizado do parser.
export async function registerHandshake(data: HandshakeData): Promise<void> {
  // `?? undefined` na identidade, e não `?? null`: em Prisma, `undefined`
  // significa NÃO ESCREVA e `null` significa APAGUE. O serial que não veio
  // neste handshake (a leitura do firmware falhou) não apaga o que já estava, e
  // com ele o vínculo que a reconciliação já tinha resolvido. O fabricante, o
  // modelo e as placas de vídeo seguem a mesma regra.
  const inventory = {
    hostname: data.hostname,
    osVersion: data.osVersion,
    macAddress: data.macAddress,
    localIp: data.localIp,
    cpuModel: data.cpuModel,
    biosSerial: data.biosSerial ?? undefined,
    systemUuid: data.systemUuid ?? undefined,
    manufacturer: data.manufacturer ?? undefined,
    hardwareModel: data.hardwareModel ?? undefined,
    gpus: data.gpus as Prisma.InputJsonValue[] | undefined,
  };

  // HWID NUNCA VISTO PODE SER UMA MÁQUINA CONHECIDA, REINSTALADA (CV): o HWID é
  // da instalação do agente, e o firmware diz se a máquina é outra. Herdando,
  // a linha antiga passa a ter este HWID, e o `upsert` abaixo a atualiza.
  const conhecida = await prisma.endpoint.findUnique({ where: { hwid: data.hwid }, select: { id: true } });
  if (!conhecida) await herdarMaquinaReinstalada(data);

  await prisma.endpoint.upsert({
    where: { hwid: data.hwid },
    update: { ...inventory, status: 'ONLINE', lastSeen: new Date() },
    create: { hwid: data.hwid, ...inventory, status: 'ONLINE' },
    select: { id: true },
  });

  logger.info(`[Endpoint] Handshake de ${shortHwid(data.hwid)} (${data.hostname})`);
}
