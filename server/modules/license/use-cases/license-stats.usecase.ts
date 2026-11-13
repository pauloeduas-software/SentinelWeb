import { prisma } from '../../../infra/database/prismaClient';
import { hojeNoBrasil } from '../../shared/hoje.helper';
import { buildStatusWhere } from './list-licenses.usecase';

// OS CARTÕES DA TELA DE LICENÇAS. Rota própria porque a listagem só sabe o total do
// recorte aberto. Cada número usa o mesmo `where` da lista que ele abre, com a categoria
// escolhida e sem a busca (CM), como os de Computadores e Estoque.
export interface LicenseStats {
  total: number;
  ativas: number;
  vencendo: number;
  vencidas: number;
  encerradas: number;
}

export async function getLicenseStats(categoryId?: string): Promise<LicenseStats> {
  const hoje = hojeNoBrasil();
  const daCategoria = categoryId ? { categoryId } : {};

  // Na mesma transação: uma licença nova entre duas contagens faria os recortes
  // deixarem de somar o total.
  const [total, ativas, vencendo, vencidas, encerradas] = await prisma.$transaction([
    prisma.license.count({ where: daCategoria }),
    prisma.license.count({ where: { ...buildStatusWhere('ATIVA', hoje), ...daCategoria } }),
    prisma.license.count({ where: { ...buildStatusWhere('VENCENDO', hoje), ...daCategoria } }),
    prisma.license.count({ where: { ...buildStatusWhere('EXPIRADA', hoje), ...daCategoria } }),
    prisma.license.count({ where: { ...buildStatusWhere('ENCERRADA', hoje), ...daCategoria } }),
  ]);

  return { total, ativas, vencendo, vencidas, encerradas };
}
