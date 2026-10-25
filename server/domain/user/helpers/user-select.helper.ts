// O que de um usuário pode sair para o cliente — em UM lugar só.
//
// É uma allowlist: campo novo na tabela `User` não aparece em resposta nenhuma
// até alguém escrever o nome dele aqui. É isso que impede o `passwordHash`,
// o `failedLoginCount` e o `lockedUntil` da Fase 3 de vazarem sozinhos por
// qualquer uma das rotas que devolvem um usuário — listagem, criação, edição,
// ou a sessão.
//
// Mora no domínio `user` de propósito: quem decide o que é público de um
// usuário é o dono do usuário, não quem o embute na resposta.
//
// Espelha o contrato de src/domain/shared/user.types.ts. `updatedAt` fica de
// fora porque o frontend não usa.
export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

/**
 * Os campos da conta que a auditoria guarda (AB). A SENHA nunca: nem o hash
 * entra — a troca vai só como `senha: 'alterada'`.
 */
export const CAMPOS_AUDITADOS_DO_USUARIO = ['name', 'email', 'role', 'isActive'] as const;

/**
 * O que a auditoria lê da conta para o retrato e o diff — tirado da lista de
 * cima, para as duas não divergirem: campo na lista e fora do select seria
 * `undefined` dos dois lados, e nunca apareceria na auditoria.
 */
export const USER_AUDIT_SELECT = Object.fromEntries(
  CAMPOS_AUDITADOS_DO_USUARIO.map((campo) => [campo, true]),
) as { [K in (typeof CAMPOS_AUDITADOS_DO_USUARIO)[number]]: true };

type ContaPublica = { [K in keyof typeof USER_PUBLIC_SELECT]: unknown };

/**
 * Da linha lida com o select da auditoria, só o que a resposta pode levar — a
 * mesma lista do `USER_PUBLIC_SELECT`, para as duas não divergirem.
 */
export function soPublico<T extends ContaPublica>(linha: T): Pick<T, keyof typeof USER_PUBLIC_SELECT> {
  const publico: Record<string, unknown> = {};
  for (const campo of Object.keys(USER_PUBLIC_SELECT) as (keyof typeof USER_PUBLIC_SELECT)[]) {
    publico[campo] = linha[campo];
  }
  return publico as Pick<T, keyof typeof USER_PUBLIC_SELECT>;
}

/**
 * A LISTAGEM de usuários — o público mais o que a tabela de Usuários mostra e
 * a sessão não precisa.
 *
 * É o mesmo desenho do `ASSET_SELECT`: o compartilhado é o enxuto, e quem
 * precisa de mais tem o seu.
 */
export const USER_LIST_SELECT = {
  ...USER_PUBLIC_SELECT,

  // O CARGO, para a coluna Cargo da lista. Hoje é sempre Administrador (Z).
  role: true,

  // `isActive` porque é ele que decide o botão da linha — Desativar ou Ativar —
  // e esmaece quem saiu.
  isActive: true,
} as const;
