import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';

// O que de uma posse pode sair para o cliente — em UM lugar só, usado pela
// entrega, pela devolução e pelo histórico do ativo.
//
// Allowlist, não `include`: coluna nova em `assignments` não aparece em resposta
// nenhuma até alguém escrever o nome dela aqui. Mesmo padrão — e mesmo motivo —
// do `ASSET_SELECT` (asset/helpers/asset-select.helper.ts).
//
// Os três alvos vêm embutidos com allowlist própria porque a tela mostra o NOME
// de quem recebeu, não o uuid — e uma consulta por linha do histórico seria
// N+1. O `targetUser` reaproveita `USER_PUBLIC_SELECT` em vez de listar os
// campos de novo: uma cópia esquecida na Fase 3 devolveria o `passwordHash` por
// aqui.
//
// `checkoutById` e `checkinById` ficam de FORA de propósito: são sempre nulos
// até a autenticação da F3 (mesmo caso do `ActivityLog.actorId`), e devolver um
// campo que nunca tem valor ensina o frontend a ignorá-lo — justamente o hábito
// que vai esconder o dado quando ele passar a existir. Entram junto com o login.
export const ASSIGNMENT_SELECT = {
  id: true,
  assetId: true,

  targetType: true,
  targetUserId: true,
  targetAssetId: true,
  targetLocationId: true,

  checkoutAt: true,
  expectedCheckinAt: true,
  checkinAt: true,

  checkoutNotes: true,
  checkinNotes: true,

  createdAt: true,

  targetUser: { select: USER_PUBLIC_SELECT },
  targetAsset: { select: { id: true, assetTag: true, name: true } },
  targetLocation: { select: { id: true, name: true } },
} as const;
