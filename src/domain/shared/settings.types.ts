// A CONFIGURAÇÃO DE SISTEMA (F10, Etapa A) — o espelho do recorte que
// `GET /api/settings` devolve.
//
// É o TERCEIRO recorte do mesmo singleton: a descoberta mora em
// `reconciliation.types.ts` e os alertas em `lifecycle.types.ts`, cada um no
// domínio que os consome. Este não tem um consumidor só — `locale`,
// `dateFormat` e `currency` são lidos por toda tela que mostra dinheiro ou
// data —, e é por isso que ele tem domínio próprio.

/** Os formatos que a tela sabe desenhar. O servidor recusa qualquer outro. */
export const FORMATOS_DE_DATA = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export type FormatoDeData = (typeof FORMATOS_DE_DATA)[number];

/** Os delimitadores que o export escreve e o import oferece como padrão. */
export const DELIMITADORES_DE_CSV = [';', ',', '|', '\t'] as const;
export type DelimitadorDeCsv = (typeof DELIMITADORES_DE_CSV)[number];

export interface ConfiguracaoDoSistema {
  companyName: string;
  /**
   * Caminho RELATIVO no servidor, e a tela NUNCA o usa para montar URL: quem dá
   * o endereço da imagem é `urlDaMarca()`, que aponta para a rota com sessão
   * (D84). O caminho vem na resposta só para a tela saber se EXISTE marca.
   */
  logoPath: string | null;
  faviconPath: string | null;
  primaryColor: string;
  locale: string;
  dateFormat: FormatoDeData;
  currency: string;
  csvDelimiter: DelimitadorDeCsv;
}

export type MarcaVisual = 'logo' | 'favicon';
