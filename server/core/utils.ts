import { prisma } from './db';

export const sanitizeHwid = (hwid: string) => hwid.trim().toLowerCase();

export async function updateLastSeen(hwid: string) {
  try {
    await prisma.asset.update({
      where: { hwid: sanitizeHwid(hwid) },
      data: { lastSeen: new Date(), status: 'ONLINE' }
    });
  } catch (err) {
    // Silencioso: Se o asset ainda não existir (antes do handshake), ignora o update
  }
}
