import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { hojeNoBrasil, somarDias } from '../../shared/hoje.helper';
import { SEM_USO } from '../helpers/license-count.helper';
import { DIAS_DE_AVISO } from '../helpers/license-status.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import type { LicenseFilters, RecorteDaLicenca, StatusDoFiltro } from '../schemas/license.schema';
import { contarUso } from './count-license-checkouts.usecase';

/**
 * A LISTAGEM — e a coluna principal dela é DERIVADA (`livres` de quantas foram
 * compradas). É por isso que a licença é fatia vertical inteira e não uma spec
 * no motor do catálogo: o `select` da `CatalogSpec` é allowlist estática.
 *
 * DUAS ABAS (AA): `atuais` são as que não encerraram — ativas, vencendo e
 * vencidas, porque a vencida ainda pede decisão (renovar ou encerrar);
 * `encerradas` são as que chegaram ao dia do encerramento. Dentro de `atuais`,
 * `status` recorta uma das três; `emUso` deixa só as que alguém ainda usa — é
 * para onde o alerta "encerradas em uso" leva.
 */
export async function listLicenses(
  query: ListQuery,
  filtros: LicenseFilters,
): Promise<ListEnvelope<LicencaNaResposta>> {
  // `AND`, e não espalhamento: a busca escreve `OR` e o recorte das atuais
  // também — espalhados, um apagaria o outro em silêncio.
  const hoje = hojeNoBrasil();
  const where: Prisma.LicenseWhereInput = {
    AND: [
      buildLicenseWhere(query.q),
      buildRecorteWhere(filtros.view, hoje),
      filtros.status ? buildStatusWhere(filtros.status, hoje) : {},
      filtros.emUso ? { checkouts: { some: { checkinAt: null } } } : {},
      filtros.categoryId ? { categoryId: filtros.categoryId } : {},
    ],
  };

  // As encerradas pela mais recente: quem abre a aba procura o que acabou de
  // sair. `id` desempata nomes repetidos (a renovação pode ter o mesmo nome).
  const orderBy: Prisma.LicenseOrderByWithRelationInput[] = filtros.view === 'encerradas'
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

  return { total, rows: rows.map((linha) => paraResposta(linha, uso.get(linha.id) ?? SEM_USO)) };
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
  const contem = { contains: q, mode: 'insensitive' } as const;

  return {
    OR: [
      ...CAMPOS_DA_BUSCA.map((campo) => ({ [campo]: contem })),
      { category: { name: contem } },
      { manufacturer: { name: contem } },
    ],
  };
}

/**
 * O recorte das abas, contra o MESMO "hoje" do status (`hojeNoBrasil`): a
 * licença que o status chama de ENCERRADA é exatamente a que esta consulta põe
 * na aba Encerradas.
 */
function buildRecorteWhere(view: RecorteDaLicenca, hoje: Date): Prisma.LicenseWhereInput {
  return view === 'encerradas'
    ? { terminationDate: { lte: hoje } }
    : { OR: [{ terminationDate: null }, { terminationDate: { gt: hoje } }] };
}

/**
 * O filtro de status da aba Atuais — as mesmas fronteiras do
 * `statusDaLicenca`, escritas como `where`: vencida é vencimento antes de hoje
 * (o dia do vencimento ainda vale), vencendo vai de hoje a hoje + 30, e ativa é
 * o resto, inclusive sem vencimento. O encerramento já saiu pelo recorte.
 */
function buildStatusWhere(status: StatusDoFiltro, hoje: Date): Prisma.LicenseWhereInput {
  const fimDoAviso = somarDias(hoje, DIAS_DE_AVISO);
  if (status === 'EXPIRADA') return { expirationDate: { lt: hoje } };
  if (status === 'VENCENDO') return { expirationDate: { gte: hoje, lte: fimDoAviso } };
  return { OR: [{ expirationDate: null }, { expirationDate: { gt: fimDoAviso } }] };
}
