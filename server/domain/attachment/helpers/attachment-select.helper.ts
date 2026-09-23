// O que de um anexo pode sair para o cliente — allowlist, como todo `select` do
// projeto.
//
// `path` fica de FORA, e é o campo mais importante desta lista. Ele é o nome no
// disco, e devolvê-lo entregaria ao cliente exatamente o que o D84 existe para
// ele não ter: um caminho para tentar buscar por fora da rota autenticada. O
// cliente referencia o anexo pelo `id`, e o `id` só vale com sessão.
export const ATTACHMENT_SELECT = {
  id: true,
  assetId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedById: true,
  createdAt: true,
} as const;
