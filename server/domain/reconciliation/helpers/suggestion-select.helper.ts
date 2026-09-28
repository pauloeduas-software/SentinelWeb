import type { Prisma } from '@prisma/client';

// O QUE A FILA DEVOLVE. Allowlist, como todo `select` do projeto: coluna nova no
// schema não vaza para a API por acidente.
//
// A sugestão sai SEMPRE com a evidência e com os rótulos dos dois lados. Os
// rótulos não são enfeite: "vincular a3f8…-9c21 a 7b2e…-40aa" não é uma pergunta
// que alguém consiga responder, e a fila existe para ser respondida por gente.
export const SUGGESTION_SELECT = {
  id: true,
  kind: true,
  score: true,
  signal: true,
  shift: true,
  evidence: true,
  state: true,
  createdAt: true,
  resolvedAt: true,

  endpoint: {
    select: { id: true, hwid: true, hostname: true, lastSeen: true, biosSerial: true },
  },
  asset: {
    select: { id: true, assetTag: true, name: true, serial: true },
  },
  targetUser: {
    select: { id: true, name: true, email: true },
  },
  targetLocation: {
    select: { id: true, name: true },
  },
  mergeInto: {
    select: { id: true, hwid: true, hostname: true, assetId: true },
  },
} satisfies Prisma.ReconciliationSuggestionSelect;
