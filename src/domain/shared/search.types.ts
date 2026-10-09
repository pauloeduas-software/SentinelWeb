/**
 * O que `GET /api/search` devolve — a busca do leitor de código de barras.
 *
 * MORAVA EM `label.types.ts`, junto do layout de impressão: quem gera a etiqueta
 * e quem a lê de volta eram o mesmo assunto (F10, Etapa G). As etiquetas saíram
 * no D147 e esta ficou — ler um código colado numa máquina não depende de este
 * sistema ter desenhado o papel.
 */
export interface ResultadoDaBusca {
  tipo: 'EXATO' | 'PARCIAL' | 'NENHUM';
  por: string;
  total: number;
  ativos: { id: string; assetTag: string; serial: string | null; name: string | null }[];
}
