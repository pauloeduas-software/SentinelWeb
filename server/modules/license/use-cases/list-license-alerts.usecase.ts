import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import type { ListEnvelope } from '../../../infra/http/list-query';
import { hojeNoBrasil, somarDias } from '../../shared/hoje.helper';
import { DIAS_DE_AVISO, diasParaVencer, statusDaLicenca, type LicenseStatus } from '../helpers/license-status.helper';
import { contarUso } from './count-license-checkouts.usecase';

// O ALERTA DA LICENÇA — um só: o que venceu e o que vai vencer. A encerrada
// não entra: ela só encerra com tudo devolvido. Não existe alerta de "abaixo do
// mínimo" (AA).

export type MotivoDoAlerta = 'VENCIDA' | 'VENCENDO';

export interface LicencaEmAlerta {
  id: string;
  name: string;
  motivo: MotivoDoAlerta;
  status: LicenseStatus;
  diasParaVencer: number | null;
  expirationDate: Date | null;
  terminationDate: Date | null;
  emUso: number;
  categoryName: string | null;
}

/** O alerta: a lista, o total, e quantas há de cada motivo — a linha de links da caixa. */
export interface AlertasDaLicenca extends ListEnvelope<LicencaEmAlerta> {
  contagem: Record<MotivoDoAlerta, number>;
}

/**
 * Quantas a caixa do alerta lista. O resto ela não mostra: a contagem de cada
 * motivo, embaixo, leva ao filtro que mostra todas.
 */
const NA_CAIXA = 6;

const SELECT_DO_ALERTA = {
  id: true, name: true, expirationDate: true, terminationDate: true,
  category: { select: { name: true } },
} as const;

type LinhaDoAlerta = {
  id: string; name: string;
  expirationDate: Date | null; terminationDate: Date | null;
  category: { name: string } | null;
};

/**
 * Os dois motivos, do mais urgente para o menos:
 *
 * 1. VENCIDA — da mais recente para a mais antiga. Fica no alerta até alguém
 *    renovar a data ou encerrar a licença: é uma decisão pendente.
 * 2. VENCENDO nos próximos 30 dias — da mais próxima para a mais distante.
 *
 * TODO FILTRO NO BANCO, e o teto DEPOIS dele: cortar antes de filtrar deixava
 * de fora justamente as que importavam. `total` diz à tela quantas são de
 * verdade quando a lista é cortada.
 */
export async function listLicenseAlerts(): Promise<AlertasDaLicenca> {
  const hoje = hojeNoBrasil();
  const naoEncerrada: Prisma.LicenseWhereInput = {
    OR: [{ terminationDate: null }, { terminationDate: { gt: hoje } }],
  };

  const recortes: { motivo: MotivoDoAlerta; where: Prisma.LicenseWhereInput; orderBy: Prisma.LicenseOrderByWithRelationInput[] }[] = [
    {
      motivo: 'VENCIDA',
      where: { AND: [naoEncerrada, { expirationDate: { lt: hoje } }] },
      orderBy: [{ expirationDate: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    },
    {
      motivo: 'VENCENDO',
      where: { AND: [naoEncerrada, { expirationDate: { gte: hoje, lte: somarDias(hoje, DIAS_DE_AVISO) } }] },
      orderBy: [{ expirationDate: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    },
  ];

  const blocos = await Promise.all(recortes.map(async ({ motivo, where, orderBy }) => {
    const [total, linhas] = await Promise.all([
      prisma.license.count({ where }),
      prisma.license.findMany({ where, select: SELECT_DO_ALERTA, orderBy, take: NA_CAIXA }) as Promise<LinhaDoAlerta[]>,
    ]);
    return { motivo, total, linhas };
  }));

  // As primeiras na ordem de urgência. Cada motivo traz até `NA_CAIXA` porque o
  // anterior pode ter menos que isso.
  const naCaixa = blocos
    .flatMap(({ motivo, linhas }) => linhas.map((linha) => ({ motivo, linha })))
    .slice(0, NA_CAIXA);

  const uso = await contarUso(prisma, naCaixa.map(({ linha }) => linha.id));

  const rows = naCaixa.map(({ motivo, linha }): LicencaEmAlerta => ({
    id: linha.id,
    name: linha.name,
    motivo,
    status: statusDaLicenca(linha, hoje),
    diasParaVencer: diasParaVencer(linha.expirationDate, hoje),
    expirationDate: linha.expirationDate,
    terminationDate: linha.terminationDate,
    emUso: uso.get(linha.id)?.emUso ?? 0,
    categoryName: linha.category?.name ?? null,
  }));

  const contagem = Object.fromEntries(blocos.map(({ motivo, total }) => [motivo, total])) as Record<MotivoDoAlerta, number>;
  return { total: blocos.reduce((soma, bloco) => soma + bloco.total, 0), contagem, rows };
}
