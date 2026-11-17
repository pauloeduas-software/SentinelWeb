// A CONVERGÊNCIA RMM × ITAM, do lado do navegador
// (docs/decisoes/reconciliacao.md).

/** O painel de cobertura — a pergunta que só existe depois de os dois lados se falarem. */
export interface Cobertura {
  cadastrados: number;
  comAgente: number;
  semAgente: number;
  sumidos: number;
  /** O prazo dos Sumidos, que a frase do painel cita. */
  diasSemContato: number;
}

/** Qual máquina está vinculada ao ativo: o painel da aba Máquina lê o resto. */
export interface MaquinaDoAtivo {
  /** Null quando o ativo não tem máquina vinculada. */
  endpointId: string | null;
}
