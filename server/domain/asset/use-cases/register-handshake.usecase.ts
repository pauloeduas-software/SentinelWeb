import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { HandshakeData } from '../../shared/agent-protocol.types';
import { shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('asset.handshake');

// Primeiro contato (ou re-sincronização) de uma máquina: cria o registro ou
// atualiza o inventário dela. O HWID já vem normalizado do parser.
export async function registerHandshake(data: HandshakeData): Promise<void> {
  const inventory = {
    hostname: data.hostname,
    osVersion: data.osVersion,
    macAddress: data.macAddress,
    localIp: data.localIp,
    cpuModel: data.cpuModel,
    // Campo Json: ausente vira `undefined` (não escreve) em vez de null
    installedSoftware: (data.installedSoftware ?? undefined) as Prisma.InputJsonValue | undefined,
  };

  await prisma.asset.upsert({
    where: { hwid: data.hwid },
    update: { ...inventory, status: 'ONLINE', lastSeen: new Date() },
    create: { hwid: data.hwid, ...inventory, status: 'ONLINE' },
  });

  logger.info(`[Asset] Handshake de ${shortHwid(data.hwid)} (${data.hostname})`);
}
