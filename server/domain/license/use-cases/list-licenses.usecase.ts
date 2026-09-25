import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { contarAssentos } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import { LICENSE_SEARCHABLE } from '../helpers/license-audited.helper';

/**
 * A LISTAGEM — e a coluna principal dela é DERIVADA (`livres / seatsTotal`).
 *
 * É por isso que a licença é fatia vertical inteira e não uma spec no motor do
 * catálogo: o `select` da `CatalogSpec` é allowlist estática, e ensiná-lo a
 * contar assentos seria dobrar um genérico para atender um cliente. Nem a ideia
 * de spec local da F5 se aplica — ali havia três tipos com uma invariante
 * compartilhada; aqui há um.
 *
 * A MÁSCARA NÃO VEM NA LISTAGEM (`comMascara` ausente). Decifrar cem linhas
 * para mostrar quatro caracteres de cada poria o texto em claro de cem chaves na
 * memória do processo — exposição que não paga o que entrega. A listagem leva
 * `hasProductKey`, que é o que a tela precisa para decidir se oferece o botão.
 */
export async function listLicenses(
  query: ListQuery<string>,
): Promise<ListEnvelope<LicencaNaResposta>> {
  // Espalhamento, e não `AND`: a busca só escreve `OR` e a vista só escreve
  // `deletedAt` — nenhuma chave dos dois lados se repete.
  const where = { ...buildLicenseWhere(query.q), ...buildLicenseViewWhere(query.view) };

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um cadastro entre uma e outra faz o total não bater com o
  // que a página mostra.
  const { total, rows } = await prisma.$transaction(async (tx) => ({
    total: await tx.license.count({ where }),
    rows: await tx.license.findMany({
      where,
      select: LICENSE_SELECT,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }) as LinhaDeLicenca[],
  }));

  // A CONTAGEM, em lote e FORA da transação acima. Fora de propósito: aquela
  // existe para o total e a página serem do mesmo instante, e alongá-la com a
  // contagem de assentos seguraria a transação durante leitura que não precisa
  // dessa garantia — a mesma escolha que `listStock` e `listAssets` fazem.
  const contagens = await contarAssentos(prisma, rows.map((linha) => linha.id));

  return {
    total,
    rows: rows.map((linha) => paraResposta(
      linha,
      contagens.get(linha.id) ?? { ocupados: 0, queimados: 0, aposentados: 0, livres: 0 },
    )),
  };
}

/**
 * O `where` da busca `?q=`.
 *
 * `mode: 'insensitive'` é obrigatório: sem ele, buscar "office" não acha
 * "Office". Varre também o nome da CATEGORIA e do FABRICANTE, que não são
 * colunas desta tabela: é assim que se procura licença na prática — "as da
 * Microsoft", não o número do pedido.
 */
export function buildLicenseWhere(q?: string): Prisma.LicenseWhereInput {
  if (!q) return {};
  const contem = { contains: q, mode: 'insensitive' } as const;

  return {
    OR: [
      ...LICENSE_SEARCHABLE.map((campo) => ({ [campo]: contem })),
      { category: { name: contem } },
      { manufacturer: { name: contem } },
    ],
  };
}

/**
 * A LIXEIRA, explícita.
 *
 * `active` não escreve nada: quem filtra é a `softDeleteExtension`, que escopa
 * toda consulta sozinha. `trashed` escreve `deletedAt: { not: null }`, que é o
 * escape hatch documentado da extension.
 */
export function buildLicenseViewWhere(view: 'active' | 'trashed'): Prisma.LicenseWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
