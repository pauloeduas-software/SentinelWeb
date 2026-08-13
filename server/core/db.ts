import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Hack global para serializar BigInt corretamente
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
