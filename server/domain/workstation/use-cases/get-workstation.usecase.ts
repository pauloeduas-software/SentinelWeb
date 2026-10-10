import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSET_SELECT, assetSelect } from '../../asset/helpers/asset-select.helper';
import { WORKSTATION_DETAIL_SELECT } from '../helpers/workstation-select.helper';
import { ehPostoVago } from '../helpers/workstation-row.helper';
import { resolverCaminhos } from './resolve-location-paths.usecase';

/**
 * UM posto: quem está nele e o que foi entregue a ele.
 *
 * São as duas metades do modelo numa tela só (docs/referencia/modelo-de-posse.md): a Camada 2
 * — os ocupantes, com turno — e a Camada 1 vista do lado do posto — as posses
 * abertas cujo alvo é esta localização. É a junção das duas que responde "quem
 * é responsável pelo mouse da Mesa 1".
 *
 * NÃO exige `isWorkstation` para responder, e isso continua sendo decisão — mas
 * o motivo mudou de nome. A marca JÁ NÃO É só de apresentação: ela é a terceira
 * porta da invariante 19, e ligá-la num local com mais de um computador é 409
 * (`catalog/specs/location.spec.ts`). O que ela não faz é trancar LEITURA: uma
 * sala de reunião que recebeu ativo e ocupante antes de a marca existir continua
 * respondendo aqui, e `isWorkstation` sai na resposta para o cliente saber qual é
 * o caso. 404 é só para id que não existe.
 */
export async function getWorkstation(id: string, podeVerCusto: boolean) {
  // `findUnique`: `Location` não tem `deletedAt`, o catálogo não tem lixeira (D8).
  const local = await prisma.location.findUnique({
    where: { id },
    select: WORKSTATION_DETAIL_SELECT,
  });

  if (!local) throw new AppError('Posto de trabalho não encontrado.', 404);

  const [entregues, caminhos] = await Promise.all([
    // Consulta em `asset`, e não nas `assignments` do posto, de propósito: no
    // topo da consulta a `softDeleteExtension` age, e o ativo na lixeira fica
    // de fora sozinho. Lido pela relação, ele apareceria como equipamento na
    // mesa até alguém lembrar de filtrar à mão.
    prisma.asset.findMany({
      where: { assignments: { some: { targetLocationId: id, checkinAt: null } } },
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
    resolverCaminhos([local.parentId]),
  ]);

  // A relação vira um CAMPO: a tela quer saber se este ativo é um computador e
  // qual máquina consultar, não receber um objeto aninhado de uma chave só.
  const ativos = entregues.map(({ endpoint, ...ativo }) => ({
    ...ativo,
    endpointId: endpoint?.id ?? null,
  }));

  const { parentId, occupants, ...posto } = local;

  return {
    ...posto,
    caminho: parentId ? caminhos.get(parentId) ?? [] : [],

    // Os ocupantes ABERTOS saem aqui para a resposta ser completa por si: um
    // cliente que chame só esta rota precisa saber quem responde pelo posto, e
    // é deles que `vago` é derivado. A TELA de detalhe consome a rota de
    // ocupação (`/api/locations/:id/occupants`) para a mesma lista, porque lá
    // também mora o histórico e é ela que o adicionar/encerrar invalida.
    ocupantes: occupants,
    totalOcupantes: occupants.length,
    ativos,
    totalAtivos: ativos.length,

    // `vago` olha só os ATIVOS: o sinal existe para o equipamento caro parado
    // em mesa sem ninguém.
    vago: ehPostoVago(occupants.length, ativos.length),
  };
}
