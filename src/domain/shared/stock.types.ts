import type { PessoaRef } from './posse.types';
import type { Referencia } from './asset.types';

// O CONTRATO DO ESTOQUE com a API — o item por quantidade e a movimentação.
//
// Ativo é computador; o que não é máquina (monitor, teclado, mouse, cabo) é
// `StockItem`: N unidades intercambiáveis, sem patrimônio individual. Espelha
// `server/domain/stock/helpers/stock-select.helper.ts`.

export type TipoDeMovimento = 'ENTRADA' | 'BAIXA' | 'SAIDA';
export type AlvoDaSaida = 'USER' | 'LOCATION';

export interface CategoriaDoItem extends Referencia {
  type: string;
}

/**
 * Uma linha de estoque, já com o saldo que o servidor calculou.
 *
 * `disponivel` NÃO é coluna do banco: é `qty − fora`, contado a cada leitura. Por
 * isso ele chega junto com `qty` e não substitui: a coluna principal da tela é o
 * par `disponivel / qty`, e mostrar só um dos dois esconde metade da informação.
 */
export interface ItemDeEstoque {
  id: string;
  name: string;
  /** O TOTAL — só muda por entrada e baixa. */
  qty: number;
  categoryId: string;
  /** Onde o que sobra fica guardado (o Depósito de TI). */
  locationId: string | null;
  notes: string | null;

  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  category: CategoriaDoItem;
  location: Referencia | null;

  /** Unidades fora do estoque agora. */
  fora: number;
  /** `qty − fora`. */
  disponivel: number;
}

/** Local embutido como alvo de uma saída. */
export interface LocalDaSaida extends Referencia {
  isWorkstation: boolean;
}

/**
 * Um movimento — `GET /api/stock/items/:id` (as unidades fora) e o que a
 * saída, a entrada e a devolução devolvem.
 *
 * `returnedAt` nulo numa SAIDA é a unidade fora do estoque.
 */
export interface MovimentoDeEstoque {
  id: string;
  itemId: string;
  kind: TipoDeMovimento;
  qty: number;

  targetType: AlvoDaSaida | null;
  targetUserId: string | null;
  targetLocationId: string | null;

  returnedAt: string | null;
  notes: string | null;
  returnNotes: string | null;

  createdById: string | null;
  returnedById: string | null;
  createdAt: string;

  targetUser: PessoaRef | null;
  targetLocation: LocalDaSaida | null;
}

/** O item aberto: a linha com o saldo e as unidades que estão fora. */
export interface ItemDeEstoqueDetalhe extends ItemDeEstoque {
  unidadesFora: MovimentoDeEstoque[];
}

/**
 * Uma unidade fora do estoque como a FICHA DO POSTO e a da PESSOA a recebem:
 * o item, a categoria, desde quando. `item.deletedAt` vem porque a unidade de
 * um item na lixeira continua na mesa, e a ficha precisa mostrá-la para alguém
 * devolvê-la.
 */
export interface UnidadeDeEstoque {
  id: string;
  itemId: string;
  createdAt: string;
  notes: string | null;
  targetType: AlvoDaSaida | null;
  targetUserId: string | null;
  targetLocationId: string | null;
  item: {
    id: string;
    name: string;
    deletedAt: string | null;
    category: { id: string; name: string };
  };
}

/**
 * Um evento da movimentação — `GET /api/stock/items/:id/movements`.
 *
 * Uma saída rende DOIS eventos (a saída e a devolução), por isso `action` tem
 * quatro valores e `movementId` repete nos dois.
 */
export type AcaoDoMovimento = TipoDeMovimento | 'DEVOLUCAO';

export interface EventoDeEstoque {
  id: string;
  movementId: string;
  action: AcaoDoMovimento;
  at: string;
  qty: number;
  targetLabel: string | null;
  targetType: AlvoDaSaida | null;
  targetUserId: string | null;
  targetLocationId: string | null;
  notes: string | null;
  actorId: string | null;
}

/**
 * O que a saída responde — `POST /api/stock/items/:id/checkout`.
 *
 * As unidades vêm no formato de `MovimentoDeEstoque`, prontas para a tela
 * listar "o que acabou de sair"; `disponivel` é o saldo JÁ COM a saída
 * aplicada, do mesmo jeito que `ResultadoDaDevolucao` traz `livres` depois da
 * devolução — a tela não recalcula, só lê.
 */
export interface ResultadoDaSaida {
  unidades: MovimentoDeEstoque[];
  disponivel: number;
}

/**
 * O que a entrada e a baixa respondem — `POST /api/stock/items/:id/adjust`.
 *
 * `item` já vem com o saldo (`ItemDeEstoque`), e `movimento` é a linha que a
 * operação gravou — a tela troca o item da listagem por `item` e pode mostrar
 * `movimento` na linha do tempo sem esperar o próximo GET.
 */
export interface ResultadoDoAjuste {
  item: ItemDeEstoque;
  movimento: MovimentoDeEstoque;
}

/** O corpo do cadastro — `qty` é a quantidade INICIAL, e vira a primeira entrada. */
export interface CriarItemDeEstoqueInput {
  name: string;
  categoryId: string;
  qty?: number;
  locationId?: string | null;
  notes?: string | null;
}

/** O corpo da edição. Sem `qty`: o total muda por entrada e baixa, nunca por aqui. */
export interface EditarItemDeEstoqueInput {
  name?: string;
  categoryId?: string;
  locationId?: string | null;
  notes?: string | null;
}

/** Entrada soma ao total; baixa subtrai, nunca abaixo do que está fora. */
export interface AjustarEstoqueInput {
  kind: 'ENTRADA' | 'BAIXA';
  qty: number;
  notes?: string | null;
}

/** O alvo da saída: colaborador OU posto, nunca os dois (checkout-stock.usecase.ts). */
export type AlvoDaSaidaInput =
  | { targetType: 'USER'; targetUserId: string; qty: number; notes?: string | null }
  | { targetType: 'LOCATION'; targetLocationId: string; qty: number; notes?: string | null };
