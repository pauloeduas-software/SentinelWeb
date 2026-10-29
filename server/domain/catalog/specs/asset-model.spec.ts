import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import { lerCategoriaTravada, lerFabricanteTravado } from '../helpers/catalog-lock.helper';
import { createAssetModelSchema, updateAssetModelSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';
import { escaparCuringas } from '../../shared/busca.helper';

export const assetModelSpec: CatalogSpec = {
  slug: 'asset-models',
  entityType: 'AssetModel',
  tabela: 'asset_models',
  rotulo: 'modelo',

  delegate: (client) => client.assetModel as unknown as CatalogDelegate,
  createSchema: createAssetModelSchema,
  updateSchema: updateAssetModelSchema,

  // O fabricante e a categoria vêm embutidos porque a tabela mostra o nome, não
  // o uuid — e uma segunda consulta por linha seria N+1 na tela.
  select: {
    id: true, name: true, modelNumber: true, notes: true,
    manufacturerId: true, categoryId: true, createdAt: true, updatedAt: true,
    manufacturer: { select: { id: true, name: true } },
    category: { select: { id: true, name: true, type: true } },
  },
  searchable: ['name', 'modelNumber'],
  audited: [
    'name', 'modelNumber', 'notes', 'manufacturerId', 'categoryId',
  ],

  // Sem Desativar (AO): o modelo em uso fica, e sai quando nenhum ativo o usa.
  dicaEmUso: 'Troque o modelo desses ativos e exclua de novo.',

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
  // nenhum filtro de Computadores os encontra. E um id inexistente caía no P2003, que
  // responde "em uso por outro cadastro" — status e frase errados para "não
  // existe".
  async beforeWrite(client, id, data) {
    const atual = id
      ? await client.assetModel.findUnique({
        where: { id },
        select: { manufacturerId: true, modelNumber: true },
      })
      : null;

    if (typeof data.manufacturerId === 'string') {
      const fabricante = await lerFabricanteTravado(client, data.manufacturerId);
      if (!fabricante) throw new AppError('Fabricante não encontrado.', 404);
    }

    // Leitura `FOR SHARE`: a troca de tipo da categoria trava a linha, e esta
    // leitura espera por ela em vez de aprovar o tipo velho
    // (`catalog-lock.helper.ts`).
    if (typeof data.categoryId === 'string') {
      const categoria = await lerCategoriaTravada(client, data.categoryId);
      if (!categoria) throw new AppError('Categoria não encontrada.', 404);
      if (categoria.type !== 'ASSET') {
        throw new AppError(`"${categoria.name}" não é uma categoria de ativo.`, 422);
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
