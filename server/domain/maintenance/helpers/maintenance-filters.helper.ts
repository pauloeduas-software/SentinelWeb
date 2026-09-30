import { z } from 'zod';
import { $Enums, type Prisma } from '@prisma/client';

// A VISTA E OS FILTROS DA TELA GLOBAL — e não `view` do `core` (D20).
//
// "Em aberto" é `completionDate IS NULL` e "por tipo" é uma coluna de enum: as
// duas só existem aqui. O parser genérico valida a query com `strictObject` e
// responderia 422 a `?situacao=abertas`, que ele por decisão de camada não
// conhece — então os filtros do domínio saem PRIMEIRO e o que sobra vai para o
// `core`. Mesmo desenho do `separarFiltrosDeAtivo` da F2.

export const MAINTENANCE_SITUACOES = ['todas', 'abertas', 'encerradas'] as const;
export type SituacaoDeManutencao = (typeof MAINTENANCE_SITUACOES)[number];

export interface MaintenanceFilters {
  situacao: SituacaoDeManutencao;
  type?: $Enums.MaintenanceType;
  assetId?: string;
  supplierId?: string;
}

const maintenanceFiltersSchema = z.object({
  situacao: z
    .enum(MAINTENANCE_SITUACOES, `situação inválida: use ${MAINTENANCE_SITUACOES.join(', ')}`)
    .default('todas'),
  type: z.enum($Enums.MaintenanceType, 'tipo de manutenção inválido').optional(),
  assetId: z.uuid('ativo: identificador inválido').optional(),
  supplierId: z.uuid('fornecedor: identificador inválido').optional(),
});

const CHAVES_DO_DOMINIO = ['situacao', 'type', 'assetId', 'supplierId'] as const;

export function separarFiltrosDeManutencao(raw: unknown): {
  filtros: MaintenanceFilters;
  paraOCore: Record<string, unknown>;
} {
  const query = { ...((raw ?? {}) as Record<string, unknown>) };
  const filtros = maintenanceFiltersSchema.parse(query);

  for (const chave of CHAVES_DO_DOMINIO) delete query[chave];

  return { filtros, paraOCore: query };
}

/**
 * O `where` de toda leitura de manutenção — e ele SEMPRE carrega o ativo vivo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `asset: { deletedAt: null }` NÃO É OPCIONAL, E NÃO É REDUNDANTE.
 *
 * `maintenances` não tem coluna `deletedAt`, então a `softDeleteExtension` não a
 * alcança — ela só escopa os models que TÊM a coluna (ela pergunta ao DMMF). E
 * relação aninhada não herda escopo nenhum (D8, verificado na F1).
 *
 * Sem esta linha, um ativo que alguém mandou para a lixeira continua somando
 * custo no total da tela global e no relatório — e o número fica errado em
 * silêncio, que é o pior tipo de errado num relatório financeiro.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SOBRE_ATIVO_VIVO: Prisma.MaintenanceWhereInput = { asset: { deletedAt: null } };

export function buildMaintenanceWhere(q?: string): Prisma.MaintenanceWhereInput {
  if (!q) return {};

  const contem = { contains: q, mode: 'insensitive' } as const;

  // Varre também a etiqueta e o nome do ATIVO: é assim que se procura uma
  // manutenção na prática — "o que foi feito no ATV-00012", não o título que
  // alguém digitou em março.
  return {
    OR: [
      { title: contem },
      { notes: contem },
      { asset: { assetTag: contem } },
      { asset: { name: contem } },
      { supplier: { name: contem } },
    ],
  };
}

export function buildMaintenanceFilterWhere(filtros: MaintenanceFilters): Prisma.MaintenanceWhereInput {
  return {
    ...SOBRE_ATIVO_VIVO,
    ...(filtros.situacao === 'abertas' ? { completionDate: null } : {}),
    ...(filtros.situacao === 'encerradas' ? { completionDate: { not: null } } : {}),
    ...(filtros.type ? { type: filtros.type } : {}),
    ...(filtros.assetId ? { assetId: filtros.assetId } : {}),
    ...(filtros.supplierId ? { supplierId: filtros.supplierId } : {}),
  };
}
