import { prisma } from '../../../core/database/prismaClient';
import { APP_SETTING_ID } from '../../settings/helpers/app-setting.helper';
import type { LayoutDeEtiqueta } from './label-layout.helper';

// O LAYOUT SALVO (F10, Etapa G) — o QUARTO recorte do singleton.
//
// Mesmo desenho dos outros três (descoberta, alertas, sistema): leitura do
// `AppSetting` com `upsert`, e em `helpers/` porque ler colunas de uma linha
// fixa não é operação de negócio.
//
// MORA NO DOMÍNIO DA ETIQUETA, e não em `settings`, ao contrário dos outros
// três — e a diferença é quem lê: `labelCols` e `labelFields` só fazem sentido
// para quem desenha a folha. Os outros recortes são lidos por três ou quatro
// domínios cada (o fuso pelo job, pelo relatório e pela reconciliação), e é isso
// que os faz morar no meio.
//
// As COLUNAS continuam no `AppSetting` (D65): é configuração global, não um
// domínio — não existe uma segunda folha de etiquetas por instalação.

const CAMPOS = {
  labelPageSize: true,
  labelCols: true,
  labelRows: true,
  labelMarginTopMm: true,
  labelMarginLeftMm: true,
  labelGutterXMm: true,
  labelGutterYMm: true,
  labelFields: true,
  labelQr: true,
  labelBarcode: true,
} as const;

type LinhaDeLayout = {
  labelPageSize: string;
  labelCols: number;
  labelRows: number;
  labelMarginTopMm: number;
  labelMarginLeftMm: number;
  labelGutterXMm: number;
  labelGutterYMm: number;
  labelFields: string[];
  labelQr: boolean;
  labelBarcode: boolean;
};

/**
 * Traduz os nomes de coluna para os do layout.
 *
 * O prefixo `label` existe no BANCO porque o `AppSetting` tem 36 colunas de
 * quatro assuntos diferentes, e `cols` solto ali não diria de quê. No layout ele
 * é ruído: `layout.labelCols` lido dentro do renderizador de etiqueta repete a
 * palavra em toda linha.
 */
function paraLayout(linha: LinhaDeLayout): LayoutDeEtiqueta {
  return {
    pageSize: linha.labelPageSize,
    cols: linha.labelCols,
    rows: linha.labelRows,
    marginTopMm: linha.labelMarginTopMm,
    marginLeftMm: linha.labelMarginLeftMm,
    gutterXMm: linha.labelGutterXMm,
    gutterYMm: linha.labelGutterYMm,
    fields: linha.labelFields,
    qr: linha.labelQr,
    barcode: linha.labelBarcode,
  };
}

export async function lerLayoutDeEtiqueta(): Promise<LayoutDeEtiqueta> {
  const linha = await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: {},
    create: { id: APP_SETTING_ID },
    select: CAMPOS,
  });

  return paraLayout(linha);
}

export async function salvarLayoutDeEtiqueta(layout: LayoutDeEtiqueta): Promise<LayoutDeEtiqueta> {
  const dados = {
    labelPageSize: layout.pageSize,
    labelCols: layout.cols,
    labelRows: layout.rows,
    labelMarginTopMm: layout.marginTopMm,
    labelMarginLeftMm: layout.marginLeftMm,
    labelGutterXMm: layout.gutterXMm,
    labelGutterYMm: layout.gutterYMm,
    labelFields: layout.fields,
    labelQr: layout.qr,
    labelBarcode: layout.barcode,
  };

  const linha = await prisma.appSetting.upsert({
    where: { id: APP_SETTING_ID },
    update: dados,
    create: { id: APP_SETTING_ID, ...dados },
    select: CAMPOS,
  });

  return paraLayout(linha);
}
