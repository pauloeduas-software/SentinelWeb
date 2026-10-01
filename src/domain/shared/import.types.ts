// A IMPORTAÇÃO DE CSV, do lado da tela (F10, Etapa D) — o espelho de
// `server/domain/import/`.

export const ALVOS_DE_IMPORT = ['ASSETS', 'USERS', 'OCCUPANTS'] as const;
export type AlvoDeImport = (typeof ALVOS_DE_IMPORT)[number];

export type SituacaoDoImport = 'SIMULADO' | 'APLICANDO' | 'APLICADO' | 'RECUSADO';
export type SituacaoDaLinha = 'OK' | 'ERRO' | 'IGNORADA';

/** Um campo que o alvo aceita — é com isto que a tela monta o mapeamento. */
export interface CampoDeImport {
  token: string;
  rotulo: string;
  obrigatorioNaCriacao: boolean;
  /** Serve como chave de atualização. */
  chave: boolean;
  ajuda: string | null;
  exemplo: string | null;
}

export interface CamposDoAlvo {
  target: AlvoDeImport;
  /**
   * As chaves aceitas. VAZIA em `OCCUPANTS`: lá a identidade é o par
   * (local, colaborador), garantida por índice único parcial no banco — e
   * mandar uma chave é 422, não um campo ignorado.
   */
  chaves: string[];
  campos: CampoDeImport[];
}

export interface Importacao {
  id: string;
  filename: string;
  target: AlvoDeImport;
  status: SituacaoDoImport;
  delimiter: string;
  totalLinhas: number;
  ok: number;
  erro: number;
  ignorada: number;
  appliedUpTo: number;
  /** Só em `OCCUPANTS`: o efeito de segunda ordem, contado no dry-run (Etapa E). */
  ganhamResponsavel: number | null;
  perdemResponsavel: number | null;
  actorId: string | null;
  createdAt: string;
  appliedAt: string | null;
}

export interface LinhaDoImport {
  id: string;
  lineNumber: number;
  /** A linha como ela chegou, por cabeçalho do CSV. */
  raw: Record<string, string>;
  status: SituacaoDaLinha;
  message: string | null;
  entityId: string | null;
}

/** `{ cabeçalho do CSV → token }` mais a chave de atualização. */
export interface MapeamentoDeImport {
  colunas: Record<string, string>;
  chave?: string;
}
