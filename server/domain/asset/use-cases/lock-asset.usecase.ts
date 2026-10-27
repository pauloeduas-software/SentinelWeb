import { AppError } from '../../../core/errors/app-error';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';

// A TRAVA DA LINHA DO ATIVO — irmã da `lock-person.usecase.ts`, e nasceu pelo
// mesmo tipo de bug, uma fase depois.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ELA FECHA
//
//   T1 (entregar uma licença  conta o que está aberto, vai gravar
//       ao ativo)
//   T2 (mandar o ativo        conta o que está aberto → zero, segue
//       para a lixeira)
//   T2                        grava `deletedAt` no ativo            → COMMIT
//   T1                        grava a entrega no ativo              → COMMIT
//
// Resultado: um ativo na lixeira com licença paga em cima dele, e nenhuma tela
// que a devolva — o ativo não existe mais para o inventário.
//
// A FK `Restrict` NÃO cobre isto: apagar aqui é `UPDATE assets SET "deletedAt"
// = now()`. O Postgres não vê `DELETE` nenhum, a FK não é consultada e a rede
// não existe — o ponto cego do soft delete.
// ─────────────────────────────────────────────────────────────────────────────
//
// O GRAFO DE TRAVAS do sistema, e por que a ORDEM é sempre `pessoa → ativo →
// posto`. Duas transações que travam os mesmos dois recursos em ordens opostas
// travam uma à outra, e o Postgres mata uma com `40P01` — que o `error-handler`
// não mapeia e devolve como 500.
//
//   pessoa → ativo    o checkout de ativo a pessoa
//   ativo → posto     o checkout a posto e a restauração da lixeira, pela
//                     invariante 19 (`workstation/helpers/ativo-do-posto.helper.ts`)
//   ativo             o soft delete do ativo, a edição (`update-asset`) e a
//                     baixa (`retire-asset`)
//   pessoa → licença  a entrega de licença a pessoa
//   ativo → licença   a entrega de licença a ativo
//                     (`license/use-cases/lock-license.usecase.ts`). A devolução
//                     de licença trava só a linha da entrega.
//   pessoa → item     a entrega de estoque a pessoa (`stock/use-cases/checkout-stock.usecase.ts`)
//   ativo → item      a entrega de componente a computador (AI, o mesmo arquivo).
//                     A baixa e a lixeira do ativo contam os componentes com o
//                     ativo travado, e não travam item nenhum.
//   item → posto      implícita: o INSERT da entrega a posto toma `FOR KEY SHARE`
//                     na linha do posto, com o item já travado. Nenhum caminho
//                     trava posto e depois item, e nenhum trava item e depois
//                     pessoa — é o que mantém o grafo sem ciclo.
//
// E AS TRAVAS QUE O POSTGRES TOMA SOZINHO CONTAM. `update-asset.usecase.ts`
// grava `locationId`: o `UPDATE` trava a linha do ativo e o gatilho da FK
// `assets.locationId` adquire `FOR KEY SHARE` na linha do local — que conflita
// com `FOR UPDATE`. É uma aresta `ativo → localização` que nenhum `grep` por
// `FOR UPDATE` mostra; quando o posto ainda era uma localização, foi ela que
// obrigou a invariante 19 a travar o ativo ANTES do posto. Uma aresta
// implícita assim existe em toda FK escrita.
//
// Este arquivo não é o inventário completo das travas — o domínio de licença
// trava `licenses` e `license_checkouts` por conta própria
// (`lock-license.usecase.ts`), e o de estoque trava `stock_items` em
// `stock-balance.helper.ts`. É o inventário de quem disputa PESSOA, ATIVO, ITEM
// e POSTO, que são as quatro linhas que mais de um domínio pede. As linhas de
// CATÁLOGO (categoria, status, fabricante, modelo, localização) vêm sempre por
// último, e as travas delas — e as do posto — estão em
// `catalog/helpers/catalog-lock.helper.ts`.

/**
 * Trava a linha do ativo até o fim da transação atual.
 *
 * NÃO filtra `deletedAt`, pelo mesmo motivo do `travarPessoa`: travar é sobre a
 * LINHA, e um ativo na lixeira continua sendo uma linha que o restore disputa.
 * Quem decide o que fazer com a lixeira é a consulta seguinte, que passa pelo
 * escopo da `softDeleteExtension`.
 */
export async function travarAtivo(client: ClienteQueTrava, assetId: string): Promise<boolean> {
  // Template tag: o `${assetId}` vira PARÂMETRO do Postgres, não texto
  // concatenado. O `::uuid` é necessário porque o parâmetro chega como texto.
  const linhas = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM assets WHERE id = ${assetId}::uuid FOR UPDATE
  `;
  return linhas.length > 0;
}

/** A mesma trava, com o 404 que todo chamador daria. */
export async function travarAtivoOuFalhar(client: ClienteQueTrava, assetId: string): Promise<void> {
  if (!(await travarAtivo(client, assetId))) {
    throw new AppError('Registro não encontrado', 404);
  }
}
