/**
 * O que `GET /api/search` devolve — a busca do leitor de código de barras.
 *
 * MORAVA JUNTO DO LAYOUT DE IMPRESSÃO: quem gerava a etiqueta
 * e quem a lê de volta eram o mesmo assunto (F10, Etapa G). As etiquetas saíram
 * no D147 e esta ficou — ler um código colado numa máquina não depende de este
 * sistema ter desenhado o papel.
 */
export interface ResultadoDaBusca {
  tipo: 'EXATO' | 'PARCIAL' | 'NENHUM';
  por: string;
  total: number;
  ativos: { id: string; assetTag: string; serial: string | null; name: string | null }[];
  /**
   * O posto onde o ativo do acerto EXATO está montado, quando está.
   *
   * É o que decide o destino do bipe: computador de mesa saiu da listagem de
   * ativos, então a ficha dele é a do POSTO.
   */
  posto: { id: string; name: string } | null;
}
