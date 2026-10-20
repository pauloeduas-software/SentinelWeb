import { PERSON_PUBLIC_SELECT } from '../../person/helpers/person-select.helper';

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

  createdAt: true,
  updatedAt: true,
  deletedAt: true,

  category: { select: { id: true, name: true, type: true } },
  location: { select: { id: true, name: true } },
} as const;

/**
 * O movimento, com os dois alvos embutidos: a tela mostra PARA QUEM a unidade
 * foi, não o uuid. `targetPerson` reaproveita `PERSON_PUBLIC_SELECT`: quem
 * decide o que é público de um colaborador é o domínio `person`.
 */
export const STOCK_MOVEMENT_SELECT = {
  id: true,
  itemId: true,
  kind: true,
  qty: true,

  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  // O nome por escrito do posto excluído — o histórico do item o lê quando
  // `targetWorkstation` vem nulo.
  targetWorkstationName: true,

  returnedAt: true,
  notes: true,

  createdAt: true,

  targetPerson: { select: PERSON_PUBLIC_SELECT },
  targetWorkstation: { select: { id: true, name: true } },
} as const;

/** A unidade fora do estoque como a ficha do POSTO e a da PESSOA a recebem. */
export const STOCK_UNIT_SELECT = {
  id: true,
  itemId: true,
  createdAt: true,
  notes: true,
  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  item: {
    select: {
      id: true, name: true, deletedAt: true,
      category: { select: { id: true, name: true } },
    },
  },
} as const;
