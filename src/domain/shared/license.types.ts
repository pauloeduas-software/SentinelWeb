// O CONTRATO DAS LICENÇAS com a API (F6).
//
// ⚠️ `purchaseCost` é STRING, e não `number` — a coluna é `Decimal` no Postgres
// e o JSON a serializa assim. É a armadilha nº 7 da F1, pela quarta vez.
//
// ⚠️ `productKey` NÃO EXISTE neste arquivo, e a ausência é a regra: a chave só
// sai por `GET /api/licenses/:id/product-key`, que tem tipo próprio lá embaixo.
// Declará-la aqui convidaria alguém a tentar lê-la de uma listagem, onde ela
// nunca esteve.

export interface ReferenciaNomeada {
  id: string;
  name: string;
}

export interface CategoriaDaLicenca extends ReferenciaNomeada {
  type: string;
  color: string | null;
}

/** Derivado das datas e do dia de hoje, nunca coluna (D44). */
export type StatusDaLicenca = 'ATIVA' | 'VENCENDO' | 'EXPIRADA' | 'ENCERRADA';

/**
 * Uma licença, com as contagens que o servidor calculou.
 *
 * `livres` NÃO é coluna do banco (D92): é a contagem dos assentos sem
 * aposentadoria, sem queima e sem ocupação aberta. Chega junto com `seatsTotal`
 * e não o substitui — a coluna principal da tela é o par `livres / seatsTotal`,
 * e mostrar só um dos dois esconde metade da informação.
 *
 * `aposentados` NÃO entra na subtração de `livres`: ele já saiu de `seatsTotal`
 * quando o contrato encolheu. Ele existe para explicar por que a grade tem mais
 * quadrados que o contrato.
 */
export interface Licenca {
  id: string;
  name: string;
  seatsTotal: number;
  reassignable: boolean;
  maintained: boolean;

  expirationDate: string | null;
  terminationDate: string | null;
  licensedToName: string | null;
  licensedToEmail: string | null;

  minSeats: number | null;

  categoryId: string;
  manufacturerId: string | null;
  supplierId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  /** STRING — ver o aviso no topo do arquivo. */
  purchaseCost: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  category: CategoriaDaLicenca | null;
  manufacturer: ReferenciaNomeada | null;
  supplier: ReferenciaNomeada | null;

  // ── O que o servidor CALCULOU ──────────────────────────────────────────────
  ocupados: number;
  queimados: number;
  aposentados: number;
  livres: number;

  status: StatusDaLicenca;
  /** Negativo = já venceu há tantos dias. Nulo quando não há vencimento. */
  diasParaVencer: number | null;
  /** `livres < minSeats`. Falso quando não há piso. */
  assentosBaixos: boolean;

  /** Tem chave gravada? Basta para decidir se a tela oferece "revelar". */
  hasProductKey: boolean;
  /** `••••-••••-••••-AB12`. Só no DETALHE — na listagem vem `null`. */
  productKeyMask: string | null;
}

export interface PessoaDoAssento {
  id: string;
  name: string;
  email: string;
}

export interface AtivoDoAssento {
  id: string;
  assetTag: string;
  name: string | null;
  model: { name: string } | null;
}

/** Uma ocupação de assento. `checkinAt` nulo = ocupado agora. */
export interface OcupacaoDeAssento {
  id: string;
  seatId: string;
  assignedUserId: string | null;
  assignedAssetId: string | null;
  checkoutAt: string;
  checkinAt: string | null;
  checkoutNotes: string | null;
  checkinNotes: string | null;
  assignedUser: PessoaDoAssento | null;
  assignedAsset: AtivoDoAssento | null;
}

/**
 * Um assento da grade.
 *
 * `checkouts` traz NO MÁXIMO uma linha — a aberta —, e quem garante isso é o
 * índice único parcial do banco. Sem ele a tela teria que escolher qual mostrar.
 */
export interface AssentoDeLicenca {
  id: string;
  licenseId: string;
  seatNumber: number;
  burnedAt: string | null;
  retiredAt: string | null;
  notes: string | null;
  checkouts: OcupacaoDeAssento[];
}

/** O que a devolução responde — é o número que o aviso de queima prometeu. */
export interface ResultadoDaDevolucao {
  checkout: OcupacaoDeAssento;
  queimado: boolean;
  livres: number;
}

/** O que a entrega responde. */
export interface EntregaDeAssento extends OcupacaoDeAssento {
  seatNumber: number;
}

/** A ÚNICA forma da chave em claro no frontend. Nunca guardada, só exibida. */
export interface ChaveRevelada {
  licenseId: string;
  productKey: string;
}

/**
 * Um evento da trilha da licença — `GET /api/licenses/:id/history`.
 *
 * `changes` é `unknown` de propósito: o formato muda com a operação (diff
 * `{de, para}` na edição, ids soltos no checkout, `revealedAt` no `VIEW_KEY`),
 * e quem o lê é o `lerEvento` compartilhado. Tipar campo a campo obrigaria a
 * mexer aqui a cada operação nova.
 */
export interface EventoDaLicenca {
  id: string;
  action: string;
  changes: unknown;
  actorId: string | null;
  createdAt: string;
}

export interface LicencaEmAlerta {
  id: string;
  name: string;
  seatsTotal: number;
  minSeats: number | null;
  livres: number;
  status: StatusDaLicenca;
  diasParaVencer: number | null;
  expirationDate: string | null;
  categoryName: string | null;
}

export interface AlertasDeLicenca {
  vencendo: LicencaEmAlerta[];
  assentosBaixos: LicencaEmAlerta[];
}

/**
 * Um assento de licença NO NOME de uma pessoa — `GET /api/users/:id/holdings`.
 *
 * SÓ os de alvo `USER` (D39/D93). O assento do desktop da Mesa 1 é da máquina e
 * aparece na aba Licenças DAQUELE ativo, que é de onde alguém pode devolvê-lo.
 *
 * Não tem `via` como o acessório (D33): acessório chega por dois caminhos —
 * dela e do posto —, e assento só chega por um.
 */
export interface AssentoEmPosse {
  /** O id da OCUPAÇÃO, não o do assento. */
  checkoutId: string;
  seatId: string;
  seatNumber: number;
  licenseId: string;
  licenseName: string;
  categoryName: string | null;
  /** `false` = devolver QUEIMA o assento: ele não volta ao contrato (D43). */
  reassignable: boolean;
  checkoutAt: string;
}

/**
 * Um assento que o DESLIGAMENTO devolveu — o relatório, depois de confirmar.
 *
 * `queimado` é o que separa uma devolução de uma perda patrimonial: com
 * `reassignable = false`, o assento não volta ao contrato. A tela mostra o
 * número antes de confirmar e confirma depois, porque não tem desfazer.
 */
export interface AssentoDevolvido {
  checkoutId: string;
  seatId: string;
  seatNumber: number;
  licenseId: string;
  licenseName: string;
  queimado: boolean;
}

/** Uma licença instalada num ativo — a aba Licenças da tela do ativo. */
export interface LicencaDoAtivo {
  id: string;
  checkoutAt: string;
  checkoutNotes: string | null;
  seat: {
    id: string;
    seatNumber: number;
    license: {
      id: string;
      name: string;
      seatsTotal: number;
      expirationDate: string | null;
      terminationDate: string | null;
      reassignable: boolean;
      category: { name: string } | null;
      manufacturer: { name: string } | null;
    };
  };
}

/** O corpo do formulário. `productKey` entra aqui e nunca volta. */
export interface LicencaInput {
  name: string;
  categoryId: string;
  seatsTotal: number;
  reassignable?: boolean;
  maintained?: boolean;
  expirationDate?: string | null;
  terminationDate?: string | null;
  licensedToName?: string | null;
  licensedToEmail?: string | null;
  productKey?: string | null;
  minSeats?: number | null;
  manufacturerId?: string | null;
  supplierId?: string | null;
  orderNumber?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: string | null;
  notes?: string | null;
}

/** O alvo da entrega: pessoa XOR ativo. Nunca um posto (D39). */
export type AlvoDoAssento =
  | { assignedUserId: string; notes?: string | null }
  | { assignedAssetId: string; notes?: string | null };
