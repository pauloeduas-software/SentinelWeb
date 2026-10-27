import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSET_SELECT, assetSelect } from '../../asset/helpers/asset-select.helper';
import { listWorkstationStock } from '../../stock/use-cases/list-workstation-stock.usecase';
import { WORKSTATION_DETAIL_SELECT } from '../helpers/workstation-select.helper';
import { ehPostoVago } from '../helpers/workstation-row.helper';

/**
 * UM posto: o ativo entregue a ele, o estoque na mesa e se está vago.
 *
 * É a Camada 1 vista do lado do posto (docs/referencia/modelo-de-posse.md) — as
 * posses abertas cujo alvo é este posto, mais as unidades de ESTOQUE entregues
 * a ele. Os OCUPANTES (Camada 2) a ficha lê da rota de ocupação; daqui só sai a
 * contagem deles, de onde vem o `vago`.
 */
export async function getWorkstation(id: string, podeVerCusto: boolean) {
  // `findUnique`: `Workstation` não tem `deletedAt` — o posto não tem lixeira.
  const lido = await prisma.workstation.findUnique({
    where: { id },
    select: WORKSTATION_DETAIL_SELECT,
  });

  if (!lido) throw new AppError('Posto de trabalho não encontrado.', 404);

  const [entregues, itens] = await Promise.all([
    // Consulta em `asset`, e não nas `assignments` do posto, de propósito: no
    // topo da consulta a `softDeleteExtension` age, e o ativo na lixeira fica
    // de fora sozinho. Lido pela relação, ele apareceria como equipamento na
    // mesa até alguém lembrar de filtrar à mão.
    prisma.asset.findMany({
      where: { assignments: { some: { targetWorkstationId: id, checkinAt: null } } },
      // O SELECT DO ATIVO, MAIS UM CAMPO E MENOS UM.
      //
      // MAIS a máquina vinculada, e o acréscimo é local de propósito: ela
      // interessa a ESTA tela, que mostra a telemetria do computador da mesa.
      // Acrescentá-la ao `ASSET_SELECT` compartilhado a faria sair em toda
      // listagem, em toda criação e em toda edição, sem ninguém ter decidido.
      //
      // MENOS o custo de compra quando a sessão não é `ADMIN` (D77) — é o que o
      // `assetSelect` faz, e é a mesma função que a listagem e o detalhe de
      // ativo usam. O `as` fixa o tipo no select completo porque é ele que o
      // Prisma precisa ver; o mesmo recurso que `list-assets.usecase.ts` usa.
      select: {
        ...(assetSelect(podeVerCusto) as typeof ASSET_SELECT),
        endpoint: { select: { id: true } },
      },
      orderBy: { assetTag: 'asc' },
    }),
    // O ESTOQUE NA MESA — uma linha por saída. É o "o que esta
    // mesa tem" completo: sem elas a ficha mostrava o computador e escondia os
    // cinco mouses em cima dele. Lista PRÓPRIA, e não somada aos ativos: um
    // mouse não tem etiqueta nem série, e `totalAtivos` continua contando só
    // ativo — é esse número que a invariante 19 limita a um.
    listWorkstationStock(id),
  ]);

  // A relação vira um CAMPO: a tela quer saber se este ativo tem máquina
  // vinculada e qual consultar, não receber um objeto aninhado de uma chave só.
  const ativos = entregues.map(({ endpoint, ...ativo }) => ({
    ...ativo,
    endpointId: endpoint?.id ?? null,
  }));

  const { _count, ...posto } = lido;

  return {
    ...posto,
    ativos,
    totalAtivos: ativos.length,
    itens,

    // `vago` olha só os ATIVOS, e isso é decisão: o sinal existe para o
    // equipamento caro parado em mesa sem ninguém. Um posto com um mouse na
    // gaveta e nenhum ocupante não é o caso que o selo existe para acender.
    vago: ehPostoVago(_count.occupants, ativos.length),
  };
}
