import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';

// O que do estoque pode sair para o cliente — allowlist, nunca `include`, pelo
// mesmo motivo do `ASSET_SELECT`: coluna nova não aparece em resposta nenhuma
// até alguém escrever o nome dela aqui.

/** O item, com a categoria embutida porque a tabela mostra o NOME dela. */
export const STOCK_ITEM_SELECT = {
  id: true,
  name: true,
  qty: true,
  categoryId: true,
  locationId: true,
  notes: true,

  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,

  category: { select: { id: true, name: true, type: true } },
  location: { select: { id: true, name: true } },
} as const;

/**
 * O movimento, com os dois alvos embutidos: a tela mostra PARA QUEM a unidade
 * foi, não o uuid. `targetUser` reaproveita `USER_PUBLIC_SELECT` — uma cópia
 * esquecida aqui devolveria o `passwordHash` por este caminho.
 *
 * `isWorkstation` sai com o local porque a tela decide se o alvo é um POSTO
 * com ficha (`/postos/:id`) ou um depósito.
 */
export const STOCK_MOVEMENT_SELECT = {
  id: true,
  itemId: true,
  kind: true,
  qty: true,

  targetType: true,
  targetUserId: true,
  targetLocationId: true,

  returnedAt: true,
  notes: true,
  returnNotes: true,

  createdById: true,
  returnedById: true,
  createdAt: true,

  targetUser: { select: USER_PUBLIC_SELECT },
  targetLocation: { select: { id: true, name: true, isWorkstation: true } },
} as const;

/** A unidade fora do estoque como a ficha do POSTO e a da PESSOA a recebem. */
export const STOCK_UNIT_SELECT = {
  id: true,
  itemId: true,
  createdAt: true,
  notes: true,
  targetType: true,
  targetUserId: true,
  targetLocationId: true,
  item: {
    select: {
      id: true, name: true, deletedAt: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const;
