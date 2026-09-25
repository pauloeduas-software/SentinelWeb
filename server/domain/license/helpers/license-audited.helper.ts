// OS CAMPOS QUE ENTRAM NO DIFF DO `ActivityLog`.
//
// ═════════════════════════════════════════════════════════════════════════════
// `productKey` NÃO ESTÁ AQUI, E É A LINHA MAIS IMPORTANTE DESTE ARQUIVO (D42).
//
// O `buildChanges` grava valor ANTIGO e NOVO de cada campo auditado. Um
// `productKey` nesta lista publicaria a chave — as duas versões dela — numa
// tabela que ninguém pensa em proteger, que é lida por mais gente do que o
// banco e que guarda para sempre. Todo o trabalho de cifrar em repouso viraria
// enfeite: bastaria abrir o histórico da licença.
//
// O que entra no lugar é `hasProductKey: false → true`, escrito à mão pelos
// use-cases de criação e de edição. Ele responde a pergunta que o histórico
// precisa responder — "quando a chave foi cadastrada, e por quem" — sem
// carregar o valor.
//
// Esta é uma das QUATRO portas por onde a chave poderia sair, e as quatro estão
// fechadas no mesmo commit em que a coluna nasceu, porque depois ninguém
// lembra:
//   1. a resposta da API      → `LICENSE_SELECT` + `paraResposta` (allowlist)
//   2. o diff do ActivityLog  → este arquivo
//   3. o log estruturado      → `core/logger/sanitize.ts` (o regex não casava)
//   4. o export CSV da F10    → não existe ainda; anotado no TODO daquela fase
// ═════════════════════════════════════════════════════════════════════════════

export const LICENSE_AUDITED = [
  'name', 'seatsTotal', 'reassignable', 'maintained',
  'expirationDate', 'terminationDate',
  'licensedToName', 'licensedToEmail',
  'minSeats',
  'categoryId', 'manufacturerId', 'supplierId',
  'orderNumber', 'purchaseDate', 'purchaseCost', 'notes',
] as const;

/** Allowlist de ordenação, exigida pelo `core/http/list-query.ts`. */
export const LICENSE_SORTABLE = [
  'name', 'seatsTotal', 'expirationDate', 'purchaseDate', 'createdAt',
] as const;

/**
 * Campos varridos pela busca `?q=`.
 *
 * `productKey` NÃO está aqui, e não seria possível mesmo que estivesse: o valor
 * no banco é texto cifrado, então um `contains` sobre ele nunca casaria com o
 * que a pessoa digitou. Buscar por chave exigiria decifrar a tabela inteira a
 * cada tecla — que é o oposto do que a cifra existe para permitir.
 */
export const LICENSE_SEARCHABLE = [
  'name', 'licensedToName', 'licensedToEmail', 'orderNumber',
] as const;
