import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js/node';
import QRCode from 'qrcode';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { urlDoPainel } from '../../../core/config/app-url';
import { createLogger } from '../../../core/logger/logger';
import {
  calcularGeometria, mmParaPt, validarCampos, type LayoutDeEtiqueta,
} from '../helpers/label-layout.helper';

const logger = createLogger('label.render');

// A FOLHA DE ETIQUETAS (F10, Etapa G).
//
// ═════════════════════════════════════════════════════════════════════════════
// O PREVIEW É O PDF DE VERDADE — a MESMA função, com `apenasPrimeiraPagina`.
//
// Um preview em HTML que discorda do PDF é pior que nenhum: o objetivo
// declarado da tela é NÃO GASTAR A FOLHA, e um desenho aproximado em `<div>`
// nunca acerta a posição do adesivo. Aqui o preview renderiza uma página com o
// mesmo código, as mesmas medidas e a mesma fonte da impressão.
//
// O QR LEVA URL; O CÓDIGO DE BARRAS LEVA A ETIQUETA (D70).
//
// São dois leitores diferentes. A câmera do celular abre link — então o QR
// contém `${APP_URL}/ativos/:id` e um toque abre a tela do ativo. O leitor de
// mão DIGITA TEXTO num campo — então o Code128 contém o `assetTag`, que é o que
// a busca do leitor espera receber. Trocar os dois obrigaria a copiar e colar de
// um lado e faria o leitor digitar 60 caracteres do outro.
//
// E O QR LEVA O CAMINHO NOVO: a rota da tela era `/itam/assets/:id` quando o
// D70 foi escrito e passou a ser `/ativos/:id`. Uma etiqueta impressa é para
// durar anos colada no equipamento — o redirecionamento que `App.tsx` mantém é
// rede para o que já foi impresso, não destino para o que está sendo.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Teto de etiquetas por folha gerada.
 *
 * 500 é alto para uso humano (vinte folhas de 3×8) e baixo o bastante para a
 * memória: cada etiqueta gera DOIS PNGs (QR e código de barras) que vivem no
 * processo até o PDF fechar.
 */
const MAX_ETIQUETAS = 500;

/** O que cada etiqueta precisa saber. */
const SELECT_DA_ETIQUETA = {
  id: true,
  assetTag: true,
  name: true,
  serial: true,
  model: {
    select: {
      name: true,
      manufacturer: { select: { name: true } },
      category: { select: { name: true } },
    },
  },
  location: { select: { name: true } },
} as const;

type AtivoDaEtiqueta = {
  id: string;
  assetTag: string;
  name: string | null;
  serial: string | null;
  model: { name: string; manufacturer: { name: string }; category: { name: string } };
  location: { name: string } | null;
};

function valorDoCampo(token: string, ativo: AtivoDaEtiqueta, companyName: string): string {
  switch (token) {
    case 'assetTag': return ativo.assetTag;
    case 'name': return ativo.name ?? '';
    case 'model': return ativo.model.name;
    case 'manufacturer': return ativo.model.manufacturer.name;
    case 'serial': return ativo.serial ? `SN ${ativo.serial}` : '';
    case 'category': return ativo.model.category.name;
    case 'location': return ativo.location?.name ?? '';
    case 'company': return companyName;
    default: return '';
  }
}

/** O Code128 do `assetTag`, como PNG. */
async function codigoDeBarras(texto: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid: 'code128',
      text: texto,
      // `scale` alto e altura baixa: o que o leitor precisa é de CONTRASTE e de
      // barras finas bem definidas, não de um código alto. 2 mm de altura já
      // leem, e altura demais rouba o espaço do texto.
      scale: 3,
      height: 7,
      // `includetext: false`: o número já vai impresso como campo, e repetido
      // embaixo das barras ele some no adesivo pequeno.
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    });
  } catch (erro) {
    // Code128 aceita ASCII imprimível; uma etiqueta com caractere fora disso
    // (cadastrada à mão, colada de outro sistema) não pode derrubar a folha
    // inteira — ela sai sem o código, com o texto, e o log registra.
    logger.warn(`[Etiqueta] Code128 não pôde ser gerado para "${texto}".`, {
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return null;
  }
}

/** O QR com a URL da tela do ativo (D70). */
function qrCode(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    // `M` é o nível de correção que sobrevive a um adesivo amassado sem roubar
    // módulos demais; `margin: 0` porque a margem do adesivo já é a margem.
    errorCorrectionLevel: 'M',
    margin: 0,
    scale: 6,
    type: 'png',
  });
}

export interface PedidoDeEtiquetas {
  assetIds: string[];
  layout: LayoutDeEtiqueta;
  /** O preview: uma página, pela MESMA função. */
  apenasPrimeiraPagina?: boolean;
  companyName: string;
}

export async function renderLabelSheet(pedido: PedidoDeEtiquetas): Promise<Buffer> {
  const campos = validarCampos(pedido.layout.fields);
  const geometria = calcularGeometria(pedido.layout);

  if (pedido.assetIds.length === 0) {
    throw new AppError('Escolha ao menos um ativo para imprimir.', 422);
  }
  if (pedido.assetIds.length > MAX_ETIQUETAS) {
    throw new AppError(
      `No máximo ${MAX_ETIQUETAS} etiquetas por folha. Imprima em partes.`,
      422,
    );
  }

  const ativos = await prisma.asset.findMany({
    where: { id: { in: pedido.assetIds } },
    select: SELECT_DA_ETIQUETA,
  });

  if (ativos.length === 0) throw new AppError('Nenhum dos ativos escolhidos foi encontrado.', 404);

  // A ORDEM É A DO PEDIDO, não a do banco: quem selecionou 24 ativos na tela
  // espera a folha na ordem em que os viu, porque é assim que ele vai conferir
  // adesivo por adesivo antes de colar.
  const porId = new Map(ativos.map((ativo) => [ativo.id, ativo]));
  const ordenados = pedido.assetIds
    .map((id) => porId.get(id))
    .filter((ativo): ativo is AtivoDaEtiqueta => ativo !== undefined);

  const paraImprimir = pedido.apenasPrimeiraPagina
    ? ordenados.slice(0, geometria.porPagina)
    : ordenados;

  // As imagens ANTES de abrir o PDF: `bwip-js` e `qrcode` são assíncronos, e o
  // pdfkit desenha de forma síncrona. Gerar dentro do laço de desenho exigiria
  // `await` entre `doc.image()` e `doc.end()`, o que embaralha a ordem das
  // páginas.
  const imagens = await Promise.all(paraImprimir.map(async (ativo) => ({
    barras: pedido.layout.barcode ? await codigoDeBarras(ativo.assetTag) : null,
    qr: pedido.layout.qr ? await qrCode(`${urlDoPainel()}/ativos/${ativo.id}`) : null,
  })));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [geometria.largura, geometria.altura],
      // Margem ZERO no documento: a margem da FOLHA é a do layout, e o pdfkit
      // somaria a dele por cima — deslocando a grade inteira.
      margin: 0,
      autoFirstPage: true,
    });

    const pedacos: Buffer[] = [];
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    const padding = mmParaPt(1.5);

    paraImprimir.forEach((ativo, indice) => {
      const naPagina = indice % geometria.porPagina;
      if (indice > 0 && naPagina === 0) doc.addPage();

      const coluna = naPagina % pedido.layout.cols;
      const linha = Math.floor(naPagina / pedido.layout.cols);

      const x = geometria.margemEsquerda
        + coluna * (geometria.larguraDaEtiqueta + geometria.goteiraX);
      const y = geometria.margemTopo
        + linha * (geometria.alturaDaEtiqueta + geometria.goteiraY);

      const { barras, qr } = imagens[indice];

      // O QR À DIREITA, quadrado, ocupando a altura útil: é o elemento que
      // precisa de proporção exata — um QR esticado não lê.
      const ladoDoQr = qr ? Math.min(geometria.alturaDaEtiqueta - padding * 2, geometria.larguraDaEtiqueta * 0.3) : 0;
      if (qr && ladoDoQr > 0) {
        doc.image(qr, x + geometria.larguraDaEtiqueta - padding - ladoDoQr, y + padding, {
          width: ladoDoQr,
          height: ladoDoQr,
        });
      }

      const larguraDoTexto = geometria.larguraDaEtiqueta - padding * 2 - (ladoDoQr ? ladoDoQr + padding : 0);
      let cursor = y + padding;

      // O PRIMEIRO campo em negrito e maior: é o que alguém lê de longe na
      // prateleira, e quase sempre é a etiqueta.
      campos.forEach((token, posicao) => {
        const valor = valorDoCampo(token, ativo, pedido.companyName);
        if (!valor) return;

        const tamanho = posicao === 0 ? 8 : 6;
        doc
          .font(posicao === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(tamanho)
          .text(valor, x + padding, cursor, {
            width: larguraDoTexto,
            // UMA linha por campo, cortada: texto que quebra empurra o resto da
            // etiqueta para fora do adesivo, e é um erro que só aparece depois
            // de imprimir.
            lineBreak: false,
            ellipsis: true,
          });

        cursor += tamanho + 1.5;
      });

      // O CÓDIGO DE BARRAS no pé, usando a largura do texto: ele é lido por um
      // aparelho que precisa de barras largas, então ganha o espaço horizontal.
      if (barras) {
        const alturaDasBarras = Math.min(mmParaPt(6), y + geometria.alturaDaEtiqueta - padding - cursor);

        if (alturaDasBarras > mmParaPt(2)) {
          doc.image(barras, x + padding, y + geometria.alturaDaEtiqueta - padding - alturaDasBarras, {
            width: larguraDoTexto,
            height: alturaDasBarras,
          });
        }
      }
    });

    doc.end();
  });
}
