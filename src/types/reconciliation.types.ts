// A CONVERGÊNCIA RMM × ITAM, do lado do navegador
// (docs/decisoes/reconciliacao.md).

import type { AlvoDaPosse } from './posse.types';

export type SuggestionKind = 'LINK';
type SuggestionState = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
export type MatchSignal = 'SERIAL' | 'UUID' | 'HOSTNAME';
export type DiscoveryMode = 'OFF' | 'SUGGEST' | 'ON';
export type ReviewState = 'UNREVIEWED' | 'ALLOWED' | 'BLOCKED';

/**
 * A evidência é `unknown` de propósito: cada tipo de sugestão mostra coisas
 * diferentes (qual sinal casou, qual valor, qual hostname). Tipá-la como união
 * fechada obrigaria o front a conhecer o formato de cada uma — e a quebrar
 * quando o servidor acrescentasse um campo. Quem a desenha é
 * `valorDoSinal`, que lê só o valor que casou.
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
  orfaos: number;
  shadowIt: number;
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
  serial: string | null;
  hostname: string | null;
  ultimoUso: string | null;
  diasSemUso: number | null;
  postoVago: boolean;
  targetType: AlvoDaPosse | null;
  targetLabel: string | null;
}

/** Qual máquina está vinculada ao ativo: o painel da aba Máquina lê o resto. */
export interface MaquinaDoAtivo {
  /** Null quando o ativo não tem máquina vinculada. */
  endpointId: string | null;
  hostname: string | null;
}
