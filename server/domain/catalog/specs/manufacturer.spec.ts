import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
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

  // Modelos de ativo E os três de estoque, que apontam direto para cá desde a
  // F5. Sem os três, apagar um fabricante usado só por acessórios contava 0, o
  // `DELETE` seguia, e a FK `Restrict` respondia P2003 — o 409 genérico
  // "Registro está em uso por outro cadastro", que não diz por quantos.
  //
  // `INCLUINDO_LIXEIRA` porque a FK não distingue linha viva de linha na
  // lixeira: um acessório apagado continua segurando o fabricante no banco, e
  // uma contagem que o ignora promete um delete que o Postgres vai recusar.
  countUsages: async (client, id) => {
    const [modelos, acessorios, consumiveis, componentes] = await Promise.all([
      client.assetModel.count({ where: { manufacturerId: id } }),
      client.accessory.count({ where: { manufacturerId: id, ...INCLUINDO_LIXEIRA } }),
      client.consumable.count({ where: { manufacturerId: id, ...INCLUINDO_LIXEIRA } }),
      client.component.count({ where: { manufacturerId: id, ...INCLUINDO_LIXEIRA } }),
    ]);
    return modelos + acessorios + consumiveis + componentes;
  },
};
