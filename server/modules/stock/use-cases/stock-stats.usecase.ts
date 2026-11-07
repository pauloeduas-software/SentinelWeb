import { prisma } from '../../../infra/database/prismaClient';

// OS CARTÕES DA TELA DE ESTOQUE (BT). Rota própria porque a listagem só sabe o total do
// recorte aberto. Contam ITENS, e não unidades: cada número é o total da lista que ele
// abre, sem a busca, como os de Computadores, Postos e Licenças.
export interface StockStats {
  total: number;
  ativos: number;
  desativados: number;
}

export async function getStockStats(): Promise<StockStats> {
  // Na mesma transação: um item novo entre duas contagens faria os recortes deixarem
  // de somar o total.
  const [total, ativos, desativados] = await prisma.$transaction([
    prisma.stockItem.count(),
    prisma.stockItem.count({ where: { isActive: true } }),
    prisma.stockItem.count({ where: { isActive: false } }),
  ]);

  return { total, ativos, desativados };
}
