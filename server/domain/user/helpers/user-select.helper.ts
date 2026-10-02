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

// ═══════════════════════════════════════════════════════════════════════════
// O DEPARTAMENTO SAIU DAQUI NA F11, e a saída é a decisão da Etapa D (D135).
//
// Ele era `department: true` — uma coluna de texto. Virou relação
// (`departmentId` → `departments`), e o que a tela mostra é o NOME, não o uuid.
// Então a pergunta deixou de ser "qual texto" e passou a ser *onde pagar o
// join*.
//
// AQUI NÃO PODE SER. Este select vai EMBUTIDO em:
//   `ASSET_SELECT.assignedTo`     — toda linha de toda listagem de ativo
//   `ASSIGNMENT_SELECT`           — toda posse de todo histórico
//   `OCCUPANT_SELECT`             — todo ocupante de todo posto
//   `SessionUser`                 — a releitura de sessão, A CADA requisição
//
// Um `department: { select: { id, name } }` aqui é um `LEFT JOIN` em
// `departments` em cada um desses caminhos, para um dado que nenhum deles
// mostra. É exatamente o argumento que já tinha mantido `isActive` e
// `terminatedAt` fora daqui (ver `USER_DETAIL_SELECT`), e o mesmo que tirou a
// regra de depreciação do `ASSET_SELECT` na revisão da F8.
//
// Quem precisa do nome do departamento pede por um dos dois selects abaixo.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O departamento como ele sai para o cliente — o nome, não o uuid.
 *
 * Fragmento declarado uma vez e reusado nos dois selects que o incluem: duas
 * cópias divergiriam no dia em que o `code` passasse a aparecer na tela.
 */
const DEPARTAMENTO_SELECT = { select: { id: true, name: true } } as const;

/**
 * A LISTAGEM de colaboradores — o público mais a coluna Departamento.
 *
 * Existe separado porque a tabela de `/users` mostra o departamento e é a ÚNICA
 * listagem que o mostra. Com ele no `USER_PUBLIC_SELECT`, o join viajaria em
 * todas as outras; sem um select próprio, a coluna da tela ficaria vazia.
 *
 * É o mesmo desenho do `ASSET_SELECT_COM_CAMPOS`: o compartilhado é o enxuto, e
 * quem precisa de mais tem o seu.
 */
export const USER_LIST_SELECT = {
  ...USER_PUBLIC_SELECT,
  department: DEPARTAMENTO_SELECT,

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
// PERFIL e para a resposta do desligamento.
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

  department: DEPARTAMENTO_SELECT,
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
  authSource: true,
  directorySyncedAt: true,
  directoryMissingAt: true,
} as const;

// O `comDepartamento()` NÃO EXISTE MAIS (F11, Etapa J).
//
// Ele achatava `department_` em `department` na borda, porque o nome da relação
// estava ocupado pela COLUNA DE TEXTO em transição. Com o `DROP COLUMN` aplicado,
// a relação voltou a se chamar `department` no schema e os dois selects acima já
// devolvem a forma final — então a função perdeu a razão de existir, e as três
// chamadas dela (listagem, detalhe e liderados) perderam uma linha cada.
//
// É o desfecho que o comentário dela prometia desde a Etapa D: *"no dia em que a
// coluna cair, o schema volta a poder chamar a relação de `department` e esta
// função perde duas linhas. Nenhuma tela muda."* Nenhuma tela mudou — o contrato
// da API sempre foi `department: { id, name }`.
