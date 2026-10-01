import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { lerConfiguracaoDoSistema } from '../../settings/helpers/system-settings.helper';
import { lerLayoutDeEtiqueta, salvarLayoutDeEtiqueta } from '../helpers/label-settings.helper';
import {
  CAMPOS_DE_ETIQUETA, ROTULOS_DE_CAMPO, TAMANHOS_DE_PAGINA, calcularGeometria,
} from '../helpers/label-layout.helper';
import { renderLabelSheet } from '../use-cases/render-label-sheet.usecase';

// Só HTTP.
//
// O LAYOUT VIAJA NO CORPO, e não é lido do banco pelo renderizador — por um
// motivo que é o coração desta etapa: o PREVIEW tem de desenhar o layout que
// está sendo EDITADO, não o que está salvo. Lido do banco, a tela só mostraria
// o efeito de um ajuste depois de salvá-lo, e o objetivo declarado é não gastar
// a folha descobrindo.
//
// O layout salvo é o PADRÃO que a tela carrega ao abrir (`GET /api/labels/layout`).

const layoutSchema = z.strictObject({
  pageSize: z.enum(TAMANHOS_DE_PAGINA as [string, ...string[]], 'tamanho de página inválido'),
  cols: z.number().int('colunas deve ser inteiro').min(1, 'mínimo de 1 coluna').max(10, 'máximo de 10 colunas'),
  rows: z.number().int('linhas deve ser inteiro').min(1, 'mínimo de 1 linha').max(30, 'máximo de 30 linhas'),
  // As medidas em mm, com uma casa: a embalagem da folha adesiva fala assim.
  marginTopMm: z.number().min(0, 'margem não pode ser negativa').max(100, 'margem: máximo de 100 mm'),
  marginLeftMm: z.number().min(0, 'margem não pode ser negativa').max(100, 'margem: máximo de 100 mm'),
  gutterXMm: z.number().min(0).max(50, 'espaço entre colunas: máximo de 50 mm'),
  gutterYMm: z.number().min(0).max(50, 'espaço entre linhas: máximo de 50 mm'),
  fields: z
    .array(z.enum(CAMPOS_DE_ETIQUETA as [string, ...string[]], 'campo de etiqueta inválido'))
    .min(1, 'escolha ao menos um campo')
    .max(6, 'no máximo 6 campos cabem numa etiqueta'),
  qr: z.boolean(),
  barcode: z.boolean(),
});

const folhaSchema = z.strictObject({
  assetIds: z
    .array(z.uuid('ativo: identificador inválido'), 'informe os ativos')
    .min(1, 'escolha ao menos um ativo')
    .max(500, 'no máximo 500 etiquetas por folha'),
  layout: layoutSchema,
});

export const labelController = {
  /** O layout salvo, mais o vocabulário que a tela precisa para montar o formulário. */
  async layout() {
    const layout = await lerLayoutDeEtiqueta();

    return {
      layout,
      campos: CAMPOS_DE_ETIQUETA.map((token) => ({ token, rotulo: ROTULOS_DE_CAMPO[token] })),
      tamanhos: TAMANHOS_DE_PAGINA,
      // A medida calculada da etiqueta: é o número que a pessoa compara com a
      // embalagem da folha, e é ele que diz se a grade fecha.
      medida: medidaEmMm(layout),
    };
  },

  async salvarLayout(request: FastifyRequest) {
    const layout = layoutSchema.parse(request.body ?? {});
    // Calcula ANTES de gravar: uma grade impossível é 422, e não uma
    // configuração salva que só falha na hora de imprimir.
    calcularGeometria(layout);

    return { layout: await salvarLayoutDeEtiqueta(layout), medida: medidaEmMm(layout) };
  },

  /** A folha inteira, para baixar e imprimir. */
  async folha(request: FastifyRequest, reply: FastifyReply) {
    const { assetIds, layout } = folhaSchema.parse(request.body ?? {});
    const { companyName } = await lerConfiguracaoDoSistema();

    const pdf = await renderLabelSheet({ assetIds, layout, companyName });

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Length', pdf.byteLength)
      .header('Content-Disposition', 'attachment; filename="etiquetas.pdf"')
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(pdf);
  },

  /**
   * O PREVIEW — mesma função, UMA página, `inline`.
   *
   * `inline` e não `attachment`: ele é para APARECER na tela, dentro de um
   * `<iframe>`. É o mesmo PDF que a impressão produz, com as mesmas medidas —
   * um preview em HTML que discorda do arquivo é pior que nenhum.
   */
  async preview(request: FastifyRequest, reply: FastifyReply) {
    const { assetIds, layout } = folhaSchema.parse(request.body ?? {});
    const { companyName } = await lerConfiguracaoDoSistema();

    const pdf = await renderLabelSheet({
      assetIds, layout, companyName, apenasPrimeiraPagina: true,
    });

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Length', pdf.byteLength)
      .header('Content-Disposition', 'inline; filename="previa.pdf"')
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(pdf);
  },
};

/** O tamanho de uma etiqueta em mm — o número que se compara com a embalagem. */
function medidaEmMm(layout: z.infer<typeof layoutSchema>) {
  const geometria = calcularGeometria(layout);
  const mm = (pt: number) => Number((pt / (72 / 25.4)).toFixed(1));

  return {
    larguraMm: mm(geometria.larguraDaEtiqueta),
    alturaMm: mm(geometria.alturaDaEtiqueta),
    porPagina: geometria.porPagina,
  };
}
