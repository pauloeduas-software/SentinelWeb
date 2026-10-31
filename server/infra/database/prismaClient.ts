import { PrismaClient } from '@prisma/client';
import { getDatabaseUrl } from '../config/env';
import { softDeleteExtension } from './soft-delete.extension';

// O cliente da aplicação já vem com o escopo da lixeira aplicado: nenhuma query
// do sistema enxerga linha apagada a menos que peça explicitamente (ver
// soft-delete.extension.ts).
export const prisma = new PrismaClient({
  datasources: { db: { url: getDatabaseUrl() } },
}).$extends(softDeleteExtension);

// Shutdown: encerra o pool de conexões do Prisma
export async function closeDatabase(): Promise<void> {
  await prisma.$disconnect();
}
