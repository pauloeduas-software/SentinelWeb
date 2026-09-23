// O que de um item de estoque pode sair para o cliente — allowlist, não
// `include`: coluna nova na tabela não aparece em resposta nenhuma até alguém
// escrever o nome dela aqui.
//
// NÃO EXISTE `disponivel` AQUI, e é por construção (D34): o saldo não é coluna,
// é conta sobre as linhas de saída. Quem o acrescenta à resposta é o
// `stock-balance.helper.ts`, depois da consulta — e é por isso que ele não pode
// ser esquecido em silêncio: uma listagem sem ele simplesmente não compila
// contra o tipo `ItemComSaldo`.
//
// As relações vêm embutidas com allowlist própria porque a tabela mostra o NOME
// da categoria e do fornecedor, não o uuid — e uma consulta por linha seria N+1.

const CAMPOS_COMUNS = {
  id: true,
  name: true,
  // QUANTO ENTROU. Sai na resposta ao lado do `disponivel` calculado, e os dois
  // juntos são a coluna principal da tela ("3 / 5").
  qty: true,
  minQty: true,
  modelNumber: true,

  categoryId: true,
  manufacturerId: true,
  supplierId: true,
  locationId: true,

  orderNumber: true,
  purchaseDate: true,
  // Decimal: sai no JSON como STRING ("1234.5" — o zero à direita some).
  purchaseCost: true,

  notes: true,

  // Autoria (D26).
  createdById: true,
  updatedById: true,

  createdAt: true,
  updatedAt: true,
  deletedAt: true,

  category: { select: { id: true, name: true, type: true, color: true } },
  manufacturer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} as const;

export const ACCESSORY_SELECT = CAMPOS_COMUNS;
export const CONSUMABLE_SELECT = CAMPOS_COMUNS;

/** O componente é o único com `serial` — a régua do topo do schema explica. */
export const COMPONENT_SELECT = { ...CAMPOS_COMUNS, serial: true } as const;

/** A pessoa embutida numa linha de movimento. Mesma forma nas três tabelas. */
export const PESSOA_DO_MOVIMENTO = { id: true, name: true, email: true } as const;

/** Uma entrega de acessório, como a tela de movimentação a mostra. */
export const ACCESSORY_CHECKOUT_SELECT = {
  id: true,
  accessoryId: true,
  targetType: true,
  targetUserId: true,
  targetLocationId: true,
  checkedOutAt: true,
  expectedCheckinAt: true,
  checkedInAt: true,
  checkoutNotes: true,
  checkinNotes: true,
  targetUser: { select: PESSOA_DO_MOVIMENTO },
  targetLocation: { select: { id: true, name: true } },
} as const;

/**
 * Um consumo. Note que NÃO há campo de fechamento para selecionar — a coluna
 * não existe (D37), e é essa ausência que faz a devolução ser impossível em vez
 * de proibida.
 */
export const CONSUMABLE_CHECKOUT_SELECT = {
  id: true,
  consumableId: true,
  userId: true,
  // O nome COPIADO no ato: é ele que a tela mostra, não `user.name`. Quem
  // consumiu em março pode ter saído da empresa em abril, e `userId` vira nulo
  // no `SetNull` — o consumo continua legível porque o nome é cópia.
  userNameSnapshot: true,
  qty: true,
  consumedAt: true,
  notes: true,
} as const;

/**
 * Uma instalação em ativo, aberta ou fechada.
 *
 * `notes` e `detachNotes` são DUAS colunas, como `checkoutNotes`/`checkinNotes`
 * na entrega de acessório: a linha guarda dois eventos, e uma observação só
 * faria a da retirada sobrescrever a da instalação.
 *
 * `sucessora` é o outro lado da divisão do D38 — é ela que deixa a movimentação
 * dizer *"parcial: 2 de 4"* comparando as duas linhas em vez de adivinhar pela
 * data. `assignedQty` dela é o que CONTINUOU instalado; o que voltou ao estoque
 * é a diferença.
 */
export const COMPONENT_ASSET_SELECT = {
  id: true,
  componentId: true,
  assetId: true,
  assignedQty: true,
  attachedAt: true,
  detachedAt: true,
  notes: true,
  detachNotes: true,
  predecessorId: true,
  sucessora: { select: { id: true, assignedQty: true } },
  asset: {
    select: {
      id: true, assetTag: true, name: true,
      model: { select: { name: true } },
    },
  },
} as const;
