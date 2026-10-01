// AS ETIQUETAS (F10, Etapa G) — o espelho de `server/domain/label/`.

export const TAMANHOS_DE_PAGINA = ['A4', 'LETTER'] as const;

export interface LayoutDeEtiqueta {
  pageSize: string;
  cols: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  gutterXMm: number;
  gutterYMm: number;
  /** Os campos impressos, na ordem. O primeiro sai em negrito e maior. */
  fields: string[];
  /** O QR leva a URL da tela do ativo; o código de barras leva a etiqueta (D70). */
  qr: boolean;
  barcode: boolean;
}

/** O tamanho calculado de UMA etiqueta — o número que se compara com a embalagem. */
export interface MedidaDaEtiqueta {
  larguraMm: number;
  alturaMm: number;
  porPagina: number;
}

export interface LayoutNaResposta {
  layout: LayoutDeEtiqueta;
  campos: { token: string; rotulo: string }[];
  tamanhos: string[];
  medida: MedidaDaEtiqueta;
}

/** O que `GET /api/search` devolve — a busca do leitor de código de barras. */
export interface ResultadoDaBusca {
  tipo: 'EXATO' | 'PARCIAL' | 'NENHUM';
  por: string;
  total: number;
  ativos: { id: string; assetTag: string; serial: string | null; name: string | null }[];
}
