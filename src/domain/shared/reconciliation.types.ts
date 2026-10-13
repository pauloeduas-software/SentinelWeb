// A CONVERGÊNCIA RMM × ITAM, do lado do navegador
// (docs/historico/fase-07-convergencia-rmm-itam.md).

export type SuggestionKind = 'LINK';
export type SuggestionState = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
export type MatchSignal = 'SERIAL' | 'UUID' | 'HOSTNAME';
export type DiscoveryMode = 'OFF' | 'SUGGEST' | 'ON';
export type ReviewState = 'UNREVIEWED' | 'ALLOWED' | 'BLOCKED';

/**
 * A evidência é `unknown` de propósito: cada tipo de sugestão mostra coisas
 * diferentes (qual sinal casou, qual valor, qual hostname). Tipá-la como união
 * fechada obrigaria o front a conhecer o formato de cada uma — e a quebrar
 * quando o servidor acrescentasse um campo. Quem a desenha é
 * `linhasDaEvidencia`, que trata pares chave/valor.
 */
export type Evidencia = Record<string, unknown>;

export interface Sugestao {
  id: string;
  kind: SuggestionKind;
  score: number;
  signal: MatchSignal | null;
  evidence: Evidencia;
  state: SuggestionState;
  createdAt: string;
  resolvedAt: string | null;

  endpoint: { id: string; hwid: string; hostname: string; lastSeen: string; biosSerial: string | null };
  asset: { id: string; assetTag: string; name: string | null; serial: string | null } | null;
}

/** O painel de cobertura — a pergunta que só existe depois de os dois lados se falarem. */
export interface Cobertura {
  cadastrados: number;
  comAgente: number;
  semAgente: number;
  nuncaVistos: number;
  fantasmas: number;
  descobertas: number;
  orfaos: number;
  shadowIt: number;
  bloqueados: number;
  sugestoesPendentes: number;
}

/** O placar de uma varredura — `POST /api/reconciliation/run`. */
export interface ResultadoDaVarredura {
  endpoints: number;
  sugeridas: number;
  vinculadas: number;
  encerradas: number;
}

export interface ConfiguracaoDaDescoberta {
  discoveryMode: DiscoveryMode;
  ghostDays: number;
  shadowHours: number;
}

export interface AtivoOcioso {
  assetId: string;
  assetTag: string;
  name: string | null;
  hostname: string | null;
  ultimoUso: string | null;
  diasSemUso: number | null;
  postoVago: boolean;
  responsaveis: { id: string; name: string; via: string }[];
}

/**
 * As especificações que o AGENTE coletou.
 *
 * `ramTotalBytes` e `diskTotalBytes` chegam como **string**, e não number: são
 * `BigInt` no banco e `JSON.stringify` não os serializa. Tipá-los como `number`
 * aqui faria o front fazer aritmética sobre um texto e acertar por acaso até o
 * primeiro disco de 4 TB.
 */
export interface EspecificacoesDaMaquina {
  manufacturer: string | null;
  hardwareModel: string | null;
  chassisType: string | null;
  biosSerial: string | null;
  systemUuid: string | null;
  cpuModel: string | null;
  osVersion: string | null;
  ramTotalBytes: string | null;
  diskTotalBytes: string | null;
  macAddress: string | null;
  localIp: string | null;
}

/** Uma troca de peça que o agente percebeu — a `AssetChange` (Etapa B). */
export interface MudancaDeHardware {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  detectedAt: string;
}

/** Tudo o que a aba Máquina mostra, numa resposta. */
export interface MaquinaDoAtivo {
  /** Null quando o ativo não tem máquina vinculada. */
  endpointId: string | null;
  hostname: string | null;
  status: 'ONLINE' | 'OFFLINE' | null;
  reviewState: ReviewState | null;
  /** O batimento real da máquina. */
  ultimoContato: string | null;
  /**
   * O carimbo no ATIVO (`lastSeenByAgentAt`), propagado pelo job (D95).
   *
   * Vem ao lado do `ultimoContato` de propósito: são duas datas com significados
   * diferentes e até uma hora de diferença entre si, e quem lê a tela precisa
   * poder ver que a coluna do patrimônio está atrás do batimento sem que isso
   * pareça defeito.
   */
  ultimoContatoNoAtivo: string | null;
  especificacoes: EspecificacoesDaMaquina | null;
  mudancas: MudancaDeHardware[];
}
