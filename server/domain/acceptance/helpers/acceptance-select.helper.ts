// O que de um aceite pode sair para quem TEM SESSÃO (o painel).
//
// `token` fica de FORA, e é o campo que importa nesta lista: ele é a credencial
// da página pública. Devolvê-lo na listagem do painel significaria que qualquer
// operador poderia assinar em nome de qualquer colaborador — e o log registraria
// a assinatura como legítima, porque ela viria pelo caminho certo.
//
// `eulaSnapshot` também sai de fora da LISTAGEM: são milhares de caracteres por
// linha. Ele vem na leitura de UM aceite, que é onde alguém o lê.
export const ACCEPTANCE_SELECT = {
  id: true,
  assignmentId: true,
  assetId: true,
  signerUserId: true,
  signerName: true,
  signerEmail: true,
  acceptedAt: true,
  declinedAt: true,
  declineReason: true,
  expiresAt: true,
  remindedAt: true,
  createdAt: true,
  asset: { select: { id: true, assetTag: true, name: true } },
} as const;
