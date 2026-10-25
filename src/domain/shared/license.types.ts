// O CONTRATO DAS LICENÇAS com a API (docs/referencia/licencas.md).
//
// ⚠️ `purchaseCost` é STRING, e não `number` — a coluna é `Decimal` no Postgres
// e o JSON a serializa assim. É a armadilha nº 7 da F1, pela quarta vez.
//
interface ReferenciaNomeada {
  id: string;
  name: string;
}

interface CategoriaDaLicenca extends ReferenciaNomeada {
  type: string;
}

/** Derivado das datas e do dia de hoje, nunca coluna (D44). */
export type StatusDaLicenca = 'ATIVA' | 'VENCENDO' | 'EXPIRADA' | 'ENCERRADA';

/** As abas da tela: o que não encerrou, e o que encerrou. */
export type RecorteDaLicenca = 'atuais' | 'encerradas';

/** O filtro de status da aba Atuais — a encerrada tem aba própria. */
export type StatusDoFiltro = Exclude<StatusDaLicenca, 'ENCERRADA'>;

/**
 * Uma licença, com as contas que o servidor fez.
 *
 * `livres` NÃO é coluna do banco: é `seatsTotal − emUso`, contado
 * nas entregas. Chega junto com `seatsTotal` e não o substitui.
 */
export interface Licenca {
  id: string;
  name: string;
  /** Quantas foram compradas. */
  seatsTotal: number;

  expirationDate: string | null;
  terminationDate: string | null;
  licensedToName: string | null;
  licensedToEmail: string | null;

  categoryId: string;
  manufacturerId: string | null;

  orderNumber: string | null;
  purchaseDate: string | null;
  /** STRING — ver o aviso no topo do arquivo. */
  purchaseCost: string | null;

  notes: string | null;

  createdAt: string;
  updatedAt: string;

  category: CategoriaDaLicenca | null;
  manufacturer: ReferenciaNomeada | null;

  // ── O que o servidor CALCULOU ──────────────────────────────────────────────
  emUso: number;
  livres: number;
  /** Já teve entrega, mesmo devolvida: não se exclui, se encerra. */
  jaEntregue: boolean;

  status: StatusDaLicenca;
  /** Negativo = já venceu há tantos dias. Nulo quando não há vencimento. */
  diasParaVencer: number | null;
}

/**
 * A licença do DETALHE — `GET /api/licenses/:id`, a única leitura que traz a
 * chave de produto. A listagem e a busca não a devolvem.
 */
export interface LicencaDetalhe extends Licenca {
  /** A de volume, ou a lista das compradas, uma por linha. */
  productKey: string | null;
}

interface PessoaDaEntrega {
  id: string;
  name: string;
  email: string | null;
}

interface AtivoDaEntrega {
  id: string;
  assetTag: string;
  name: string | null;
  model: { name: string } | null;
}

/** A licença embutida numa entrega. */
interface LicencaDaEntrega {
  id: string;
  name: string;
  seatsTotal: number;
  expirationDate: string | null;
  terminationDate: string | null;
  category: { name: string } | null;
  manufacturer: { name: string } | null;
}

/** Uma entrega de licença. `checkinAt` nulo = em uso agora. */
export interface EntregaDeLicenca {
  id: string;
  /** Sempre presente: a licença que já foi entregue não se exclui. */
  licenseId: string;
  assignedPersonId: string | null;
  assignedAssetId: string | null;
  checkoutAt: string;
  checkinAt: string | null;
  checkoutNotes: string | null;
  assignedPerson: PessoaDaEntrega | null;
  assignedAsset: AtivoDaEntrega | null;
  license: LicencaDaEntrega;
}

/** Uma entrega com a chave dela — só o "Com quem está" do detalhe a traz. */
export interface EntregaComChave extends EntregaDeLicenca {
  productKey: string | null;
}

/**
 * Uma entrega aberta vista DO ALVO — a aba Licenças do ativo e a ficha do
 * colaborador —, com o status da licença ao lado.
 */
export interface EntregaDoAlvo extends EntregaDeLicenca {
  status: StatusDaLicenca | null;
  diasParaVencer: number | null;
}

/**
 * Um evento do histórico da licença — `GET /api/licenses/:id/history`.
 *
 * Só movimentação: cada entrega e cada devolução, com o nome de quem recebeu.
 * Cadastro e edição ficam na auditoria, no banco (AB), e não chegam aqui.
 */
export interface EventoDaLicenca {
  id: string;
  action: 'CHECKOUT' | 'CHECKIN';
  /** ISO — `JSON.parse` não reconstrói `Date`. */
  at: string;
  entrega: {
    checkoutId: string;
    alvo: 'PERSON' | 'ASSET';
    alvoId: string;
    alvoLabel: string;
    notes: string | null;
  };
}

/**
 * Uma entrega de licença como evento do histórico DO ALVO — do ativo ou da
 * pessoa. Só as entregues àquele alvo.
 */
export interface EventoDeLicencaDoAlvo {
  checkoutId: string;
  licenseId: string;
  licenseLabel: string;
  notes: string | null;
}

/** Por que a licença está no alerta, do mais urgente para o menos. */
export type MotivoDoAlerta = 'ENCERRADA_EM_USO' | 'VENCIDA' | 'VENCENDO';

export interface LicencaEmAlerta {
  id: string;
  name: string;
  motivo: MotivoDoAlerta;
  status: StatusDaLicenca;
  diasParaVencer: number | null;
  expirationDate: string | null;
  terminationDate: string | null;
  emUso: number;
  categoryName: string | null;
}

/** `GET /api/licenses/alerts`: a lista, o total e quantas há de cada motivo. */
export interface AlertasDaLicenca {
  total: number;
  contagem: Record<MotivoDoAlerta, number>;
  rows: LicencaEmAlerta[];
}

/** O corpo do formulário. */
export interface LicencaInput {
  name: string;
  categoryId: string;
  seatsTotal: number;
  expirationDate?: string | null;
  terminationDate?: string | null;
  licensedToName?: string | null;
  licensedToEmail?: string | null;
  manufacturerId?: string | null;
  orderNumber?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: string | null;
  notes?: string | null;
  productKey?: string | null;
}

/** O alvo da entrega: pessoa XOR ativo. Nunca um posto (D39). */
export type AlvoDaEntrega = (
  | { assignedPersonId: string }
  | { assignedAssetId: string }
) & {
  notes?: string | null;
  /** O dia da entrega, 'AAAA-MM-DD'. Hoje ou antes. */
  checkoutAt?: string | null;
  /** A chave desta entrega. Vazia na licença de volume. */
  productKey?: string | null;
};
