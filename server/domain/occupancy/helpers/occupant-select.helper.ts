import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';

// O que de uma ocupação pode sair para o cliente — em UM lugar só, usado pelas
// duas listagens, pela criação e pelo encerramento.
//
// Allowlist, não `include`: coluna nova em `location_occupants` não aparece em
// resposta nenhuma até alguém escrever o nome dela aqui. Com `include`, o
// contrário — toda coluna nova vaza sozinha, e a Camada 2 guarda vínculo de
// pessoa com posto de trabalho, que é exatamente o tipo de dado que não pode
// vazar por descuido.
//
// `user` reaproveita `USER_PUBLIC_SELECT` em vez de repetir a lista: uma cópia
// esquecida na Fase 3 devolveria o `passwordHash` por aqui. Quem decide o que é
// público de um usuário continua sendo o domínio `user`.
//
// `location` vem com id e nome porque a resposta de `/api/users/:id/occupancies`
// precisa dizer QUAL posto a pessoa ocupa — devolver só o uuid obrigaria a tela
// a uma consulta por linha (N+1) para escrever "Mesa 1".
//
// `endedAt` sai SEMPRE, inclusive na visão `current` onde é nulo por definição:
// é o campo que distingue ocupação aberta de encerrada, e o cliente que só
// recebesse as abertas não teria como renderizar o histórico com o mesmo
// componente.
export const OCCUPANT_SELECT = {
  id: true,
  locationId: true,
  userId: true,

  // Texto livre: "Manhã", "Tarde", "12x36 A" (docs/MODELO-POSSE.md, Camada 2).
  shift: true,

  startedAt: true,
  endedAt: true,
  notes: true,

  createdAt: true,

  user: { select: USER_PUBLIC_SELECT },
  location: { select: { id: true, name: true } },
} as const;
