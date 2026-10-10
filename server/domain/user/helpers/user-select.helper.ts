// O que de um usuário pode sair para o cliente — em UM lugar só.
//
// É uma allowlist: campo novo na tabela `User` não aparece em resposta nenhuma
// até alguém escrever o nome dele aqui. É isso que impede o `passwordHash`,
// o `failedLoginCount` e o `lockedUntil` da Fase 3 de vazarem sozinhos por
// qualquer uma das rotas que devolvem um usuário — listagem, criação, edição,
// ou o `assignedTo` embutido no inventário.
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

  // O PAPEL, e ele está aqui por um defeito concreto, não por completude.
  //
  // O formulário abre da listagem e edita o papel. Sem este campo, o `<select>`
  // dele inicializaria em `USUARIO` e **gravaria** `USUARIO`: corrigir o e-mail
  // de um administrador o rebaixaria, em silêncio. A rede do
  // `ultimo-administrador.ts` pegaria o caso do ÚLTIMO; os outros passariam.
  role: true,

  // `isActive` pelo MESMO motivo, e o defeito aqui é ainda mais calado: o
  // formulário edita o vínculo com a empresa, e sem o campo na linha o checkbox
  // nasceria MARCADO — corrigir o telefone de quem foi desativado o reativaria,
  // devolvendo acesso ao sistema a quem saiu.
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
// Continuam de FORA, e não por esquecimento: `username`, `passwordHash`,
// `failedLoginCount` e `lockedUntil`. Perfil de colaborador não é tela de
// credencial, e a allowlist é o que garante que a F3 não os vaze por aqui.
export const USER_DETAIL_SELECT = {
  ...USER_PUBLIC_SELECT,
  isActive: true,

  // A IDENTIDADE (F11, Etapa E). Só na tela de PERFIL, pelo mesmo motivo de
  // `isActive`: campos a mais em cada linha de cada histórico de cada ativo,
  // para serem usados numa tela só.
  employeeNumber: true,
  jobTitle: true,
  phone: true,
  address: true,
  hiredAt: true,

  // ── DE ONDE VEM ESTA IDENTIDADE (F11, Etapa I — D78) ─────────────────────
  //
  // SÓ NO DETALHE, e não no `USER_LIST_SELECT`: a listagem de pessoas não mostra
  // origem de identidade, e três campos a mais por linha em quinhentas linhas são
  // o que o D135 acabou de tirar daqui.
  //
  // `externalId` NÃO SAI, de propósito. Ele é o identificador da pessoa no
  // provedor de identidade (o `oid` do tenant), e a tela não tem nada a fazer com
  // ele: o que ela precisa dizer é *"vem do diretório"* e *"sumiu de lá em tal
  // dia"*, que é o que estes três campos respondem. Expor o `oid` de cada
  // colaborador numa resposta de API é dar a quem lê o painel metade de uma
  // correlação com o Entra ID, sem ninguém ter pedido.
} as const;

