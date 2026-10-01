// O CONTRATO DO CICLO DE VIDA com a API (F8): manutenção, auditoria, alerta e os
// quatro relatórios.
//
// ⚠️ TODO VALOR MONETÁRIO É STRING, e não `number` — as colunas são `Decimal` no
// Postgres e o JSON as serializa assim, inclusive perdendo o zero à direita
// ("350.50" volta "350.5"). É a armadilha nº 7 da F1, pela quinta vez. Quem
// formata é `formatarMoeda`, no último instante.
//
// ⚠️ TODA DATA É STRING ISO. Quem mostra usa `formatarData`, que FATIA a string
// em vez de construir um `Date`: a data de compra é gravada à meia-noite UTC, e
// num fuso a oeste de Greenwich o `Date` local devolveria o dia anterior.

export interface ReferenciaSimples {
  id: string;
  name: string;
}

// ── MANUTENÇÃO ─────────────────────────────────────────────────────────────

export type TipoDeManutencao = 'MANUTENCAO' | 'REPARO' | 'UPGRADE' | 'CALIBRACAO' | 'SUPORTE';

export const TIPOS_DE_MANUTENCAO: { value: TipoDeManutencao; label: string }[] = [
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'REPARO', label: 'Reparo' },
  { value: 'UPGRADE', label: 'Upgrade' },
  { value: 'CALIBRACAO', label: 'Calibração' },
  { value: 'SUPORTE', label: 'Suporte' },
];

/** O ativo embutido na linha de manutenção. */
export interface AtivoDaManutencao {
  id: string;
  assetTag: string;
  name: string | null;
  deletedAt: string | null;
  model: { name: string; manufacturer: { name: string } };
}

export interface Manutencao {
  id: string;
  assetId: string;
  supplierId: string | null;
  type: TipoDeManutencao;
  title: string;
  startDate: string;
  /** `null` = EM ABERTO. Não existe coluna `status` — ela divergiria (D44). */
  completionDate: string | null;
  cost: string | null;
  isWarranty: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  asset: AtivoDaManutencao;
  supplier: ReferenciaSimples | null;
  /** Derivados pelo servidor a partir das datas — nunca recalculados na tela. */
  emAberto: boolean;
  diasEmAberto: number | null;
}

/** O cabeçalho da tela global: os totais do RECORTE, não da página. */
export interface ResumoDaListagemDeManutencoes {
  custoTotal: string;
  emAberto: number;
  naGarantia: number;
}

export interface ListaDeManutencoes {
  total: number;
  rows: Manutencao[];
  resumo: ResumoDaListagemDeManutencoes;
}

export type SituacaoDeManutencao = 'todas' | 'abertas' | 'encerradas';

export interface FiltrosDeManutencao {
  situacao?: SituacaoDeManutencao;
  type?: TipoDeManutencao;
  assetId?: string;
  supplierId?: string;
}

/** O corpo do formulário. `cost` vai como STRING, do jeito que foi digitado. */
export interface ManutencaoInput {
  type: TipoDeManutencao;
  title: string;
  startDate: string;
  completionDate?: string | null;
  cost?: string | null;
  isWarranty?: boolean;
  supplierId?: string | null;
  notes?: string | null;
}

export interface EncerramentoInput {
  completionDate?: string | null;
  cost?: string | null;
  notes?: string | null;
}

// ── AUDITORIA ──────────────────────────────────────────────────────────────

export type ResultadoDeAuditoria = 'OK' | 'DIVERGENTE' | 'NAO_LOCALIZADO';
export type MetodoDeAuditoria = 'MANUAL' | 'AGENTE';

export interface Auditoria {
  id: string;
  assetId: string;
  auditedAt: string;
  result: ResultadoDeAuditoria;
  method: MetodoDeAuditoria;
  locationIdBefore: string | null;
  locationIdFound: string | null;
  /** O ativo está numa mesa que NÃO é a do alvo da posse. Marcado, nunca corrigido (D52). */
  divergenciaDePosse: boolean;
  /** A posse aponta para um posto sem ninguém. */
  postoVago: boolean;
  notes: string | null;
  auditedById: string | null;
  /** Resolvidos pela leitura: as colunas de local são UUID SEM FK. */
  locationBeforeName: string | null;
  locationFoundName: string | null;
}

export interface AtivoNaConferencia {
  id: string;
  assetTag: string;
  name: string | null;
  serial: string | null;
  locationId: string | null;
  lastAuditAt: string | null;
  model: { name: string; manufacturer: { name: string } };
  status: { id: string; name: string; color: string | null };
}

export interface ItemDaConferencia {
  asset: AtivoNaConferencia;
  /** A posse aberta aponta para este posto: o ativo É deste posto. */
  daPosse: boolean;
  /** `locationId` é este posto: o ativo ESTÁ neste posto. */
  aqui: boolean;
}

/**
 * As DUAS listas do posto — e a diferença entre elas *é* a divergência.
 *
 * Em `doPosto` e não em `noPosto`: sumiu da mesa. Em `noPosto` e não em
 * `doPosto`: é o mouse reserva da gaveta, caso legítimo que a auditoria não deve
 * transformar em posse.
 */
export interface ConferenciaDoPosto {
  location: { id: string; name: string; isWorkstation: boolean };
  ocupantes: number;
  doPosto: ItemDaConferencia[];
  noPosto: ItemDaConferencia[];
}

export interface ConferenciaInput {
  encontrados: string[];
  naoLocalizados: string[];
  notes?: string | null;
}

export interface ResultadoDaConferencia {
  auditorias: Auditoria[];
  divergentes: number;
  naoLocalizados: number;
}

export interface AuditoriaInput {
  result: ResultadoDeAuditoria;
  locationIdFound?: string | null;
  notes?: string | null;
}

// ── VALOR CONTÁBIL ─────────────────────────────────────────────────────────

/** Por que não há valor. `null` NÃO é zero — somar os dois barateia a frota. */
export type MotivoSemValor = 'SEM_CUSTO' | 'SEM_REGRA' | 'SEM_DATA';

export interface ValorContabil {
  valorAtual: string | null;
  motivo: MotivoSemValor | null;
  piso: string | null;
  mesesDecorridos: number | null;
  mesesTotais: number | null;
  totalmenteDepreciado: boolean;
}

// ── ALERTAS ────────────────────────────────────────────────────────────────

export type TipoDeAlerta =
  | 'GARANTIA_VENCENDO' | 'EOL_PROXIMO' | 'AUDITORIA_VENCIDA' | 'MANUTENCAO_EM_ABERTO';

export interface PayloadDoAlerta {
  assetTag?: string;
  assetName?: string | null;
  modelName?: string;
  dias?: number;
  title?: string;
  maintenanceId?: string;
  lastAuditAt?: string | null;
}

export interface Alerta {
  id: string;
  type: TipoDeAlerta;
  assetId: string | null;
  dueAt: string;
  payload: PayloadDoAlerta | null;
  createdAt: string;
  /** Lido no sino. NÃO é "resolvido": o problema pode continuar. */
  readAt: string | null;
  notifiedAt: string | null;
  asset: { id: string; assetTag: string; name: string | null } | null;
  rotulo: string;
}

export interface CentralDeAlertas {
  naoLidos: number;
  total: number;
  rows: Alerta[];
  porTipo: { type: TipoDeAlerta; rotulo: string; naoLidos: number }[];
}

export interface ResultadoDaRodadaDeAlertas {
  criados: number;
  notificados: number;
  desligado: boolean;
}

// ── A CONFIGURAÇÃO DO CICLO DE VIDA ────────────────────────────────────────

export interface ConfiguracaoDoCicloDeVida {
  alertsEnabled: boolean;
  alertEmails: string[];
  alertWebhookUrl: string | null;
  warrantyAlertDays: number;
  eolAlertDays: number;
  maintenanceOpenDays: number;
  auditIntervalMonths: number;
  auditWarningDays: number;
  alertHour: number;
  timezone: string;
}

// ── RELATÓRIOS ─────────────────────────────────────────────────────────────

export interface PontoDaCurva {
  /** `AAAA-MM`. */
  mes: string;
  valor: string;
  /**
   * Quantos ativos o ponto soma — a frota de doze meses atrás era menor.
   *
   * Sem ele, uma curva ASCENDENTE parece defeito de cálculo; com ele, o hover
   * explica que o parque cresceu.
   */
  ativos: number;
}

export interface LinhaDaDepreciacao {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  depreciationName: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  valorAtual: string | null;
  motivo: MotivoSemValor | null;
  mesesDecorridos: number | null;
  mesesTotais: number | null;
}

export interface RelatorioDeDepreciacao {
  custoTotal: string;
  custoDepreciavel: string;
  valorAtualTotal: string;
  depreciacaoAcumulada: string;
  comValor: number;
  semCusto: number;
  semDepreciacao: number;
  semData: number;
  total: number;
  curva: PontoDaCurva[];
  /** A TABELA tem teto; os totais acima são da frota inteira. */
  linhas: LinhaDaDepreciacao[];
  linhasTruncadas: boolean;
}

export interface ItemDePrazo {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  vence: string;
  /** NEGATIVO quando já venceu. */
  dias: number;
  locationName: string | null;
}

export interface RelatorioDePrazos {
  warrantyAlertDays: number;
  eolAlertDays: number;

  // ⚠️ AS LISTAS TÊM TETO; OS INDICADORES SAEM DOS CONTADORES.
  //
  // `garantias.length` não é o número de garantias vencendo — é o número de linhas
  // que couberam na resposta. Usar `.length` num indicador faz ele parar de crescer
  // no teto, calado, e é assim que um relatório passa a mentir para baixo.
  garantias: ItemDePrazo[];
  garantiasTotal: number;
  garantiasVencidas: number;
  /** Vencidas ANTES da janela — o passado profundo, contado e não listado. */
  garantiasAntigas: number;

  eol: ItemDePrazo[];
  eolTotal: number;
  eolVencidos: number;
  eolAntigos: number;

  truncado: boolean;
}

export interface ItemDeAuditoria {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  locationName: string | null;
  lastAuditAt: string | null;
  diasDesde: number | null;
}

export interface RelatorioDeAuditorias {
  auditIntervalMonths: number;
  auditWarningDays: number;
  corte: string;

  // ⚠️ As listas têm teto — ver a nota em `RelatorioDePrazos`. Os três `…Total`
  // são `count` no servidor, e é deles que os indicadores saem.
  vencidas: ItemDeAuditoria[];
  aVencer: ItemDeAuditoria[];
  nunca: ItemDeAuditoria[];
  vencidasTotal: number;
  aVencerTotal: number;
  nuncaTotal: number;

  emDia: number;
  total: number;
  truncado: boolean;
}

export interface CustoPorTipo {
  type: TipoDeManutencao;
  custo: string;
  quantidade: number;
}

export interface RelatorioDeManutencoes {
  custoTotal: string;
  emAberto: number;
  custoNaGarantia: string;
  total: number;
  porTipo: CustoPorTipo[];
}

// ── A CAMADA 3 AGREGADA (F10, Etapa F) ──────────────────────────────────────
//
// Os dois relatórios que leem `vw_asset_responsibles`. Eles moram neste arquivo
// porque a tela deles é a mesma — `/relatorios`, a moldura que a F8 criou e que
// o plano da F10 manda reusar em vez de abrir uma segunda página.

export interface LinhaDeResponsabilidade {
  userId: string;
  name: string;
  email: string;
  /** Desligado ou na lixeira, e ainda respondendo: é pendência de devolução. */
  desligado: boolean;
  /** A posse é DELA. Desfaz-se com uma devolução. */
  diretos: number;
  /** Ela OCUPA a mesa a que o equipamento foi entregue. Desfaz-se com escala. */
  porPosto: number;
  /** O equipamento está preso a outro que é dela (a dock que segura o notebook). */
  porAtivo: number;
  total: number;
  custoTotal: string | null;
}

export interface RelatorioDeResponsabilidade {
  linhas: LinhaDeResponsabilidade[];
  semResponsavel: number;
  desligadosComPosse: number;
}

export interface GrupoDoBuilder {
  grupo: string | null;
  ativos: number;
  custoTotal: string | null;
}

export interface RespostaDoBuilder {
  columns: { token: string; rotulo: string }[];
  agruparPor: string | null;
  linhas: Record<string, unknown>[];
  grupos: GrupoDoBuilder[];
  disponiveis: string[];
}

export interface CamposDoBuilder {
  colunas: string[];
  agrupaveis: string[];
}
