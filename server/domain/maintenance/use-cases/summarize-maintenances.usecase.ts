import { Prisma, type $Enums } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { SOBRE_ATIVO_VIVO } from '../helpers/maintenance-filters.helper';

// O RESUMO DA FROTA — e ele mora AQUI, no domínio de manutenção, não no de
// relatório.
//
// A aba "Manutenções" de `/relatorios` chama esta função em vez de escrever o
// próprio `groupBy`. É a mesma razão do `contarAssentos` da F6 ser importado pela
// conformidade: a regra de o que conta como custo — `asset.deletedAt IS NULL`,
// `cost` somado como `Decimal`, garantia contada à parte — é uma, e duas cópias
// divergem no primeiro ajuste. Relatório LÊ do domínio; ele não reimplementa o
// domínio.

export interface CustoPorTipo {
  type: $Enums.MaintenanceType;
  /** STRING: `Decimal` não vira `number` no caminho. */
  custo: string;
  quantidade: number;
}

export interface ResumoDeManutencoes {
  custoTotal: string;
  /** O que ainda não foi encerrado — o número que um gestor cobra. */
  emAberto: number;
  /** Custo das encerradas que saíram na garantia: quanto o contrato economizou. */
  custoNaGarantia: string;
  total: number;
  porTipo: CustoPorTipo[];
}

/** Zero como `Decimal`, para a soma vazia não virar `null` na borda. */
const ZERO = new Prisma.Decimal(0);

export async function resumirManutencoes(): Promise<ResumoDeManutencoes> {
  const where = SOBRE_ATIVO_VIVO;

  const [soma, total, emAberto, naGarantia, porTipo] = await Promise.all([
    prisma.maintenance.aggregate({ where, _sum: { cost: true } }),
    prisma.maintenance.count({ where }),
    prisma.maintenance.count({ where: { ...where, completionDate: null } }),
    prisma.maintenance.aggregate({ where: { ...where, isWarranty: true }, _sum: { cost: true } }),
    prisma.maintenance.groupBy({
      by: ['type'],
      where,
      _sum: { cost: true },
      _count: { _all: true },
    }),
  ]);

  return {
    custoTotal: (soma._sum.cost ?? ZERO).toString(),
    emAberto,
    custoNaGarantia: (naGarantia._sum.cost ?? ZERO).toString(),
    total,
    // Ordenado pelo custo, decrescente: a pergunta do relatório é "onde o
    // dinheiro está indo", e ela se responde pela primeira linha.
    porTipo: porTipo
      .map((linha) => ({
        type: linha.type,
        custo: (linha._sum.cost ?? ZERO).toString(),
        quantidade: linha._count._all,
      }))
      .sort((a, b) => Number(b.custo) - Number(a.custo)),
  };
}
