import {
  diasParaVencer, statusDaLicenca, type LicenseStatus,
} from './license-status.helper';
import type { ContagemDeAssentos } from './license-seats.helper';

// O QUE DE UMA LICENÇA PODE SAIR PARA O CLIENTE — allowlist, não `include`.
//
// NÃO EXISTE `livres` AQUI, e é por construção (D92): a contagem não é coluna,
// é conta sobre as linhas de assento. Quem a acrescenta é o
// `license-seats.helper.ts`, depois da consulta.
//
// NÃO EXISTE `status` AQUI, e é por construção (D44): ele é função das datas e
// do dia de hoje.

export const LICENSE_SELECT = {
  id: true,
  name: true,
  seatsTotal: true,
  reassignable: true,
  maintained: true,

  expirationDate: true,
  terminationDate: true,

  licensedToName: true,
  licensedToEmail: true,

  minSeats: true,

  categoryId: true,
  manufacturerId: true,

  orderNumber: true,
  purchaseDate: true,
  // Decimal: sai no JSON como STRING ("1234.5" — o zero à direita some).
  purchaseCost: true,

  notes: true,

  createdById: true,
  updatedById: true,

  createdAt: true,
  updatedAt: true,
  deletedAt: true,

  category: { select: { id: true, name: true, type: true, color: true } },
  manufacturer: { select: { id: true, name: true } },
} as const;

/** A pessoa embutida numa linha de ocupação. Mesma forma do estoque. */
export const PESSOA_DO_ASSENTO = { id: true, name: true, email: true } as const;

/** O ativo embutido. `assetTag` porque é por ela que se procura na tela. */
export const ATIVO_DO_ASSENTO = {
  id: true, assetTag: true, name: true,
  model: { select: { name: true } },
} as const;

/** Uma ocupação de assento, aberta ou fechada. */
export const SEAT_CHECKOUT_SELECT = {
  id: true,
  seatId: true,
  assignedUserId: true,
  assignedAssetId: true,
  checkoutAt: true,
  checkinAt: true,
  checkoutNotes: true,
  checkinNotes: true,
  assignedUser: { select: PESSOA_DO_ASSENTO },
  assignedAsset: { select: ATIVO_DO_ASSENTO },
} as const;

/** Um assento, com a ocupação ABERTA embutida (no máximo uma — índice único). */
export const SEAT_SELECT = {
  id: true,
  licenseId: true,
  seatNumber: true,
  burnedAt: true,
  retiredAt: true,
  notes: true,
  checkouts: {
    where: { checkinAt: null },
    select: SEAT_CHECKOUT_SELECT,
  },
} as const;

/** A linha crua, como o `select` acima a devolve. */
export interface LinhaDeLicenca extends Record<string, unknown> {
  id: string;
  expirationDate: Date | null;
  terminationDate: Date | null;
  seatsTotal: number;
  minSeats: number | null;
}

/** O que o cliente recebe. */
export type LicencaNaResposta = LinhaDeLicenca & ContagemDeAssentos & {
  status: LicenseStatus;
  diasParaVencer: number | null;
  /** `livres < minSeats`. `false` quando `minSeats` é nulo: sem piso, sem alerta. */
  assentosBaixos: boolean;
};

/**
 * A ÚNICA saída desta camada. Acrescenta o que é derivado.
 *
 * Função pura: as contagens chegam prontas, e o status e o prazo saem das datas
 * da própria linha.
 */
export function paraResposta(
  linha: LinhaDeLicenca,
  contagem: ContagemDeAssentos,
): LicencaNaResposta {
  return {
    ...linha,
    ...contagem,
    status: statusDaLicenca(linha),
    diasParaVencer: diasParaVencer(linha.expirationDate),
    assentosBaixos: linha.minSeats !== null && contagem.livres < linha.minSeats,
  };
}
