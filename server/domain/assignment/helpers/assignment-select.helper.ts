import { PERSON_PUBLIC_SELECT } from '../../person/helpers/person-select.helper';

// O que de uma posse pode sair para o cliente — em UM lugar só, usado pela
// entrega, pela devolução e pelo histórico do ativo.
//
// Allowlist, não `include`: coluna nova em `assignments` não aparece em resposta
// nenhuma até alguém escrever o nome dela aqui. Mesmo padrão — e mesmo motivo —
// do `ASSET_SELECT` (asset/helpers/asset-select.helper.ts).
//
// Os dois alvos vêm embutidos com allowlist própria porque a tela mostra o NOME
// de quem recebeu, não o uuid — e uma consulta por linha do histórico seria
// N+1. O `targetPerson` reaproveita `PERSON_PUBLIC_SELECT` em vez de listar os
// campos de novo: quem decide o que é público de um colaborador é o domínio
// `person`.
export const ASSIGNMENT_SELECT = {
  id: true,
  assetId: true,

  targetType: true,
  targetPersonId: true,
  targetWorkstationId: true,
  // O nome por escrito do posto que foi excluído: sem ele, o histórico do ativo
  // diria "Entregue:" e nada.
  targetWorkstationName: true,

  checkoutAt: true,
  expectedCheckinAt: true,
  checkinAt: true,

  checkoutNotes: true,
  checkinNotes: true,

  createdAt: true,

  targetPerson: { select: PERSON_PUBLIC_SELECT },
  targetWorkstation: { select: { id: true, name: true } },
} as const;
