import type { Referencia } from './asset.types';

// O CONTRATO DO ESTOQUE com a API — o item por quantidade, a entrega e o
// histórico. A mesma forma da licença (AE): o total é campo da edição, a
// entrega e a devolução têm dia, o item que acabou se desativa.
//
// Ativo é computador; o que não é máquina (monitor, teclado, mouse, cabo) é
// `StockItem`: N unidades intercambiáveis, sem patrimônio individual. Espelha
// `server/domain/stock/helpers/stock-select.helper.ts`.
//
// O item de categoria COMPONENTE (memória, SSD) vai só para computador — o
// alvo `ASSET` — e o resto nunca vai (AI).

type AlvoDaEntrega = 'PERSON' | 'WORKSTATION' | 'ASSET';

interface CategoriaDoItem extends Referencia {
  /** `STOCK` ou `COMPONENT` — é ele que diz para onde o item vai (AI). */
  type: string;
}

/**
 * Um item, já com a conta que o servidor calculou.
 *
 * `emUso` e `disponivel` NÃO são colunas: são contadas a cada leitura. Por isso
 * chegam junto com `qty` e não a substituem — a tela mostra os três.
 */
export interface ItemDeEstoque {
  id: string;
  name: string;
  /** O TOTAL — muda pela edição, nunca abaixo do que está em uso. */
  qty: number;
  categoryId: string;
  /** Onde o que sobra fica guardado (o Depósito de TI). */
  locationId: string | null;
  notes: string | null;
  /** Desativado: não recebe entrega; o que está com alguém continua até voltar. */
  isActive: boolean;

  createdAt: string;
  updatedAt: string;

  category: CategoriaDoItem;
  location: Referencia | null;

  /** Unidades com alguém agora. */
  emUso: number;
  /** Já saiu alguma vez, devolvida ou não. Não impede excluir: só a unidade em uso impede (AG). */
  jaEntregue: boolean;
  /** `qty − emUso`. */
  disponivel: number;
}

/**
 * Uma linha de "Com quem está" — `GET /api/stock/items/:id/checkouts`. É a
 * ENTREGA ("Mesa 1 · 5 unidades"), não a unidade; `id` é o de uma unidade dela,
 * e é por ele que a devolução vai.
 */
export interface EntregaAberta {
  id: string;
  targetType: AlvoDaEntrega;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetAssetId: string | null;
  targetLabel: string;
  checkoutAt: string;
  notes: string | null;
  /** Quantas desta entrega ainda estão com o alvo. */
  unidades: number;
}

/** Um evento do histórico — `GET /api/stock/items/:id/history`. */
export interface EventoDoItem {
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  at: string;
  unidades: number;
  targetType: AlvoDaEntrega;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetAssetId: string | null;
  targetLabel: string;
  notes: string | null;
}

/**
 * Uma entrega aberta como a FICHA DO POSTO, a da PESSOA e a aba Componentes do
 * computador a recebem: o item, a
 * categoria, quantas e desde quando. `item.isActive` vem porque a unidade de um
 * item desativado continua na mesa, e a ficha precisa mostrá-la para alguém
 * devolvê-la — no detalhe do item, para onde a linha aponta.
 */
export interface EntregaNaFicha {
  id: string;
  itemId: string;
  checkoutAt: string;
  notes: string | null;
  unidades: number;
  item: {
    id: string;
    name: string;
    isActive: boolean;
    category: { id: string; name: string };
  };
}

/** O cadastro e a edição — as duas mandam o formulário inteiro (AF). */
export interface ItemDeEstoqueInput {
  name: string;
  categoryId: string;
  /** O total: ao menos 1, no cadastro e na edição, e nunca abaixo do que está em uso. */
  qty: number;
  locationId: string | null;
  notes: string | null;
  /** A versão que o formulário leu ao abrir (AF) — só no Editar; o servidor recusa se a linha mudou. */
  updatedAt?: string;
}

/**
 * O alvo da entrega: colaborador, posto ou — só o componente — computador; um
 * só (`checkout-stock.usecase.ts`). `checkoutAt` é o dia, 'AAAA-MM-DD': hoje ou
 * antes.
 */
export type AlvoDaEntregaDeEstoque = { qty: number; notes?: string | null; checkoutAt: string } & (
  | { targetType: 'PERSON'; targetPersonId: string }
  | { targetType: 'WORKSTATION'; targetWorkstationId: string }
  | { targetType: 'ASSET'; targetAssetId: string }
);

/** O que a devolução responde: quantas voltaram e quantas da entrega ficaram. */
export interface ResultadoDaDevolucao {
  devolvidas: number;
  ficaram: number;
  returnedAt: string;
}
