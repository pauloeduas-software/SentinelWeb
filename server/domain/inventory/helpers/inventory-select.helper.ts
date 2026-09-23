import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';

// O que de um item de inventário pode sair para o cliente — em UM lugar só,
// usado pela listagem, pela criação e pela edição.
//
// Allowlist pelo mesmo motivo do usuário: `include` (ou `findMany` sem `select`)
// devolve a linha inteira, o que a tabela tiver no dia. O usuário atribuído
// reaproveita `USER_PUBLIC_SELECT` em vez de repetir a lista — repetida, uma
// cópia esquecida na Fase 3 devolveria o `passwordHash` por aqui.
//
// Espelha o contrato de src/domain/shared/inventory.types.ts. `updatedAt` fica
// de fora porque o frontend não usa.
export const INVENTORY_ITEM_SELECT = {
  id: true,
  name: true,
  description: true,
  quantity: true,
  category: true,
  status: true,
  notes: true,
  createdAt: true,
  assignedToId: true,
  assignedTo: { select: USER_PUBLIC_SELECT },
} as const;
