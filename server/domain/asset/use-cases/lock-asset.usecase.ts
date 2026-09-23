import { AppError } from '../../../core/errors/app-error';
import type { ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';

// A TRAVA DA LINHA DO ATIVO — irmã da `lock-user.usecase.ts`, e nasceu pelo
// mesmo tipo de bug, uma fase depois.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ELA FECHA
//
//   T1 (instalar peça)       conta o saldo do componente, vai gravar
//   T2 (mandar o ativo       conta as instalações abertas → zero, segue
//       para a lixeira)
//   T2                       grava `deletedAt` no ativo            → COMMIT
//   T1                       cria a `ComponentAsset`               → COMMIT
//
// Resultado: um ativo na lixeira com 4 pentes dentro. As unidades somem do
// `disponivel` do componente e não há tela que as devolva — `GET
// /api/assets/:id/components` responde 404, porque o ativo não existe mais para
// o inventário. É o mesmo desenho do 409 que `deleteStockItem` dá do outro
// lado, e sem a trava ele não dispara.
//
// O `onDelete: Restrict` de `component_assets.assetId` NÃO cobre isto: apagar
// aqui é `UPDATE assets SET "deletedAt" = now()`. O Postgres não vê `DELETE`
// nenhum, a FK não é consultada e a rede não existe — o ponto cego do soft
// delete que `deleteUser` e `deleteStockItem` também documentam.
// ─────────────────────────────────────────────────────────────────────────────
//
// ORDEM DE TRAVAMENTO: **componente antes de ativo**, nos caminhos que travam
// os dois (hoje só `attachComponent`). O grafo de travas do sistema continua
// acíclico: `usuário → ativo` (checkout e desligamento), `usuário → item de
// estoque` (entrega de acessório) e `componente → ativo` (instalação). Duas
// transações que travem os mesmos dois recursos em ordens opostas travam uma à
// outra, e o Postgres mata uma delas.

/**
 * Trava a linha do ativo até o fim da transação atual.
 *
 * NÃO filtra `deletedAt`, pelo mesmo motivo do `travarUsuario`: travar é sobre a
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
