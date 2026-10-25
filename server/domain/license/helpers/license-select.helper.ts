import {
  diasParaVencer, statusDaLicenca, type LicenseStatus,
} from './license-status.helper';
import { contarLivres, type ContagemDaLicenca, type UsoDaLicenca } from './license-count.helper';

// O QUE DE UMA LICENÇA PODE SAIR PARA O CLIENTE — allowlist, não `include`.
//
// NÃO EXISTE `livres` AQUI, e é por construção: a contagem não é coluna, é conta
// sobre as linhas de entrega (`license-count.helper.ts`), acrescentada depois
// da consulta.
//
// NÃO EXISTE `status` AQUI, e é por construção (D44): ele é função das datas e
// do dia de hoje.
//
// NEM A CHAVE DE PRODUTO (`productKey`): a listagem, a busca, o alerta, a aba do
// ativo, a ficha e os históricos não a devolvem. Só o DETALHE —
// `LICENSE_DETAIL_SELECT` e `CHECKOUT_COM_CHAVE_SELECT`, mais abaixo.

export const LICENSE_SELECT = {
  id: true,
  name: true,
  seatsTotal: true,

  expirationDate: true,
  terminationDate: true,

  licensedToName: true,
  licensedToEmail: true,

  categoryId: true,
  manufacturerId: true,

  orderNumber: true,
  purchaseDate: true,
  // Decimal: sai no JSON como STRING ("1234.5" — o zero à direita some).
  purchaseCost: true,

  notes: true,

  createdAt: true,
  updatedAt: true,

  category: { select: { id: true, name: true, type: true } },
  manufacturer: { select: { id: true, name: true } },
} as const;

/** A pessoa embutida numa entrega. Mesma forma do estoque. */
const PESSOA_DA_ENTREGA = { id: true, name: true, email: true } as const;

/** O ativo embutido. `assetTag` porque é por ela que se procura na tela. */
const ATIVO_DA_ENTREGA = {
  id: true, assetTag: true, name: true,
  model: { select: { name: true } },
} as const;

/**
 * A licença embutida numa entrega — o que a aba do ativo, a ficha do
 * colaborador e os históricos precisam para escrever a linha sem outra consulta.
 */
const LICENCA_DA_ENTREGA = {
  id: true, name: true, seatsTotal: true,
  expirationDate: true, terminationDate: true,
  category: { select: { name: true } },
  manufacturer: { select: { name: true } },
} as const;

/** Uma entrega, aberta ou devolvida. */
export const CHECKOUT_SELECT = {
  id: true,
  licenseId: true,
  assignedPersonId: true,
  assignedAssetId: true,
  checkoutAt: true,
  checkinAt: true,
  checkoutNotes: true,
  createdAt: true,
  assignedPerson: { select: PESSOA_DA_ENTREGA },
  assignedAsset: { select: ATIVO_DA_ENTREGA },
  license: { select: LICENCA_DA_ENTREGA },
} as const;

/** O detalhe da licença: a linha da listagem, mais a chave de produto. */
export const LICENSE_DETAIL_SELECT = { ...LICENSE_SELECT, productKey: true } as const;

/** Uma entrega com a chave dela — só para o "Com quem está" do detalhe. */
export const CHECKOUT_COM_CHAVE_SELECT = { ...CHECKOUT_SELECT, productKey: true } as const;

interface EntregaComRotulos {
  assignedPerson: { name: string } | null;
  assignedAsset: { assetTag: string; name: string | null } | null;
}

/** "Laura Souza", ou "ATV-00012 — Dell Latitude". */
export function rotuloDoAlvoDaEntrega(entrega: EntregaComRotulos): string {
  if (entrega.assignedPerson) return entrega.assignedPerson.name;
  const ativo = entrega.assignedAsset;
  if (!ativo) return '—';
  return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
}

/** A linha crua, como o `select` acima a devolve. */
export interface LinhaDeLicenca extends Record<string, unknown> {
  id: string;
  name: string;
  expirationDate: Date | null;
  terminationDate: Date | null;
  purchaseDate: Date | null;
  seatsTotal: number;
}

/** O que o cliente recebe. */
export type LicencaNaResposta = LinhaDeLicenca & ContagemDaLicenca & {
  status: LicenseStatus;
  diasParaVencer: number | null;
};

/**
 * A ÚNICA saída desta camada. Acrescenta o que é derivado.
 *
 * Função pura: o uso chega pronto, e a conta, o status e o prazo saem dele e
 * das datas da própria linha.
 */
export function paraResposta<L extends LinhaDeLicenca>(linha: L, uso: UsoDaLicenca): L & LicencaNaResposta {
  return {
    ...linha,
    ...contarLivres(linha.seatsTotal, uso),
    status: statusDaLicenca(linha),
    diasParaVencer: diasParaVencer(linha.expirationDate),
  };
}
