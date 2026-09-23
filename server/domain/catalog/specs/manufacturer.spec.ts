import { createManufacturerSchema, updateManufacturerSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const manufacturerSpec: CatalogSpec = {
  slug: 'manufacturers',
  entityType: 'Manufacturer',
  rotulo: 'fabricante',

  delegate: (client) => client.manufacturer as unknown as CatalogDelegate,
  createSchema: createManufacturerSchema,
  updateSchema: updateManufacturerSchema,

  select: {
    id: true, name: true, url: true,
    supportPhone: true, supportEmail: true, supportUrl: true, createdAt: true,
  },
  sortable: ['name', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name'],
  audited: ['name', 'url', 'supportPhone', 'supportEmail', 'supportUrl'],

  countUsages: (client, id) => client.assetModel.count({ where: { manufacturerId: id } }),
};
