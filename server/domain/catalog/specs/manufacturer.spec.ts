import { createManufacturerSchema, updateManufacturerSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const manufacturerSpec: CatalogSpec = {
  slug: 'manufacturers',
  entityType: 'Manufacturer',
  tabela: 'manufacturers',
  rotulo: 'fabricante',

  delegate: (client) => client.manufacturer as unknown as CatalogDelegate,
  createSchema: createManufacturerSchema,
  updateSchema: updateManufacturerSchema,

  select: {
    id: true, name: true, url: true,
    supportPhone: true, supportEmail: true, isActive: true, createdAt: true, updatedAt: true,
  },
  searchable: ['name'],
  audited: ['name', 'url', 'supportPhone', 'supportEmail', 'isActive'],

  nomeUnicoPor: [],
  // Desativado some das escolhas e continua no histórico (configuracoes.md).
  optionsWhere: { isActive: true },
  dicaEmUso: 'Desative-o em vez de excluir: ele some das escolhas e continua no histórico.',

  // Os modelos de ativo e as licenças, que apontam direto para cá — inclusive
  // as encerradas: a FK é `Restrict` e elas seguram o fabricante do mesmo
  // jeito. Nenhum dos dois tem lixeira.
  countUsages: async (client, id) => {
    const [modelos, licencas] = await Promise.all([
      client.assetModel.count({ where: { manufacturerId: id } }),
      client.license.count({ where: { manufacturerId: id } }),
    ]);
    return modelos + licencas;
  },
};
