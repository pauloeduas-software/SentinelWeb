/**
 * Um anexo de ativo — `GET /api/assets/:id/attachments`.
 *
 * NÃO tem o caminho no disco, e isso é o contrato do D84: o cliente referencia
 * o anexo pelo `id`, e o `id` só vale com sessão. Uma lista de N nomes de
 * arquivo seria um mapa do diretório sem ganho nenhum.
 */
export interface Anexo {
  id: string;
  assetId: string;
  /** O nome que a pessoa deu. O do disco é um uuid que ninguém vê. */
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Quem subiu. Nulo só no que for anterior à autenticação. */
  uploadedById: string | null;
  createdAt: string;
}

/** As quatro tabelas que têm imagem. Espelha `ALVOS_DE_IMAGEM` do servidor. */
export type AlvoDeImagem = 'asset' | 'asset-models' | 'manufacturers' | 'categories';
