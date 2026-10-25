import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import { assertEscolhaAtiva, lerCategoriaTravada, lerFabricanteTravado } from '../helpers/catalog-lock.helper';
import { createAssetModelSchema, updateAssetModelSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';
import { escaparCuringas } from '../../shared/busca.helper';

export const assetModelSpec: CatalogSpec = {
  slug: 'asset-models',
  entityType: 'AssetModel',
  rotulo: 'modelo',

  delegate: (client) => client.assetModel as unknown as CatalogDelegate,
  createSchema: createAssetModelSchema,
  updateSchema: updateAssetModelSchema,

  // O fabricante e a categoria vêm embutidos porque a tabela mostra o nome, não
  // o uuid — e uma segunda consulta por linha seria N+1 na tela.
  select: {
    id: true, name: true, modelNumber: true, notes: true, isActive: true,
    manufacturerId: true, categoryId: true, createdAt: true,
    manufacturer: { select: { id: true, name: true } },
    category: { select: { id: true, name: true, type: true } },
  },
  searchable: ['name', 'modelNumber'],
  audited: [
    'name', 'modelNumber', 'notes', 'manufacturerId', 'categoryId', 'isActive',
  ],

  // Desativado some das escolhas e continua no histórico (configuracoes.md).
  optionsWhere: { isActive: true },
  dicaEmUso: 'Desative-o em vez de excluir: ele some das escolhas e continua no histórico.',

  // Conta a lixeira também: a FK é `Restrict` e o banco recusaria de todo jeito,
  // mas sem isto a contagem dá 0 e o usuário recebe o P2003 genérico no lugar da
  // mensagem que diz quantos ativos usam o modelo.
  countUsages: (client, id) =>
    client.asset.count({ where: { modelId: id, ...INCLUINDO_LIXEIRA } }),

  // AS REFERÊNCIAS, conferidas antes de gravar — o mesmo desenho do
  // `assertReferenciasDaLicenca` e do `assertCategoriaDeEstoque`.
  //
  // Sem isto o modelo aceitava qualquer categoria pela API (o filtro "só de
  // ATIVO" morava só na tela), e o ativo herda a categoria do modelo: um PUT
  // movia todos os ativos dele para uma categoria de licença ou de estoque, onde
  // nenhum filtro de Ativos os encontra. E um id inexistente caía no P2003, que
  // responde "em uso por outro cadastro" — status e frase errados para "não
  // existe".
  async beforeWrite(client, id, data) {
    const atual = id
      ? await client.assetModel.findUnique({
        where: { id },
        select: { manufacturerId: true, categoryId: true, modelNumber: true },
      })
      : null;

    // Leituras `FOR SHARE`: a troca de tipo da categoria e a desativação do
    // fabricante ou da categoria travam a linha, e estas leituras esperam por
    // elas em vez de aprovar o valor velho (`catalog-lock.helper.ts`).
    if (typeof data.manufacturerId === 'string') {
      const fabricante = await lerFabricanteTravado(client, data.manufacturerId);
      if (!fabricante) throw new AppError('Fabricante não encontrado.', 404);
      // Desativado não é escolhido de novo — só quando o fabricante MUDA: o
      // formulário reenvia todo campo, e o modelo que já era dele continua
      // editável.
      if (data.manufacturerId !== atual?.manufacturerId) {
        assertEscolhaAtiva(fabricante, { rotulo: 'O fabricante' });
      }
    }

    if (typeof data.categoryId === 'string') {
      const categoria = await lerCategoriaTravada(client, data.categoryId);
      if (!categoria) throw new AppError('Categoria não encontrada.', 404);
      if (categoria.type !== 'ASSET') {
        throw new AppError(`"${categoria.name}" não é uma categoria de ativo.`, 422);
      }
      if (data.categoryId !== atual?.categoryId) {
        assertEscolhaAtiva(categoria, { rotulo: 'A categoria', feminino: true });
      }
    }

    // O número do modelo é único POR FABRICANTE (`@@unique([manufacturerId,
    // modelNumber])`), e a colisão crua vira "Registro já existe" sem dizer
    // qual. Conferido quando o número ou o fabricante mudam.
    if (data.modelNumber === undefined && data.manufacturerId === undefined) return;

    const fabricanteFinal = (data.manufacturerId ?? atual?.manufacturerId) as string | undefined;
    const numeroFinal = data.modelNumber === undefined ? atual?.modelNumber : data.modelNumber;
    if (!fabricanteFinal || !numeroFinal) return;

    const colide = await client.assetModel.findFirst({
      where: {
        manufacturerId: fabricanteFinal,
        // Sem diferença de maiúscula, como os nomes: "P173G" e "p173g" são o
        // mesmo número.
        modelNumber: { equals: escaparCuringas(numeroFinal as string), mode: 'insensitive' },
        ...(id ? { id: { not: id } } : {}),
      },
      select: { name: true },
    });
    if (colide) {
      throw new AppError(`O número "${String(numeroFinal)}" já é do modelo "${colide.name}" deste fabricante.`, 409);
    }
  },
};
