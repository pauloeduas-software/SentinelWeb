// O QUE DE UMA AUDITORIA SAI PARA O CLIENTE — allowlist, não `include`.
//
// NÃO HÁ RELAÇÃO PARA `locationIdBefore` NEM PARA `locationIdFound`, e não é
// esquecimento: as duas colunas são UUID SEM FK (ver o schema). O nome do local
// é resolvido pela leitura, com uma consulta em lote — o que permite mostrar
// "(local removido)" em vez de sumir com a linha quando a sala deixa de existir.

export const AUDIT_SELECT = {
  id: true,
  assetId: true,
  auditedAt: true,
  result: true,
  method: true,
  locationIdBefore: true,
  locationIdFound: true,
  divergenciaDePosse: true,
  postoVago: true,
  notes: true,
  auditedById: true,
} as const;

/** O ativo embutido nas listagens de conferência. */
export const ATIVO_DA_CONFERENCIA = {
  id: true,
  assetTag: true,
  name: true,
  serial: true,
  locationId: true,
  lastAuditAt: true,
  model: { select: { name: true, manufacturer: { select: { name: true } } } },
  status: { select: { id: true, name: true, color: true } },
} as const;
