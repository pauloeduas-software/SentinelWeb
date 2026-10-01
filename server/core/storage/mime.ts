// A ALLOWLIST DE TIPO DE ARQUIVO, e a extensão que cada um recebe no disco.
//
// É allowlist, nunca blocklist: uma lista de "o que não pode" está sempre um
// formato atrás do que alguém quer subir, e o que escapa é executável.
//
// A EXTENSÃO SAI DAQUI, NUNCA DO NOME QUE O CLIENTE MANDOU. O nome original vai
// para uma coluna e serve só para exibir e para nomear o download. Derivar a
// extensão do que chegou é aceitar `nota.pdf.exe`, `../../.bashrc` e qualquer
// outra coisa que o navegador tenha deixado passar — e `path.join` não protege
// contra nenhuma delas sozinho.

/** MIME aceito → extensão que o arquivo recebe no disco. */
const TIPOS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

/**
 * Os tipos que servem como IMAGEM de ativo, modelo, fabricante ou categoria.
 *
 * Subconjunto do de cima: PDF é anexo legítimo (a nota fiscal), mas `<img src>`
 * não o renderiza — aceitá-lo como foto do ativo deixaria a tela com um
 * quadrado quebrado e ninguém saberia por quê.
 */
const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Teto por arquivo. Nota fiscal e foto de equipamento cabem folgado em 10 MB. */
export const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

export function extensaoDoMime(mimeType: string): string | null {
  return TIPOS[mimeType] ?? null;
}

export function ehImagem(mimeType: string): boolean {
  return IMAGENS.has(mimeType);
}

/** Para a mensagem do 422 dizer o que É aceito, em vez de só recusar. */
export function tiposAceitos(): string[] {
  return Object.keys(TIPOS);
}

export function tiposDeImagemAceitos(): string[] {
  return [...IMAGENS];
}

/**
 * O MIME de um arquivo que NÓS gravamos, pela extensão dele.
 *
 * É o inverso do mapa `TIPOS`, e existe porque a coluna guarda só o CAMINHO: a
 * rota que transmite a imagem precisa de um `Content-Type` e não tem `mimetype`
 * guardado para consultar. Derivar daqui é seguro justamente porque a extensão
 * no disco foi escrita pelo `gravar()` a partir da allowlist — ela nunca veio
 * do nome que o cliente mandou.
 *
 * O padrão é `application/octet-stream` e não um tipo de imagem chutado:
 * extensão desconhecida significa arquivo que este sistema não gravou, e
 * anunciá-lo como `image/jpeg` faria o navegador tentar desenhá-lo.
 */
export function mimeDoArquivo(caminho: string): string {
  const ponto = caminho.lastIndexOf('.');
  if (ponto === -1) return 'application/octet-stream';

  const extensao = caminho.slice(ponto).toLowerCase();
  const encontrado = Object.entries(TIPOS).find(([, valor]) => valor === extensao);
  return encontrado?.[0] ?? 'application/octet-stream';
}
