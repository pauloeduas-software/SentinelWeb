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
  department: true,
  createdAt: true,
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
} as const;
