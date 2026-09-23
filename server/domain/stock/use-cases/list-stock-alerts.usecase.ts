import { prisma } from '../../../core/database/prismaClient';
import { comSaldo, contarEmUso } from '../helpers/stock-balance.helper';
import {
  SPEC_POR_KIND, STOCK_KINDS, type StockKind, type StockKindSpec,
} from '../helpers/stock-kind.helper';

// OS DOIS SINAIS DO ESTOQUE, numa rota só.
//
// UMA rota e não `/api/accessories/alerts`, como o TODO previa: o alerta vale
// para os três tipos e a tela é uma só, então o tipo é FILTRO. E o *posto vago
// com unidade parada* entra como SEGUNDA categoria — ele não é "estoque baixo"
// com outro nome, é o oposto: a unidade existe, está entregue, e não há ninguém
// respondendo por ela.

export interface ItemEmAlerta {
  kind: StockKind;
  id: string;
  name: string;
  qty: number;
  minQty: number | null;
  disponivel: number;
  categoryName: string | null;
  locationName: string | null;
}

export interface UnidadeEmPostoVago {
  checkoutId: string;
  accessoryId: string;
  accessoryName: string;
  locationId: string;
  locationName: string;
  checkedOutAt: Date;
}

export interface AlertasDeEstoque {
  /** `disponivel < minQty`. Item sem `minQty` nunca entra: sem piso, sem alerta. */
  estoqueBaixo: ItemEmAlerta[];
  /**
   * Unidade entregue a um posto que hoje não tem NENHUM ocupante aberto.
   *
   * Não é erro e nunca foi recusado na entrega: preparar a mesa antes de a
   * pessoa chegar é o caso real. O que a lista diz é que ninguém responde por
   * aquela unidade — é o *posto vago* do docs/MODELO-POSSE.md aplicado ao
   * estoque, e o candidato natural a voltar para o almoxarifado.
   *
   * Só ACESSÓRIO aparece aqui: é o único dos três cujo alvo pode ser um posto.
   */
  postoVago: UnidadeEmPostoVago[];
}

/** Teto por categoria de alerta — alerta é lista para agir, não relatório. */
const LIMITE = 200;

async function itensAbaixoDoMinimo(spec: StockKindSpec): Promise<ItemEmAlerta[]> {
  // O FILTRO GROSSO VAI AO BANCO: só quem tem piso pode disparar alerta, e isso
  // corta a maior parte da tabela sem trazer linha nenhuma. O filtro FINO
  // (`disponivel < minQty`) não cabe em `where` porque `disponivel` não é
  // coluna — é a conta do D34 —, e esse é o preço declarado da decisão.
  //
  // Ele é pequeno: a lista de itens COM piso é o que o almoxarifado escolheu
  // vigiar, não o catálogo inteiro. Se um dia crescer, a saída é uma view
  // materializada do saldo — nunca uma coluna, que reabriria o D34.
  const itens = await spec.delegate(prisma).findMany({
    where: { minQty: { not: null } },
    select: {
      id: true, name: true, qty: true, minQty: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  }) as {
    id: string; name: string; qty: number; minQty: number | null;
    category: { name: string } | null; location: { name: string } | null;
  }[];

  if (itens.length === 0) return [];

  const emUso = await contarEmUso(prisma, spec.kind, itens.map((item) => item.id));

  return itens
    .map((item) => comSaldo(item, emUso.get(item.id) ?? 0))
    .filter((item) => item.estoqueBaixo)
    .slice(0, LIMITE)
    .map((item) => ({
      kind: spec.kind,
      id: item.id,
      name: item.name,
      qty: item.qty,
      minQty: item.minQty,
      disponivel: item.disponivel,
      categoryName: item.category?.name ?? null,
      locationName: item.location?.name ?? null,
    }));
}

/**
 * Unidades paradas em posto sem ninguém.
 *
 * FILTRO DO PRISMA, nunca `.filter()` depois da consulta — a mesma regra do
 * `POSTO_VAGO` da listagem de ativos: filtrando no cliente, o teto de 200
 * cortaria antes de saber quais linhas interessam.
 */
async function unidadesEmPostoVago(): Promise<UnidadeEmPostoVago[]> {
  const paradas = await prisma.accessoryCheckout.findMany({
    where: {
      checkedInAt: null,
      targetType: 'LOCATION',
      // SÓ POSTO DE TRABALHO. A entrega aceita qualquer localização — o alvo
      // `LOCATION` da F4 também aceita, e o `/options` de localizações devolve
      // tudo de propósito (o pai de uma mesa é uma sala) —, então nada impede
      // entregar unidades a um prédio ou ao almoxarifado.
      //
      // Sem este filtro, essas unidades entravam aqui PARA SEMPRE: prédio não
      // tem ocupante e nunca vai ter, então `occupants: none` é verdade eterna
      // para ele. O alerta é uma lista para AGIR — e uma lista que nunca esvazia
      // é uma lista que se para de ler. Pior: o nome linka para `/postos`, que
      // não lista o que não é posto, e o clique não levava a lugar nenhum.
      //
      // Unidade guardada num almoxarifado não é *posto vago*: é estoque no
      // lugar certo. O sinal existe para a mesa sem ninguém.
      targetLocation: { isWorkstation: true, occupants: { none: { endedAt: null } } },
      // O acessório na lixeira sai da lista: ele não está mais no inventário, e
      // mandar alguém buscar de volta uma unidade de um item apagado seria
      // pedir uma ação que nenhuma tela oferece. Mesma escolha do `holdings`.
      accessory: { deletedAt: null },
    },
    select: {
      id: true,
      accessoryId: true,
      checkedOutAt: true,
      accessory: { select: { name: true } },
      targetLocation: { select: { id: true, name: true } },
    },
    orderBy: { checkedOutAt: 'asc' },
    take: LIMITE,
  });

  return paradas.flatMap((parada) => (
    // `targetLocation` é não-nulo por CHECK do banco quando `targetType` é
    // LOCATION; o `flatMap` existe só para o compilador, sem `!`.
    parada.targetLocation
      ? [{
          checkoutId: parada.id,
          accessoryId: parada.accessoryId,
          accessoryName: parada.accessory.name,
          locationId: parada.targetLocation.id,
          locationName: parada.targetLocation.name,
          checkedOutAt: parada.checkedOutAt,
        }]
      : []
  ));
}

export async function listStockAlerts(tipo?: StockKind): Promise<AlertasDeEstoque> {
  const kinds = tipo ? [tipo] : [...STOCK_KINDS];

  const [porTipo, postoVago] = await Promise.all([
    Promise.all(kinds.map((kind) => itensAbaixoDoMinimo(SPEC_POR_KIND[kind]))),
    // O posto vago só existe para acessório; filtrar por outro tipo devolve
    // lista vazia, em vez de o filtro ser ignorado em silêncio.
    !tipo || tipo === 'ACCESSORY' ? unidadesEmPostoVago() : Promise.resolve([]),
  ]);

  return { estoqueBaixo: porTipo.flat(), postoVago };
}
