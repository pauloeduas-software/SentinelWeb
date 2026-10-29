import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { contemTexto } from '../../shared/busca.helper';
import { hojeNoBrasil, somarDias } from '../../shared/hoje.helper';
import { SEM_USO } from '../helpers/license-count.helper';
import { DIAS_DE_AVISO } from '../helpers/license-status.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { LicenseFilters, StatusDoFiltro } from '../schemas/license.schema';
import { contarUso } from './count-license-checkouts.usecase';

/**
 * A LISTAGEM — e a coluna principal dela é DERIVADA (`livres` de quantas foram
 * compradas). É por isso que a licença é fatia vertical inteira e não uma spec
 * no motor do catálogo: o `select` da `CatalogSpec` é allowlist estática.
 *
 * UMA LISTA SÓ (AF), como nas Configurações: a encerrada fica junto, e a tela
 * a esmaece. `status` recorta um dos quatro — `ENCERRADA` é o que a aba
 * Encerradas mostrava.
 */
export async function listLicenses(
  query: ListQuery,
  filtros: LicenseFilters,
): Promise<ListEnvelope<LicencaNaResposta>> {
  // `AND`, e não espalhamento: a busca escreve `OR` e o status também —
  // espalhados, um apagaria o outro em silêncio.
  const hoje = hojeNoBrasil();
  const where: Prisma.LicenseWhereInput = {
    AND: [
      buildLicenseWhere(query.q),
      filtros.status ? buildStatusWhere(filtros.status, hoje) : {},
      filtros.categoryId ? { categoryId: filtros.categoryId } : {},
    ],
  };

  // As encerradas pela mais recente: quem filtra por elas procura o que acabou
  // de sair. `id` desempata nomes repetidos (o contrato novo pode ter o mesmo
  // nome).
  const orderBy: Prisma.LicenseOrderByWithRelationInput[] = filtros.status === 'ENCERRADA'
    ? [{ terminationDate: 'desc' }, { name: 'asc' }, { id: 'asc' }]
    : [{ name: 'asc' }, { id: 'asc' }];

  const [total, rows] = await Promise.all([
    prisma.license.count({ where }),
    prisma.license.findMany({
      where,
      select: LICENSE_SELECT,
      orderBy,
      skip: query.skip,
      take: query.take,
    }) as Promise<LinhaDeLicenca[]>,
  ]);

  // A contagem em lote: uma consulta para a página inteira.
  const uso = await contarUso(prisma, rows.map((linha) => linha.id));

  return { total, rows: rows.map((linha) => paraResposta(linha, uso.get(linha.id) ?? SEM_USO, hoje)) };
}

/** Os campos da própria licença que a busca `?q=` varre. */
const CAMPOS_DA_BUSCA = ['name', 'licensedToName', 'licensedToEmail', 'orderNumber'] as const;

/**
 * O `where` da busca `?q=`. Varre também o nome da CATEGORIA e do FABRICANTE,
 * que não são colunas desta tabela: é assim que se procura licença na prática —
 * "as da Microsoft", não o número do pedido.
 */
function buildLicenseWhere(q?: string): Prisma.LicenseWhereInput {
  if (!q) return {};
  const contem = contemTexto(q);

  return {
    OR: [
      ...CAMPOS_DA_BUSCA.map((campo) => ({ [campo]: contem })),
      { category: { name: contem } },
      { manufacturer: { name: contem } },
    ],
  };
}

/**
 * O filtro de status — as mesmas fronteiras do `statusDaLicenca`, contra o
 * MESMO "hoje" (`hojeNoBrasil`), escritas como `where`. O encerramento vem
 * primeiro, como lá: chegado o dia marcado, a licença é ENCERRADA, vencida ou
 * não, e os outros três status são só das que não encerraram. Vencida é
 * vencimento antes de hoje (o dia do vencimento ainda vale), vencendo vai de
 * hoje a hoje + 30, e ativa é o resto, inclusive sem vencimento.
 */
function buildStatusWhere(status: StatusDoFiltro, hoje: Date): Prisma.LicenseWhereInput {
  if (status === 'ENCERRADA') return { terminationDate: { lte: hoje } };

  const naoEncerrada: Prisma.LicenseWhereInput = { OR: [{ terminationDate: null }, { terminationDate: { gt: hoje } }] };
  const fimDoAviso = somarDias(hoje, DIAS_DE_AVISO);
  if (status === 'EXPIRADA') return { AND: [naoEncerrada, { expirationDate: { lt: hoje } }] };
  if (status === 'VENCENDO') return { AND: [naoEncerrada, { expirationDate: { gte: hoje, lte: fimDoAviso } }] };
  return { AND: [naoEncerrada, { OR: [{ expirationDate: null }, { expirationDate: { gt: fimDoAviso } }] }] };
}
