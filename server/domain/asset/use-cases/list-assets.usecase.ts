import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { resolverResponsaveisEmLote, type PosseResolvida } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { assetSelect, ASSET_SELECT_COM_CAMPOS, comCamposMascarados } from '../helpers/asset-select.helper';
import {
  buildAssetFilterWhere, buildAssetWhere, type AssetFilters, type AssetSortable,
} from '../helpers/asset-filters.helper';

type LinhaCrua = Awaited<ReturnType<typeof buscarPagina>>[number];
// `Partial` em `purchaseCost` é o contrato do D77 aparecendo no TIPO: a coluna
// pode não vir, e quem consome tem que tratar a ausência. Sem isto, o TS
// afirmaria que ela está sempre lá e a tela a leria como `undefined` em
// silêncio.
type AssetRow = ReturnType<typeof comCamposMascarados<LinhaCrua>>;

/** A linha da listagem com a responsabilidade já resolvida (Camada 3). */
export type AssetRowComPosse = AssetRow & { posse: PosseResolvida };

// `ASSET_SELECT_COM_CAMPOS` e não o compartilhado: a listagem mostra os campos
// marcados com `showInListView` como coluna (F9, Etapa F), e é a única leitura em
// lote que os precisa. Toda linha passa por `comCamposMascarados` antes de sair.
function buscarPagina(where: object, query: ListQuery<AssetSortable>, podeVerCusto: boolean) {
  return prisma.asset.findMany({
    where,
    // O select DEPENDE DA SESSÃO (D77): sem `assets.viewCost`, `purchaseCost`
    // não é lido do banco. Mascarar depois deixaria o valor passar por log, por
    // erro e por qualquer serialização no caminho.
    select: assetSelect(podeVerCusto) as typeof ASSET_SELECT_COM_CAMPOS,
    orderBy: { [query.sort]: query.order },
    skip: query.skip,
    take: query.take,
  });
}

/**
 * A vista (`active` / `trashed` / `retired`), o filtro por status e por
 * localização e o relatório de posto vago vêm em `filtros`, SEPARADOS do
 * `query` genérico: `query` é o que toda listagem do sistema tem (página,
 * ordem, busca) e `filtros` é o que só o ITAM entende (D20). O `query.view` que
 * o parser do `core` devolve não é lido aqui — quem manda é `filtros.view`.
 */
export async function listAssets(
  query: ListQuery<AssetSortable>,
  filtros: AssetFilters,
  /**
   * A sessão enxerga custo de compra? (F11, D77)
   *
   * Vem por PARÂMETRO, do controller, e não de um `request` importado aqui: o
   * use-case não conhece HTTP (docs/referencia/arquitetura.md), e é a mesma inversão do
   * `actorId` do D23 — quem sabe quem está pedindo é a borda.
   */
  podeVerCusto: boolean,
): Promise<ListEnvelope<AssetRowComPosse>> {
  // Espalhamento, e não `AND`: a busca textual só escreve `OR` e os filtros só
  // escrevem colunas e relações — nenhuma chave dos dois lados se repete.
  const where = { ...buildAssetWhere(query.q), ...buildAssetFilterWhere(filtros) };

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um cadastro entre uma e outra faz o total não bater com o
  // que a página mostra.
  const [total, rows] = await prisma.$transaction([
    prisma.asset.count({ where }),
    buscarPagina(where, query, podeVerCusto),
  ]);

  // Quem responde por cada ativo NÃO sai do `ASSET_SELECT`: é derivado da posse
  // aberta e, quando o alvo é um posto, dos ocupantes dele (docs/referencia/modelo-de-posse.md,
  // Camada 3). `assignedToId` sozinho responderia errado justamente no caso que
  // motivou o modelo — o mouse da Mesa 1, que é da Laura e da Ana e de ninguém
  // em particular.
  //
  // EM LOTE, e isso não é otimização prematura: um resolver por linha seria
  // N+1 sobre a página inteira, e a página vai até 100. A versão em lote faz um
  // número FIXO de consultas, venham 1 ou 100 ativos.
  //
  // FORA da `$transaction` acima de propósito: aquela existe para o total e a
  // página serem do mesmo instante, e alongá-la com as consultas da posse
  // seguraria a transação durante leitura que não precisa dessa garantia.
  const posses = await resolverResponsaveisEmLote(prisma, rows.map((linha) => linha.id));

  return {
    total,
    // `!` não: o lote garante uma entrada por id pedido, mas quem lê o código
    // aqui não sabe disso — o fallback deixa a promessa local e explícita.
    rows: rows.map((linha) => ({
      ...comCamposMascarados(linha),
      posse: posses.get(linha.id) ?? semPosse(),
    })),
  };
}

/**
 * Posse vazia para o caso que não deve acontecer (id pedido ausente do mapa).
 *
 * FUNÇÃO, e não constante compartilhada, pelo mesmo motivo do `semPosse()` do
 * resolver: uma constante entregaria o MESMO array `responsaveis` a todas as
 * linhas, e bastaria um `push` em qualquer ponto para a lista aparecer em
 * ativos que não têm nada a ver com ela.
 */
function semPosse(): PosseResolvida {
  return {
    assignmentId: null,
    targetType: null,
    targetLabel: null,
    responsaveis: [],
    postoVago: false,
  };
}
