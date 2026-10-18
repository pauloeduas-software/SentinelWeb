// O que de um usuário pode sair para o cliente — em UM lugar só.
//
// É uma allowlist: campo novo na tabela `User` não aparece em resposta nenhuma
// até alguém escrever o nome dele aqui. É isso que impede o `passwordHash`,
// o `failedLoginCount` e o `lockedUntil` da Fase 3 de vazarem sozinhos por
// qualquer uma das rotas que devolvem um usuário — listagem, criação, edição,
// ou a posse embutida no inventário.
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
 * A LISTAGEM de colaboradores — o público mais o que a tabela de `/users`
 * mostra e nenhuma outra listagem precisa.
 *
 * É o mesmo desenho do `ASSET_SELECT`: o compartilhado é o enxuto, e quem
 * precisa de mais tem o seu.
 */
export const USER_LIST_SELECT = {
  ...USER_PUBLIC_SELECT,

  // O CARGO, e ele está aqui por um defeito concreto, não por completude.
  //
  // O formulário abre da listagem e edita o cargo. Sem este campo, o `<select>`
  // dele inicializaria em `USUARIO` e **gravaria** `USUARIO`: corrigir o e-mail
  // de um administrador o rebaixaria, em silêncio. A rede do
  // `ultimo-administrador.ts` pegaria o caso do ÚLTIMO; os outros passariam.
  role: true,

  // `isActive` porque é ele que decide o botão da linha — Desativar ou Ativar —
  // e esmaece quem saiu da empresa.
  isActive: true,
} as const;

// O MESMO usuário, mais o estado do vínculo com a empresa — para a tela de
// PERFIL.
//
// É um select separado, e não duas colunas a mais no de cima, porque o de cima
// vai EMBUTIDO em toda posse e em toda ocupação (`ASSIGNMENT_SELECT`,
// `OCCUPANT_SELECT`): dois campos acrescentados lá viajariam em cada linha de
// histórico de todo ativo, para serem usados em uma tela só.
//
// Continuam de FORA, e não por esquecimento: `passwordHash`,
// `failedLoginCount` e `lockedUntil`. A allowlist é o que garante que a F3
// não os vaze por aqui.
export const USER_DETAIL_SELECT = {
  ...USER_PUBLIC_SELECT,
  isActive: true,
} as const;

