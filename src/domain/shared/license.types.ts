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

/** O filtro de status: os quatro. Sem abas (AF) — `ENCERRADA` separa as encerradas. */
export type StatusDoFiltro = StatusDaLicenca;

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
  /** Já teve entrega, mesmo devolvida. Não impede excluir: só a entrega em uso impede (AG). */
  jaEntregue: boolean;

  status: StatusDaLicenca;
  /** Negativo = já venceu há tantos dias. Nulo quando não há vencimento. */
  diasParaVencer: number | null;
}

/** Uma chave de produto da licença (AC): o texto, quanto cobre e o uso. */
export interface ChaveDaLicenca {
  id: string;
  productKey: string;
  /** Quantas licenças ela cobre: 1 na individual, mais na de volume. */
  seats: number;
  /** Entregas abertas com ela agora. */
  emUso: number;
  /** Já teve entrega, mesmo devolvida: não sai da lista. */
  jaEntregue: boolean;
}

/**
 * A licença do DETALHE — `GET /api/licenses/:id`, a única leitura que traz as
 * chaves de produto. A listagem e a busca não as devolvem.
 */
export interface LicencaDetalhe extends Licenca {
  /** Na ordem em que foram digitadas. */
  keys: ChaveDaLicenca[];
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
  /**
   * Nulo só na entrega devolvida de uma licença excluída (AG) — o nome fica em
   * `licenseName`. A em uso sempre aponta para a licença.
   */
  licenseId: string | null;
  licenseName: string | null;
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
  licenseKeyId: string | null;
  /** Uma das chaves da licença; nula na entrega sem chave. */
  licenseKey: { id: string; productKey: string; seats: number } | null;
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
  /** Nulo quando a licença foi excluída: o nome continua em `licenseLabel`. */
  licenseId: string | null;
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
  /** A lista inteira como ficará. Na edição, a com `id` já existe e a sem `id` é nova. */
  keys?: ChaveNoFormulario[];
}

/** Uma chave como o formulário a manda. */
export interface ChaveNoFormulario {
  id?: string;
  productKey: string;
  seats: number;
}

/** O alvo da entrega: pessoa XOR ativo. Nunca um posto (D39). */
export type AlvoDaEntrega = (
  | { assignedPersonId: string }
  | { assignedAssetId: string }
) & {
  notes?: string | null;
  /** O dia da entrega, 'AAAA-MM-DD'. Hoje ou antes. */
  checkoutAt?: string | null;
  /** Uma das chaves da licença — obrigatória quando ela tem chaves. */
  licenseKeyId?: string;
};
