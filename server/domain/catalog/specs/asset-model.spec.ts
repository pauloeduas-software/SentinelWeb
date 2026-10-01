import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createAssetModelSchema, updateAssetModelSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

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
    id: true, name: true, modelNumber: true, eolMonths: true, notes: true,
    manufacturerId: true, categoryId: true, depreciationId: true, createdAt: true,
    // A ÂNCORA QUE SOBREPÕE A CATEGORIA (F9, D58). O nome vem embutido pelo
    // mesmo motivo do fabricante: a tabela mostra o nome, não o uuid.
    customFieldsetId: true,
    customFieldset: { select: { id: true, name: true } },
    manufacturer: { select: { id: true, name: true } },
    category: { select: { id: true, name: true, type: true } },
    // A regra embutida porque a tabela mostra o NOME dela, e porque é daqui que
    // o valor contábil do ativo sai — `months` e o piso viajam com ela para o
    // cálculo não precisar de uma segunda consulta por ativo (F8).
    depreciation: { select: { id: true, name: true, months: true, floorValue: true, floorType: true } },
  },
  sortable: ['name', 'modelNumber', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name', 'modelNumber'],
  audited: [
    'name', 'modelNumber', 'eolMonths', 'notes',
    'manufacturerId', 'categoryId', 'depreciationId', 'customFieldsetId',
  ],

  // Conta a lixeira também: a FK é `Restrict` e o banco recusaria de todo jeito,
  // mas sem isto a contagem dá 0 e o usuário recebe o P2003 genérico no lugar da
  // mensagem que diz quantos ativos usam o modelo.
  countUsages: (client, id) =>
    client.asset.count({ where: { modelId: id, ...INCLUINDO_LIXEIRA } }),
};
