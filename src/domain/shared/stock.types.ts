// O CONTRATO DO ESTOQUE com a API — os três tipos que têm quantidade (F5).
//
// ⚠️ `purchaseCost` é STRING, e não `number`. A coluna é `Decimal` no Postgres
// e o JSON a serializa assim — inclusive perdendo o zero à direita ("1234.50"
// volta "1234.5"). Tipar como `number` aqui reintroduziria o erro de centavo
// que a coluna existe para evitar; quem formata é `formatarMoeda`, que converte
// no último instante. É a armadilha nº 7 da F1, pela terceira vez.

/** Os três tipos, como a API os nomeia. */
export type StockKind = 'ACCESSORY' | 'CONSUMABLE' | 'COMPONENT';

/** O slug da rota de cada um. */
export type StockSlug = 'accessories' | 'consumables' | 'components';

export interface ReferenciaNomeada {
  id: string;
  name: string;
}

export interface CategoriaDoItem extends ReferenciaNomeada {
  type: StockKind;
  color: string | null;
}

/**
 * Uma linha de estoque, já com o saldo que o servidor calculou.
 *
 * `disponivel` NÃO é coluna do banco (D34): é `qty − saídas abertas`, contado a
 * cada leitura. Por isso ele chega junto com `qty` e não substitui: a coluna
 * principal da tela é o par `disponivel / qty`, e mostrar só um dos dois esconde
 * metade da informação — "4" não diz se sobrou muito ou pouco.
 */
export interface ItemDeEstoque {
  id: string;
  name: string;
  qty: number;
  minQty: number | null;
  modelNumber: string | null;
  /** Só no componente. */
  serial?: string | null;

  categoryId: string;
  manufacturerId: string | null;
  supplierId: string | null;
  locationId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  /** STRING — ver o aviso no topo do arquivo. */
  purchaseCost: string | null;

  notes: string | null;

  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  category: CategoriaDoItem | null;
  manufacturer: ReferenciaNomeada | null;
  supplier: ReferenciaNomeada | null;
  location: ReferenciaNomeada | null;

  // ── O saldo, acrescentado na leitura ──────────────────────────────────────
  /** Unidades fora do estoque agora. */
  emUso: number;
  /** `qty − emUso`. Pode ser NEGATIVO — é o sinal de contagem física e nominal brigando. */
  disponivel: number;
  /** `disponivel < minQty`. `false` quando não há piso: sem piso, sem alerta. */
  estoqueBaixo: boolean;
}

/** Para quem um acessório foi entregue. Não existe `ASSET`: isso é `Component`. */
export type AccessoryTarget = 'USER' | 'LOCATION';

/** Uma unidade de acessório que está fora do estoque. */
export interface EntregaDeAcessorio {
  id: string;
  accessoryId: string;
  targetType: AccessoryTarget;
  targetUserId: string | null;
  targetLocationId: string | null;
  checkedOutAt: string;
  expectedCheckinAt: string | null;
  checkedInAt: string | null;
  checkoutNotes: string | null;
  checkinNotes: string | null;
  targetUser: { id: string; name: string; email: string } | null;
  targetLocation: ReferenciaNomeada | null;
  /** Só na lista do POSTO, que embute o item para a tela não buscar de novo. */
  accessory?: { id: string; name: string; modelNumber: string | null; category: CategoriaDoItem | null };
}

/** Uma instalação de componente dentro de um ativo. */
export interface InstalacaoDeComponente {
  id: string;
  componentId: string;
  assignedQty: number;
  attachedAt: string;
  notes: string | null;
  component: {
    id: string;
    name: string;
    serial: string | null;
    modelNumber: string | null;
    category: { id: string; name: string; color: string | null } | null;
    manufacturer: ReferenciaNomeada | null;
  };
}

/** De onde um movimento veio: a tabela de saída ou o `StockLog`. */
export type FonteDoMovimento = 'SAIDA' | 'AJUSTE';

/**
 * A divisão da retirada parcial (D38), já resolvida pelo servidor.
 *
 * O D38 declarou que o preço da divisão seria pago na APRESENTAÇÃO: lido cru, o
 * histórico parece dizer "instalou 4, retirou 4, instalou 2" para uma retirada
 * de duas unidades. É este campo que paga o preço — a linha da retirada traz o
 * que voltou e de quanto, e a instalação da sucessora não aparece, porque
 * aquelas unidades nunca saíram da máquina.
 */
export interface RetiradaParcial {
  /** Quantas voltaram ao estoque. */
  retirada: number;
  /** De quantas a instalação tinha. */
  de: number;
}

/**
 * Uma linha da movimentação — a UNIÃO das duas fontes, feita pelo servidor na
 * leitura. Não existe tabela que guarde as duas coisas (D34).
 */
export interface MovimentoDoItem {
  id: string;
  fonte: FonteDoMovimento;
  /** 'CHECKOUT' | 'CHECKIN' | 'INSTALL' | 'UNINSTALL' | 'ADJUST'. */
  action: string;
  at: string;
  /** Quantas unidades o evento moveu. Negativo é saída. */
  qty: number;
  /** "Laura Souza", "Mesa 1", "ATV-00012 — Dell Latitude", "COMPRA". */
  rotulo: string | null;
  notes: string | null;
  /** Só no `UNINSTALL` que deixou peça para trás. `null` em todo o resto. */
  parcial: RetiradaParcial | null;
  actorId: string | null;
}

/** Por que a quantidade nominal mudou. Enum fechado, como `RetiredReason` (D5). */
export type MotivoDoAjuste =
  | 'COMPRA' | 'DEVOLUCAO_FORNECEDOR' | 'QUEBRA' | 'PERDA' | 'RECONTAGEM' | 'OUTRO';

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
  checkedOutAt: string;
}

/**
 * Os dois sinais do estoque.
 *
 * `postoVago` não é "estoque baixo" com outro nome — é o oposto: a unidade
 * existe, está entregue, e não há ninguém respondendo por ela.
 */
export interface AlertasDeEstoque {
  estoqueBaixo: ItemEmAlerta[];
  postoVago: UnidadeEmPostoVago[];
}

/**
 * Como a responsabilidade por um acessório chegou até a pessoa.
 *
 * Vem POR ITEM, e é isso que impede a soma que o D33 proíbe: 1 direto com 5
 * compartilhados do posto não são "6 mouses da Laura".
 */
export type ViaAcessorio = 'DIRETO' | 'POSTO';

export interface AcessorioEmPosse {
  /** O id da ENTREGA — é dele que sai o botão "devolver". */
  checkoutId: string;
  accessoryId: string;
  name: string;
  categoryName: string | null;
  via: ViaAcessorio;
  checkedOutAt: string;
  expectedCheckinAt: string | null;
  posto: { locationId: string; locationName: string; shift: string | null } | null;
}
