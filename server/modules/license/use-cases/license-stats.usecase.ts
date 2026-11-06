import { prisma } from '../../../infra/database/prismaClient';
import { hojeNoBrasil } from '../../shared/hoje.helper';
import { buildStatusWhere } from './list-licenses.usecase';

// OS CARTÕES DA TELA DE LICENÇAS. Rota própria porque a listagem só sabe o total do
// recorte aberto. Cada número usa o mesmo `where` da lista que ele abre, e sem a busca,
// como os de Computadores e os de Postos.
export interface LicenseStats {
  total: number;
  ativas: number;
  vencendo: number;
  vencidas: number;
  encerradas: number;
}

export async function getLicenseStats(): Promise<LicenseStats> {
  const hoje = hojeNoBrasil();

  // Na mesma transação: uma licença nova entre duas contagens faria os recortes
  // deixarem de somar o total.
  const [total, ativas, vencendo, vencidas, encerradas] = await prisma.$transaction([
    prisma.license.count(),
    prisma.license.count({ where: buildStatusWhere('ATIVA', hoje) }),
    prisma.license.count({ where: buildStatusWhere('VENCENDO', hoje) }),
    prisma.license.count({ where: buildStatusWhere('EXPIRADA', hoje) }),
    prisma.license.count({ where: buildStatusWhere('ENCERRADA', hoje) }),
  ]);

  return { total, ativas, vencendo, vencidas, encerradas };
}
