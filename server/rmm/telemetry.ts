import { prisma } from '../core/db';
import { sanitizeHwid } from '../core/utils';

export async function handleTelemetry(payload: any) {
  const hwid = sanitizeHwid(payload.Hwid || payload.hwid);
  const cpuUsage = payload.CpuUsagePercentage || payload.cpuUsagePercentage;
  const ramTotal = payload.RamTotalBytes || payload.ramTotalBytes;
  const ramUsed = payload.RamUsedBytes || payload.ramUsedBytes;
  
  const disks = payload.Disks || payload.disks || payload.DiskUsageBytes || payload.diskUsageBytes || [];
  const network = payload.Network || payload.network || { bytesReceived: 0, bytesSent: 0 };
  const topProcesses = payload.TopProcesses || payload.topProcesses || [];

  const asset = await prisma.asset.findUnique({ where: { hwid }, select: { id: true } });
  if (!asset) return;

  await prisma.telemetry.create({
    data: {
      assetId: asset.id,
      cpuUsage: cpuUsage,
      ramTotal: BigInt(ramTotal),
      ramUsed: BigInt(ramUsed),
      disks: disks,
      network: network,
      topProcesses: topProcesses,
    },
  });
}
