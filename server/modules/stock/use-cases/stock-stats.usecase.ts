import { prisma } from '../../../infra/database/prismaClient';

// OS CARTÕES DA TELA DE ESTOQUE (BT). Rota própria porque a listagem só sabe o total do
// recorte aberto. Contam ITENS, e não unidades: cada número é o total da lista que ele
// abre, com a categoria escolhida e sem a busca (CM), como os de Computadores e Licenças.
export interface StockStats {
  total: number;
  ativos: number;
  desativados: number;
}

export async function getStockStats(categoryId?: string): Promise<StockStats> {
  const daCategoria = categoryId ? { categoryId } : {};

  // Na mesma transação: um item novo entre duas contagens faria os recortes deixarem
  // de somar o total.
  const [total, ativos, desativados] = await prisma.$transaction([
    prisma.stockItem.count({ where: daCategoria }),
    prisma.stockItem.count({ where: { ...daCategoria, isActive: true } }),
    prisma.stockItem.count({ where: { ...daCategoria, isActive: false } }),
  ]);

  return { total, ativos, desativados };
}
