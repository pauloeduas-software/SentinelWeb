import { prisma } from '../../../core/database/prismaClient';

// "QUANTOS MOUSES A LAURA TEM?" — e por que a resposta é DUAS (D33).
//
// ─────────────────────────────────────────────────────────────────────────────
// A unidade entregue à Mesa 1 é UMA unidade entregue, qualquer que seja o
// número de ocupantes. `resolverResponsaveis()` devolve Laura E Ana, e o saldo
// cai 1 — porque quantidade é fato do almoxarifado e número de ocupantes é fato
// da escala. Ligar os dois inventaria movimentação que não aconteceu.
//
// A CONSEQUÊNCIA na tela: "quantos mouses a Laura tem?" ganha duas respostas
// honestas — os DIRETOS e os do POSTO, compartilhados — e elas NUNCA são
// somadas num número só. Somar produz "Laura tem 6 mouses" a partir de 5
// compartilhados, uma frase falsa sobre o patrimônio.
//
// É por isso que `via` vem POR ITEM, e não existe um total nesta resposta. A
// forma é a mesma que a F4 já usa nos ativos (`ViaPosse`), de propósito: quem
// lê a tela do colaborador vê acessório e ativo com o mesmo vocabulário.
// ─────────────────────────────────────────────────────────────────────────────

/** Como a responsabilidade pelo acessório chegou até a pessoa. */
export type ViaAcessorio = 'DIRETO' | 'POSTO';

export interface AcessorioEmPosse {
  /** O id da ENTREGA, não o do acessório: é dele que sai o botão "devolver". */
  checkoutId: string;
  accessoryId: string;
  name: string;
  categoryName: string | null;
  via: ViaAcessorio;
  checkedOutAt: Date;
  expectedCheckinAt: Date | null;
  /**
   * Por qual posto a unidade chegou. Só quando `via === 'POSTO'`.
   *
   * COMPARTILHADO: os outros ocupantes daquele posto respondem pela MESMA
   * unidade. A tela precisa dizer isso, senão dois perfis mostram o mesmo
   * mouse como se fossem dois.
   */
  posto: { locationId: string; locationName: string; shift: string | null } | null;
}

const SELECT_ENTREGA = {
  id: true,
  accessoryId: true,
  checkedOutAt: true,
  expectedCheckinAt: true,
  targetLocationId: true,
  accessory: { select: { name: true, category: { select: { name: true } } } },
} as const;

export async function listUserAccessories(userId: string): Promise<AcessorioEmPosse[]> {
  // `accessory: { deletedAt: null }` EXPLÍCITO nas duas consultas.
  //
  // `accessory_checkouts` não tem `deletedAt`, então a extension não escopa
  // isto — e ela não alcança relação aninhada de jeito nenhum. Sem a linha, um
  // acessório mandado para a lixeira com unidade na rua apareceria na tela do
  // colaborador sem existir em listagem nenhuma: ele seria cobrado por um item
  // que o operador não consegue abrir. É a mesma escolha do `contarPosseAberta`.
  const diretos = await prisma.accessoryCheckout.findMany({
    where: {
      targetType: 'USER',
      targetUserId: userId,
      checkedInAt: null,
      accessory: { deletedAt: null },
    },
    select: SELECT_ENTREGA,
    orderBy: { checkedOutAt: 'asc' },
  });

  const ocupacoes = await prisma.locationOccupant.findMany({
    where: { userId, endedAt: null },
    select: { locationId: true, shift: true, location: { select: { name: true } } },
    orderBy: [{ location: { name: 'asc' } }, { shift: 'asc' }],
  });

  const linhas: AcessorioEmPosse[] = diretos.map((entrega) => ({
    checkoutId: entrega.id,
    accessoryId: entrega.accessoryId,
    name: entrega.accessory.name,
    categoryName: entrega.accessory.category?.name ?? null,
    via: 'DIRETO',
    checkedOutAt: entrega.checkedOutAt,
    expectedCheckinAt: entrega.expectedCheckinAt,
    posto: null,
  }));

  // Ninguém ocupa posto nenhum: não há segunda consulta a fazer.
  if (ocupacoes.length === 0) return linhas;

  const postoPorLocal = new Map(ocupacoes.map((ocupacao) => [ocupacao.locationId, {
    locationId: ocupacao.locationId,
    locationName: ocupacao.location.name,
    shift: ocupacao.shift,
  }]));

  // UMA consulta com `in: [...]`, e não uma por posto: a escala de cinco mesas
  // viraria cinco viagens ao banco para pintar um perfil. Mesmo desenho do
  // `listUserHoldings` da F4.
  const doPosto = await prisma.accessoryCheckout.findMany({
    where: {
      targetType: 'LOCATION',
      targetLocationId: { in: [...postoPorLocal.keys()] },
      checkedInAt: null,
      accessory: { deletedAt: null },
    },
    select: SELECT_ENTREGA,
    orderBy: { checkedOutAt: 'asc' },
  });

  for (const entrega of doPosto) {
    const posto = entrega.targetLocationId ? postoPorLocal.get(entrega.targetLocationId) : undefined;
    linhas.push({
      checkoutId: entrega.id,
      accessoryId: entrega.accessoryId,
      name: entrega.accessory.name,
      categoryName: entrega.accessory.category?.name ?? null,
      via: 'POSTO',
      checkedOutAt: entrega.checkedOutAt,
      expectedCheckinAt: entrega.expectedCheckinAt,
      posto: posto ?? null,
    });
  }

  return linhas;
}
