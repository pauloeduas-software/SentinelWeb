import { FastifyInstance } from 'fastify';
import { prisma } from '../core/db';
import { sanitizeHwid } from '../core/utils';

export async function handleHandshake(payload: any) {
  const hwid = sanitizeHwid(payload.Hwid || payload.hwid);
  const hostname = payload.Hostname || payload.hostname;
  const osVersion = payload.OsVersion || payload.osVersion;
  const macAddress = payload.MacAddress || payload.macAddress;
  const localIp = payload.LocalIp || payload.localIp;
  const cpuModel = payload.CpuModel || payload.cpuModel;
  const installedSoftware = payload.InstalledSoftware || payload.installedSoftware;

  await prisma.asset.upsert({
    where: { hwid },
    update: {
      hostname, osVersion, macAddress, localIp, cpuModel, installedSoftware,
      status: 'ONLINE', lastSeen: new Date(),
    },
    create: {
      hwid, hostname, osVersion, macAddress, localIp, cpuModel, installedSoftware,
      status: 'ONLINE',
    },
  });
  console.log(`[BD]: Handshake/Sync (ITAM): ${hwid.substring(0, 8)}`);
}

export default async function itamAssetsRoutes(server: FastifyInstance) {
  // ROTA API: Listagem de Ativos (Inventário)
  server.get('/api/assets', async () => {
    return await prisma.asset.findMany({
      include: {
        telemetries: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });
  });
}
