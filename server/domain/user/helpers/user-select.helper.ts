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

  // O PAPEL, e ele está aqui pelo MESMO defeito concreto que trouxe o
  // `managerId` abaixo — não por completude.
  //
  // O formulário abre da listagem e edita o papel. Sem este campo, o `<select>`
  // dele inicializaria em `USUARIO` e **gravaria** `USUARIO`: corrigir o e-mail
  // de um administrador o rebaixaria, em silêncio. A rede do
  // `ultimo-administrador.ts` pegaria o caso do ÚLTIMO; os outros passariam.
  role: true,

  // `managerId` CRU, sem join — e ele está aqui por um defeito concreto, não por
  // completude.
  //
  // O formulário de cadastro abre da listagem e edita o gestor. Sem este campo,
  // o `<select>` dele inicializaria vazio e **gravaria null**: editar o nome de
  // alguém apagaria o gestor dela, calado. É o formulário que limpa o que não
  // mostrou, e a forma de impedi-lo é a listagem trazer o que o formulário
  // edita.
  //
  // CRU e não `manager: { select: { name } }` porque a tabela não mostra o nome
  // do gestor — só o formulário precisa dele, e ali o `ReferenceSelect` resolve
  // o nome a partir do id pelo `/options`. Um join por linha para um dado que a
  // tela não exibe é o que o D135 acabou de tirar daqui.
  managerId: true,
} as const;

// O MESMO usuário, mais o estado do vínculo com a empresa — para a tela de
// PERFIL.
//
// É um select separado, e não duas colunas a mais no de cima, porque o de cima
// vai EMBUTIDO em toda posse e em toda ocupação (`ASSIGNMENT_SELECT`,
// `OCCUPANT_SELECT`): dois campos acrescentados lá viajariam em cada linha de
// histórico de todo ativo, para serem usados em uma tela só.
//
// `isActive` e `terminatedAt` andam juntos porque dizem a mesma coisa por dois
// ângulos — "pode operar?" e "saiu quando?" —, e uma tela que mostrasse só o
// primeiro não teria como escrever a data no lugar do rótulo "desligado".
//
// Continuam de FORA, e não por esquecimento: `username`, `passwordHash`,
// `failedLoginCount` e `lockedUntil`. Perfil de colaborador não é tela de
// credencial, e a allowlist é o que garante que a F3 não os vaze por aqui.
export const USER_DETAIL_SELECT = {
  ...USER_PUBLIC_SELECT,
  isActive: true,
  terminatedAt: true,

  // A IDENTIDADE E O CICLO DE VIDA (F11, Etapa E). Só na tela de PERFIL, pelo
  // mesmo motivo de `isActive`/`terminatedAt`: nove campos a mais em cada linha
  // de cada histórico de cada ativo, para serem usados numa tela só.
  employeeNumber: true,
  jobTitle: true,
  phone: true,
  address: true,
  hiredAt: true,

  // O GESTOR DA PESSOA — quem a cobra, e nunca quem responde pelo ativo dela
  // (D72). Vem com nome porque a tela mostra "responde a Ana Lima".
  manager: { select: { id: true, name: true } },

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

