import { CryptoError, decifrar } from '../../../core/crypto/cipher';
import { createLogger } from '../../../core/logger/logger';
import { mascararChave } from './mask-product-key.helper';
import {
  diasParaVencer, statusDaLicenca, type LicenseStatus,
} from './license-status.helper';
import type { ContagemDeAssentos } from './license-seats.helper';

const logger = createLogger('license.select');

// O QUE DE UMA LICENÇA PODE SAIR PARA O CLIENTE — allowlist, não `include`.
//
// ═════════════════════════════════════════════════════════════════════════════
// `productKey` ESTÁ NO `select` E NUNCA ESTÁ NA RESPOSTA.
//
// Ele é lido porque `hasProductKey` e a máscara saem dele. E ele NUNCA chega ao
// cliente porque a única saída desta camada é `paraResposta()`, que o remove —
// não por um `delete` no objeto, mas porque o tipo de retorno não tem a chave.
// Uma tentativa de devolver a linha crua não compila.
//
// O que está no banco é o TEXTO CIFRADO, não a chave: mesmo que um caminho
// futuro vaze esta linha inteira, o que vaza é `enc:v1:…`, inútil sem a chave
// de criptografia do processo. A allowlist é a primeira barreira, a cifra é a
// segunda, e as duas existem porque nenhuma sozinha basta.
// ═════════════════════════════════════════════════════════════════════════════
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

  // Lido, nunca devolvido. Ver o bloco acima antes de mexer nesta linha.
  productKey: true,

  minSeats: true,

  categoryId: true,
  manufacturerId: true,
  supplierId: true,

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
  supplier: { select: { id: true, name: true } },
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
  productKey: string | null;
  expirationDate: Date | null;
  terminationDate: Date | null;
  seatsTotal: number;
  minSeats: number | null;
}

/** O que o cliente recebe. Note o que NÃO está aqui. */
export type LicencaNaResposta = Omit<LinhaDeLicenca, 'productKey'> & ContagemDeAssentos & {
  /** Tem chave gravada? Basta para a tela decidir se oferece "revelar". */
  hasProductKey: boolean;
  /** `••••-••••-••••-AB12`, só na leitura de DETALHE. `null` na listagem. */
  productKeyMask: string | null;
  status: LicenseStatus;
  diasParaVencer: number | null;
  /** `livres < minSeats`. `false` quando `minSeats` é nulo: sem piso, sem alerta. */
  assentosBaixos: boolean;
};

export interface OpcoesDaResposta {
  /**
   * Derivar a máscara, o que exige DECIFRAR.
   *
   * Só no detalhe. Numa listagem de cem licenças, decifrar cada uma poria o
   * texto em claro de cem chaves na memória do processo para mostrar quatro
   * caracteres de cada — exposição que não paga o que entrega.
   */
  comMascara?: boolean;
}

/**
 * A ÚNICA saída desta camada. Tira a chave, acrescenta o que é derivado.
 *
 * Função pura no que importa — as contagens chegam prontas —, com uma exceção
 * declarada: `comMascara` decifra, e por isso pode falhar. A falha aqui NÃO
 * derruba a tela: a máscara vira `null` e o log registra. O lugar de um erro de
 * criptografia aparecer com todas as letras é a revelação da chave, que é onde
 * alguém está pedindo o valor e precisa saber por que não veio.
 */
export function paraResposta(
  linha: LinhaDeLicenca,
  contagem: ContagemDeAssentos,
  opcoes: OpcoesDaResposta = {},
): LicencaNaResposta {
  // Desestruturar é o que REMOVE a chave: `resto` não a tem, e o tipo de
  // retorno também não. Um `delete` deixaria a propriedade removível de um
  // objeto que o tipo ainda diz ter.
  const { productKey, ...resto } = linha;

  return {
    ...resto,
    ...contagem,
    hasProductKey: productKey !== null,
    productKeyMask: opcoes.comMascara ? mascaraOuNulo(productKey, linha.id) : null,
    status: statusDaLicenca(linha),
    diasParaVencer: diasParaVencer(linha.expirationDate),
    assentosBaixos: linha.minSeats !== null && contagem.livres < linha.minSeats,
  };
}

/** O AAD do D91: `"<tabela>:<coluna>:<id da linha>"`. Um lugar só. */
export function aadDaChave(licenseId: string): string {
  return `licenses:productKey:${licenseId}`;
}

function mascaraOuNulo(productKey: string | null, licenseId: string): string | null {
  if (!productKey) return null;
  try {
    return mascararChave(decifrar(productKey, aadDaChave(licenseId)));
  } catch (erro) {
    // `licenseId` no log, NUNCA o valor. A frase do `CryptoError` já não
    // carrega o dado (ver `core/crypto/cipher.ts`), e o `sanitize` fecharia o
    // resto.
    logger.warn(
      `[Licença] Máscara indisponível para ${licenseId}: `
      + (erro instanceof CryptoError ? erro.message : 'erro ao decifrar'),
    );
    return null;
  }
}
