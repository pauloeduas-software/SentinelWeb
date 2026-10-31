import { PERSON_PUBLIC_SELECT } from '../../person/helpers/person-select.helper';

// O que de uma ocupação pode sair para o cliente — em UM lugar só, usado pelas
// duas listagens, pela criação e pelo encerramento.
//
// Allowlist, não `include`: coluna nova em `workstation_occupants` não aparece em
// resposta nenhuma até alguém escrever o nome dela aqui. Com `include`, o
// contrário — toda coluna nova vaza sozinha, e a Camada 2 guarda vínculo de
// pessoa com posto de trabalho, que é exatamente o tipo de dado que não pode
// vazar por descuido.
//
// `person` reaproveita `PERSON_PUBLIC_SELECT` em vez de repetir a lista: quem
// decide o que é público de um colaborador é o domínio `person`.
//
// `workstation` vem com id e nome porque a resposta de `/api/people/:id/occupancies`
// precisa dizer QUAL posto a pessoa ocupa — devolver só o uuid obrigaria a tela
// a uma consulta por linha (N+1) para escrever "Mesa 1".
//
// `endedAt` sai SEMPRE, inclusive na visão `current` onde é nulo por definição:
// é o campo que distingue ocupação aberta de encerrada, e o cliente que só
// recebesse as abertas não teria como renderizar o histórico com o mesmo
// componente.
export const OCCUPANT_SELECT = {
  id: true,
  workstationId: true,
  personId: true,
  // O nome do posto por escrito, quando ele foi excluído — o histórico da
  // pessoa o lê no lugar de `workstation`, que vem nulo.
  workstationName: true,

  // Texto livre: "Manhã", "Tarde", "12x36 A" (docs/referencia/modelo-de-posse.md, Camada 2).
  shift: true,

  startedAt: true,
  endedAt: true,
  notes: true,

  createdAt: true,

  person: { select: PERSON_PUBLIC_SELECT },
  workstation: { select: { id: true, name: true } },
} as const;

/**
 * A ocupação por escrito, para a auditoria: "Laura Souza — Mesa 1". O posto
 * pelo nome guardado quando ele foi excluído (`workstationName`).
 */
export function rotuloDaOcupacao(ocupacao: {
  person: { name: string };
  workstation: { name: string } | null;
  workstationName: string | null;
}): string {
  return `${ocupacao.person.name} — ${ocupacao.workstation?.name ?? ocupacao.workstationName ?? ''}`;
}
