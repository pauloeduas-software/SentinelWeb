import { prisma } from '../../../core/database/prismaClient';

// Contadores da tela.
//
// Existe como rota própria porque, com paginação, `rows.length` conta só a
// página atual — o cabeçalho passaria a mentir assim que o `take` entrasse.
// A agregação roda FORA do skip/take, sobre a tabela toda.
export interface InventoryStats {
  total: number;
  byStatus: Record<string, number>;
}

export async function getInventoryStats(): Promise<InventoryStats> {
  const grupos = await prisma.inventoryItem.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const byStatus: Record<string, number> = {};
  let total = 0;

  for (const grupo of grupos) {
    const quantos = grupo._count._all;
    byStatus[grupo.status] = quantos;
    total += quantos;
  }

  return { total, byStatus };
}
