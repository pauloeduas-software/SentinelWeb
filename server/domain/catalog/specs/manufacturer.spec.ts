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
    supportPhone: true, supportEmail: true, isActive: true, createdAt: true,
  },
  searchable: ['name'],
  audited: ['name', 'url', 'supportPhone', 'supportEmail', 'isActive'],

  nomeUnicoPor: [],
  // Desativado some das escolhas e continua no histórico (configuracoes.md).
  optionsWhere: { isActive: true },
  dicaEmUso: 'Desative-o em vez de excluir: ele some das escolhas e continua no histórico.',

  // Os modelos de ativo e as licenças, que apontam direto para cá.
  //
  // A licença da lixeira conta: a FK é `Restrict` e ela segura o fabricante do
  // mesmo jeito — sem ela a contagem dava 0 e o usuário lia o P2003 genérico
  // sobre um registro que nem enxerga. `assetModel` não tem lixeira.
  countUsages: async (client, id) => {
    const [modelos, licencas] = await Promise.all([
      client.assetModel.count({ where: { manufacturerId: id } }),
      client.license.count({ where: { manufacturerId: id, ...INCLUINDO_LIXEIRA } }),
    ]);
    return modelos + licencas;
  },
};
