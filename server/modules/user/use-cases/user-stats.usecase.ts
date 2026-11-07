import { prisma } from '../../../infra/database/prismaClient';

// OS CARTÕES DA TELA DE USUÁRIOS, os mesmos de Estoque e Colaboradores (BT). Rota própria
// porque a listagem só sabe o total do recorte aberto. Cada número é o total da lista que
// ele abre, sem a busca.
export interface UserStats {
  total: number;
  ativos: number;
  desativados: number;
}

export async function getUserStats(): Promise<UserStats> {
  // Na mesma transação: uma conta nova entre duas contagens faria os recortes deixarem
  // de somar o total.
  const [total, ativos, desativados] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: false } }),
  ]);

  return { total, ativos, desativados };
}
