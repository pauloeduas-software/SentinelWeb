import Papa from 'papaparse';
import { AppError } from '../../../core/errors/app-error';

// A LEITURA DO CSV QUE ENTRA (F10, Etapa D) — e as armadilhas são todas na
// borda, antes de qualquer linha virar registro.
//
// ═════════════════════════════════════════════════════════════════════════════
// O BOM É ARMADILHA NOS DOIS SENTIDOS.
//
// No export ele se ESCREVE (sem ele o Excel em pt-BR quebra todo acento). Aqui
// ele se TIRA — e se não tirar, o primeiro cabeçalho vira `"\uFEFFEtiqueta"`, o
// mapeamento perde a primeira coluna e o importador diz que o arquivo não tem
// etiqueta. Com a etiqueta ali, visível, na tela. É o defeito mais frustrante
// possível: o arquivo está certo e a mensagem diz que não.
//
// O ENCODING É RECUSADO, NÃO ADIVINHADO.
//
// O Excel em português salva `.csv` em Windows-1252 por padrão (é preciso
// escolher "CSV UTF-8" no diálogo). Um arquivo nesses bytes decodificado como
// UTF-8 produz "LocalizaÃ§Ã£o" — e essa string entraria no banco como nome de
// localização, em 300 linhas, sem erro nenhum. Melhor recusar o arquivo com a
// instrução do que importar dado corrompido que ninguém revisa depois.
//
// O DELIMITADOR É DETECTADO; O ENCODING NÃO.
//
// Delimitador se adivinha com segurança: contar candidatos na linha de
// cabeçalho acerta, e errar significa uma coluna só (que a tela mostra antes de
// aplicar). Encoding não dá: os bytes de um `ç` em 1252 são um `ç` válido em
// Latin-1, um erro em UTF-8 e um caractere diferente em cada outra tabela.
// ═════════════════════════════════════════════════════════════════════════════

/** Os separadores que um CSV de planilha usa na prática. */
const CANDIDATOS = [';', ',', '\t', '|'] as const;

/**
 * Teto de linhas por arquivo.
 *
 * Não é o limite do banco: é o da MEMÓRIA. O arquivo inteiro é decodificado e
 * parseado antes do dry-run, e um CSV de um milhão de linhas são algumas
 * centenas de megabytes de objetos JavaScript num processo que também atende as
 * telas. Carga maior que isto é script pontual com `COPY`, não um upload.
 */
const MAX_LINHAS = 20_000;

/** Teto de colunas. Acima disto o arquivo não é uma planilha de cadastro. */
const MAX_COLUNAS = 60;

/** Teto por célula. O maior campo do sistema (`notes`) tem 2.000. */
const MAX_CELULA = 4_000;

export interface CsvLido {
  /** Os cabeçalhos, na ordem do arquivo, já sem o BOM e com `trim`. */
  cabecalhos: string[];
  /**
   * As linhas de DADO, cada uma como `{ cabeçalho: valor }`.
   *
   * `lineNumber` conta o cabeçalho como 1 — é o número que aparece no Excel.
   * Um índice de array aqui obrigaria quem lê o relatório a somar dois de
   * cabeça para achar a linha errada num arquivo de cinco mil.
   */
  linhas: { lineNumber: number; valores: Record<string, string> }[];
  delimitador: string;
}

/**
 * Decodifica em UTF-8 estrito. Qualquer byte inválido recusa o arquivo.
 *
 * `fatal: true` é o que transforma "acento quebrado em silêncio" em uma
 * mensagem que diz o que fazer.
 */
function decodificar(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new AppError(
      'O arquivo não está em UTF-8. No Excel, use "Salvar como" → "CSV UTF-8 (delimitado por vírgulas)"; '
        + 'no LibreOffice, marque "Editar configurações do filtro" e escolha UTF-8.',
      422,
    );
  }
}

/**
 * Qual separador a linha de cabeçalho usa.
 *
 * Conta fora das aspas: um cabeçalho `"Nome, completo";Email` tem uma vírgula
 * que não separa nada, e contá-la escolheria o delimitador errado para o
 * arquivo inteiro.
 */
export function detectarDelimitador(primeiraLinha: string): string {
  // `string` e não o literal: `CANDIDATOS[0]` é `';'` para o compilador, e a
  // reatribuição dentro do laço não compilaria.
  let melhor: string = CANDIDATOS[0];
  let maior = -1;

  for (const candidato of CANDIDATOS) {
    let contagem = 0;
    let dentroDeAspas = false;

    for (const caractere of primeiraLinha) {
      if (caractere === '"') dentroDeAspas = !dentroDeAspas;
      else if (caractere === candidato && !dentroDeAspas) contagem++;
    }

    if (contagem > maior) {
      maior = contagem;
      melhor = candidato;
    }
  }

  // Nenhum candidato apareceu: é um arquivo de UMA coluna. `;` serve, e o
  // mapeamento vai dizer se aquela coluna basta.
  return maior <= 0 ? ';' : melhor;
}

/** Linha que o papaparse devolve para uma linha em branco: nada ou só vazio. */
function linhaVazia(colunas: string[] | undefined): boolean {
  return !colunas || colunas.every((celula) => (celula ?? '').trim() === '');
}

/**
 * A primeira linha COM CONTEÚDO — é nela que o delimitador é contado.
 *
 * Contar na primeira linha do arquivo, sem mais, escolheria `;` por falta de
 * candidato num arquivo que começa com uma linha em branco — e aí o cabeçalho
 * inteiro viraria UMA coluna, com o nome das outras dentro dela.
 *
 * O teto de leitura é o que impede isto de fatiar 25 MB em linhas para achar a
 * primeira: o maior cabeçalho que este parser aceita tem 60 colunas de 200
 * caracteres, que não chega perto de 64 KB.
 */
function primeiraLinhaComConteudo(texto: string): string {
  const TETO = 64 * 1024;

  for (const linha of texto.slice(0, TETO).split(/\r?\n/)) {
    if (linha.trim() !== '') return linha;
  }
  return '';
}

export function lerCsv(bytes: Buffer, delimitadorForcado?: string): CsvLido {
  const texto = decodificar(bytes).replace(/^\uFEFF/, '');

  if (texto.trim() === '') throw new AppError('O arquivo está vazio.', 422);

  const delimitador = delimitadorForcado ?? detectarDelimitador(primeiraLinhaComConteudo(texto));

  // `header: false` de propósito: com `header: true` o papaparse monta o objeto
  // sozinho e, no cabeçalho REPETIDO, a segunda coluna sobrescreve a primeira em
  // silêncio — o mapeamento apontaria para uma coluna que não é a que a pessoa
  // escolheu. Montando à mão, a repetição vira 422.
  //
  // E SEM `skipEmptyLines`, que é o que mantém o `lineNumber` HONESTO.
  //
  // Com `skipEmptyLines: 'greedy'` o papaparse TIRA a linha vazia de dentro de
  // `data`, e o índice do array deixa de ser a linha do arquivo: uma planilha com
  // uma linha em branco no meio fazia todo erro seguinte ser reportado uma linha
  // ACIMA do lugar certo. O número existe exatamente para alguém achar a linha
  // errada num arquivo de cinco mil — errado, ele manda a pessoa corrigir a linha
  // de cima. A linha vazia é descartada mais abaixo, DEPOIS de o número já ter
  // sido atribuído.
  const resultado = Papa.parse<string[]>(texto, {
    delimiter: delimitador,
    header: false,
  });

  const matriz = resultado.data;
  if (matriz.length === 0) throw new AppError('O arquivo não tem nenhuma linha.', 422);

  // O CABEÇALHO É A PRIMEIRA LINHA COM CONTEÚDO, e não a primeira linha.
  // Planilha concatenada à mão começa com uma linha em branco mais vezes do que
  // se imagina, e recusá-la por "coluna sem nome" seria recusar um arquivo certo.
  const posicaoDoCabecalho = matriz.findIndex((colunas) => !linhaVazia(colunas));
  if (posicaoDoCabecalho === -1) throw new AppError('O arquivo não tem nenhuma linha.', 422);

  const cabecalhos = (matriz[posicaoDoCabecalho] ?? [])
    .map((celula) => (celula ?? '').replace(/^\uFEFF/, '').trim());

  if (cabecalhos.length > MAX_COLUNAS) {
    throw new AppError(`O arquivo tem ${cabecalhos.length} colunas; o máximo é ${MAX_COLUNAS}.`, 422);
  }

  const vazios = cabecalhos.filter((titulo) => titulo === '').length;
  if (vazios > 0) {
    throw new AppError(
      `A linha de cabeçalho tem ${vazios} coluna(s) sem nome. Toda coluna precisa de título para `
        + 'poder ser mapeada — apague as colunas vazias no fim da planilha.',
      422,
    );
  }

  const repetidos = cabecalhos.filter((titulo, indice) => cabecalhos.indexOf(titulo) !== indice);
  if (repetidos.length > 0) {
    throw new AppError(
      `Cabeçalho repetido: "${[...new Set(repetidos)].join('", "')}". Dois títulos iguais tornam o `
        + 'mapeamento ambíguo — renomeie uma das colunas.',
      422,
    );
  }

  // O NÚMERO VEM ANTES DO DESCARTE: `lineNumber` é a linha REAL do arquivo (o
  // `+ 2` é "mais o cabeçalho, mais a base 1 do Excel"), e só depois de cada
  // linha ter o seu número as vazias saem. Invertida, esta ordem é o defeito que
  // o `skipEmptyLines` causava.
  const dados = matriz
    .slice(posicaoDoCabecalho + 1)
    .map((colunas, indice) => ({ lineNumber: posicaoDoCabecalho + indice + 2, colunas }))
    .filter(({ colunas }) => !linhaVazia(colunas));

  if (dados.length > MAX_LINHAS) {
    throw new AppError(
      `O arquivo tem ${dados.length} linhas; o máximo por importação é ${MAX_LINHAS}. `
        + 'Divida a planilha em partes.',
      422,
    );
  }

  const linhas = dados.map(({ lineNumber, colunas }) => {
    const valores: Record<string, string> = {};

    cabecalhos.forEach((titulo, posicao) => {
      // Célula ausente (linha mais curta que o cabeçalho) é string VAZIA, não
      // `undefined`: para o importador, "não veio" e "veio vazio" são a mesma
      // coisa — não mexer naquele campo.
      const bruto = colunas[posicao] ?? '';
      valores[titulo] = bruto.length > MAX_CELULA ? bruto.slice(0, MAX_CELULA) : bruto;
    });

    return { lineNumber, valores };
  });

  return { cabecalhos, linhas, delimitador };
}
