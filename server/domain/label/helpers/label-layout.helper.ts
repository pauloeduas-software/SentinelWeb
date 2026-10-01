import { AppError } from '../../../core/errors/app-error';

// A GEOMETRIA DA FOLHA DE ETIQUETAS (F10, Etapa G).
//
// ═════════════════════════════════════════════════════════════════════════════
// MILÍMETRO É A UNIDADE DE QUEM CONFIGURA; PONTO É A DO PDF.
//
// Quem ajusta isto está com a embalagem da folha adesiva na mão, e a embalagem
// fala em milímetros. O PDF fala em pontos PostScript (72 por polegada). A
// conversão mora aqui, num lugar só — espalhada, ela viraria dois fatores
// diferentes e meio milímetro de erro por etiqueta, que ao fim da folha são
// quatro milímetros de desalinho.
//
// E O PDF É GERADO NO TAMANHO EXATO DA PÁGINA. A impressora que "ajusta à
// página" encolhe tudo alguns por cento e desalinha a folha inteira — por isso
// a tela precisa dizer, com todas as letras: imprimir em 100%, sem ajustar.
// ═════════════════════════════════════════════════════════════════════════════

/** 1 mm em pontos PostScript: 72 / 25.4. */
const PT_POR_MM = 72 / 25.4;

export const mmParaPt = (mm: number): number => mm * PT_POR_MM;

/** As duas folhas que existem na prática. Em pontos, como o pdfkit quer. */
const PAGINAS: Record<string, { largura: number; altura: number }> = {
  A4: { largura: 595.28, altura: 841.89 },
  LETTER: { largura: 612, altura: 792 },
};

export const TAMANHOS_DE_PAGINA = Object.keys(PAGINAS);

/**
 * O que pode ir impresso numa etiqueta.
 *
 * ALLOWLIST, e pelo mesmo motivo do D67: o cliente manda token, e um token fora
 * da lista é 422. Aqui o perigo não é injeção — é a etiqueta sair com um campo
 * que não cabe e empurrar o resto para fora do adesivo.
 *
 * `purchaseCost` NÃO está aqui, e não é esquecimento: custo de compra colado no
 * equipamento é informação que qualquer visitante lê. Quando a F11 trouxer
 * permissão sobre dado sensível, isto continua fora.
 */
const CAMPOS: Record<string, string> = {
  assetTag: 'Etiqueta',
  name: 'Nome do ativo',
  model: 'Modelo',
  manufacturer: 'Fabricante',
  serial: 'Nº de série',
  category: 'Categoria',
  location: 'Localização',
  company: 'Nome da empresa',
};

export const CAMPOS_DE_ETIQUETA = Object.keys(CAMPOS);
export const ROTULOS_DE_CAMPO = CAMPOS;

export interface LayoutDeEtiqueta {
  pageSize: string;
  cols: number;
  rows: number;
  marginTopMm: number;
  marginLeftMm: number;
  gutterXMm: number;
  gutterYMm: number;
  fields: string[];
  qr: boolean;
  barcode: boolean;
}

export interface GeometriaDaFolha {
  largura: number;
  altura: number;
  margemTopo: number;
  margemEsquerda: number;
  goteiraX: number;
  goteiraY: number;
  /** O tamanho de UMA etiqueta, já descontadas margens e goteiras. */
  larguraDaEtiqueta: number;
  alturaDaEtiqueta: number;
  porPagina: number;
}

/**
 * Calcula o tamanho de cada etiqueta a partir da folha e da grade.
 *
 * A LARGURA DA ETIQUETA É DERIVADA, NÃO CONFIGURADA, e isso é decisão: pedir
 * largura E número de colunas E margem permitiria configurar uma folha
 * impossível (três colunas de 90 mm numa A4 de 210 mm), e o resultado seria
 * etiqueta cortada sem nada avisando. Derivada, ela sempre fecha — e quando
 * fica pequena demais a recusa é explícita, com o número.
 */
export function calcularGeometria(layout: LayoutDeEtiqueta): GeometriaDaFolha {
  // `Object.hasOwn` e não `PAGINAS[...]` direto: `PAGINAS['constructor']` é uma
  // função verdadeira, e com ela `pagina.largura` seria `undefined` — toda a
  // geometria viraria `NaN`, nenhuma das três recusas de piso dispararia (toda
  // comparação com `NaN` é falsa) e o pdfkit receberia uma página de tamanho
  // `NaN`. A borda HTTP valida `pageSize` por `z.enum`, então isto é a rede de
  // baixo; ela existe porque esta função também é chamada com o layout SALVO.
  const pagina = Object.hasOwn(PAGINAS, layout.pageSize) ? PAGINAS[layout.pageSize] : undefined;
  if (!pagina) {
    throw new AppError(
      `Tamanho de página inválido: ${layout.pageSize}. Use ${TAMANHOS_DE_PAGINA.join(' ou ')}.`,
      422,
    );
  }

  const margemEsquerda = mmParaPt(layout.marginLeftMm);
  const margemTopo = mmParaPt(layout.marginTopMm);
  const goteiraX = mmParaPt(layout.gutterXMm);
  const goteiraY = mmParaPt(layout.gutterYMm);

  // As margens valem nos DOIS lados: a folha adesiva é simétrica, e uma margem
  // só à esquerda empurraria a última coluna para fora do papel.
  const util = pagina.largura - margemEsquerda * 2 - goteiraX * (layout.cols - 1);
  const utilVertical = pagina.altura - margemTopo * 2 - goteiraY * (layout.rows - 1);

  const larguraDaEtiqueta = util / layout.cols;
  const alturaDaEtiqueta = utilVertical / layout.rows;

  // ═══════════════════════════════════════════════════════════════════════════
  // O PISO DEPENDE DO QUE VAI IMPRESSO, e não é um número redondo escolhido a
  // esmo.
  //
  // A primeira versão deste arquivo tinha um piso único de 15×8 mm, e o teste da
  // etapa o reprovou pelo motivo certo: uma grade de 10×30 numa A4 passa nele
  // (sobram 17,3×9,1 mm por etiqueta) e produz um QR de 5 mm, que câmera de
  // celular nenhuma lê. O PDF sairia "válido" e a folha, perdida.
  //
  //   TEXTO     15 mm × 8 mm — três linhas de 6 pt com margem interna.
  //   CODE128   30 mm de largura. Abaixo disso as barras ficam tão finas que o
  //             leitor erra mais do que acerta, e o Code128 do `assetTag` tem
  //             uns 11 caracteres.
  //   QR        10 mm de LADO. É o piso prático para 25 módulos numa câmera de
  //             celular — e o lado é derivado da geometria (ver o
  //             renderizador), não configurado.
  //
  // Cada recusa diz QUAL elemento não cabe, porque a correção é diferente:
  // menos colunas resolve o código de barras, menos linhas resolve o QR.
  // ═══════════════════════════════════════════════════════════════════════════
  const emMm = (pt: number) => (pt / PT_POR_MM).toFixed(1);
  const medida = `${emMm(larguraDaEtiqueta)}×${emMm(alturaDaEtiqueta)} mm`;
  const grade = `A grade de ${layout.cols}×${layout.rows} com estas margens deixa cada etiqueta com ${medida}`;

  if (larguraDaEtiqueta < mmParaPt(15) || alturaDaEtiqueta < mmParaPt(8)) {
    throw new AppError(
      `${grade}, pequeno demais para imprimir texto. Reduza as colunas, as linhas ou as margens.`,
      422,
    );
  }

  if (layout.barcode && larguraDaEtiqueta < mmParaPt(30)) {
    throw new AppError(
      `${grade}. O código de barras precisa de pelo menos 30 mm de largura para o leitor acertar — `
        + 'reduza as COLUNAS ou desligue o código de barras.',
      422,
    );
  }

  // O mesmo cálculo do renderizador: o QR é quadrado, limitado pela altura útil
  // e por 30% da largura. Escrito nos dois lugares seria duas contas que
  // divergem — aqui ele é conferido, lá ele é desenhado.
  const ladoDoQr = Math.min(alturaDaEtiqueta - mmParaPt(1.5) * 2, larguraDaEtiqueta * 0.3);

  if (layout.qr && ladoDoQr < mmParaPt(10)) {
    throw new AppError(
      `${grade}, o que deixa o QR com ${emMm(ladoDoQr)} mm de lado. Câmera de celular não lê QR `
        + 'abaixo de 10 mm — reduza as LINHAS ou desligue o QR.',
      422,
    );
  }

  return {
    largura: pagina.largura,
    altura: pagina.altura,
    margemTopo,
    margemEsquerda,
    goteiraX,
    goteiraY,
    larguraDaEtiqueta,
    alturaDaEtiqueta,
    porPagina: layout.cols * layout.rows,
  };
}

/** Recusa token de campo fora da allowlist, listando os válidos. */
export function validarCampos(fields: readonly string[]): string[] {
  // `Object.hasOwn`: com `in`, `'constructor'` e `'__proto__'` atravessavam a
  // allowlist e saíam como campo em branco na etiqueta.
  const desconhecidos = fields.filter((token) => !Object.hasOwn(CAMPOS, token));

  if (desconhecidos.length > 0) {
    throw new AppError(
      `Campo de etiqueta desconhecido: ${desconhecidos.join(', ')}. `
        + `Válidos: ${CAMPOS_DE_ETIQUETA.join(', ')}.`,
      422,
      { validos: CAMPOS_DE_ETIQUETA },
    );
  }

  // Sem campo nenhum a etiqueta sairia com código de barras e nada legível por
  // gente — e quem procura o equipamento na prateleira lê o texto.
  if (fields.length === 0) {
    throw new AppError('Escolha ao menos um campo para imprimir na etiqueta.', 422);
  }

  return [...fields];
}
