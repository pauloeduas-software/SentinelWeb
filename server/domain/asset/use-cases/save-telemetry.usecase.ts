import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { TelemetryData } from '../../shared/agent-protocol.types';
import { shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('asset.telemetry');

// Grava uma amostra de uso. Telemetria de máquina desconhecida é descartada:
// sem o Handshake não existe registro a que a amostra pertença.
export async function saveTelemetry(data: TelemetryData): Promise<void> {
  const asset = await prisma.asset.findUnique({
    where: { hwid: data.hwid },
    select: { id: true },
  });

  if (!asset) {
    logger.warn(`[Asset] Telemetria de ${shortHwid(data.hwid)} descartada: máquina sem Handshake.`);
    return;
  }

  await prisma.telemetry.create({
    data: {
      assetId: asset.id,
      cpuUsage: data.cpuUsage,
      ramTotal: data.ramTotal,
      ramUsed: data.ramUsed,
      disks: data.disks as Prisma.InputJsonValue,
      network: data.network as Prisma.InputJsonValue,
      topProcesses: data.topProcesses as Prisma.InputJsonValue,
    },
  });
}
