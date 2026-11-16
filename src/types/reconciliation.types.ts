// A CONVERGÊNCIA RMM × ITAM, do lado do navegador
// (docs/decisoes/reconciliacao.md).

export type MatchSignal = 'SERIAL' | 'UUID' | 'HOSTNAME';
export type DiscoveryMode = 'OFF' | 'SUGGEST' | 'ON';

/**
 * A evidência é `unknown` de propósito: ela diz qual sinal casou, com qual valor
 * e qual hostname, e o servidor pode acrescentar campo. Tipá-la fechada faria o
 * front quebrar quando isso acontecesse. Quem a desenha é `valorDoSinal`, que lê
 * só o valor que casou.
 */
export type Evidencia = Record<string, unknown>;

export interface Sugestao {
  id: string;
  signal: MatchSignal | null;
  evidence: Evidencia;

  endpoint: { id: string; hostname: string; biosSerial: string | null };
  asset: { id: string; assetTag: string; name: string | null; serial: string | null } | null;
}

/** O painel de cobertura — a pergunta que só existe depois de os dois lados se falarem. */
export interface Cobertura {
  cadastrados: number;
  comAgente: number;
  semAgente: number;
  sumidos: number;
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
}

/** Qual máquina está vinculada ao ativo: o painel da aba Máquina lê o resto. */
export interface MaquinaDoAtivo {
  /** Null quando o ativo não tem máquina vinculada. */
  endpointId: string | null;
}
