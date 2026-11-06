import { prisma } from '../../../infra/database/prismaClient';
import { buildWorkstationWhere } from '../helpers/workstation-filters.helper';

// OS CARTÕES DA TELA DE POSTOS. Rota própria porque a listagem só sabe o total do
// recorte aberto. Cada número usa o mesmo `where` da lista que ele abre, e sem a
// busca, como os de Computadores.
export interface WorkstationStats {
  total: number;
  ocupados: number;
  vagos: number;
  semUso: number;
}

export async function getWorkstationStats(): Promise<WorkstationStats> {
  // Na mesma transação: uma ocupação nova entre duas contagens faria os três
  // recortes deixarem de somar o total.
  const [total, ocupados, vagos, semUso] = await prisma.$transaction([
    prisma.workstation.count({ where: buildWorkstationWhere(undefined, 'todos') }),
    prisma.workstation.count({ where: buildWorkstationWhere(undefined, 'ocupados') }),
    prisma.workstation.count({ where: buildWorkstationWhere(undefined, 'vagos') }),
    prisma.workstation.count({ where: buildWorkstationWhere(undefined, 'sem-uso') }),
  ]);

  return { total, ocupados, vagos, semUso };
}
