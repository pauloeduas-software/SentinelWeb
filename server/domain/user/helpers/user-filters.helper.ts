import type { Prisma } from '@prisma/client';
import type { ListView } from '../../../core/http/list-query';

// A ALLOWLIST DE ORDENAÇÃO, e `department` SAIU dela na F11 (Etapa D).
//
// Não é faxina: é o defeito que a auditoria da fase nomeou. O token vem da query
// string (`?sort=department`), e com a coluna de texto já apagada pela migração
// 2 de 2 o Prisma emitiria `ORDER BY "department"` sobre coluna inexistente —
// **500 disparado por um parâmetro de URL**, sem nada no código mudando.
//
// E ordenar pelo NOME do departamento não voltou como `departmentId`: ordenar
// por uuid é ordenar por aleatório. Ordenação por relação (`department: { name:
// 'asc' }`) é expressável no Prisma, mas o `parseListQuery` do core mapeia token
// → coluna direta; o dia em que a tela pedir essa coluna, o caminho é um token
// próprio (`departamento`) traduzido no use-case, não este array.
export const USER_SORTABLE = ['name', 'email', 'createdAt'] as const;
export type UserSortable = (typeof USER_SORTABLE)[number];

export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      // Buscar "Comercial" e achar quem trabalha lá: agora é busca na RELAÇÃO,
      // não na coluna de texto. O `?q=` da listagem de pessoas sempre fez isso,
      // e deixar de fazer seria uma perda de função silenciosa na troca.
      { department: { name: { contains: q, mode: 'insensitive' } } },
      // A MATRÍCULA entra junto (F11, Etapa E): é por ela que o RH procura
      // alguém, e é o que vem no crachá.
      { employeeNumber: { contains: q, mode: 'insensitive' } },
      { jobTitle: { contains: q, mode: 'insensitive' } },
    ],
  };
}

// `deletedAt` explícito faz a extension de soft delete sair do caminho (ver
// core/database/soft-delete.extension.ts): é assim que a lixeira alcança as
// linhas apagadas sem um segundo cliente Prisma.
export function buildTrashWhere(view: ListView): Prisma.UserWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
