import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createSupplierSchema, updateSupplierSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const supplierSpec: CatalogSpec = {
  slug: 'suppliers',
  entityType: 'Supplier',
  rotulo: 'fornecedor',

  delegate: (client) => client.supplier as unknown as CatalogDelegate,
  createSchema: createSupplierSchema,
  updateSchema: updateSupplierSchema,

  select: {
    id: true, name: true, contactName: true, phone: true, email: true, url: true,
    address: true, city: true, state: true, zip: true, notes: true, createdAt: true,
  },
  sortable: ['name', 'city', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name', 'contactName', 'city'],
  audited: ['name', 'contactName', 'phone', 'email', 'url', 'address', 'city', 'state', 'zip', 'notes'],

  // O ativo aponta com `onDelete: SetNull`, então o banco não barraria sozinho —
  // a recusa aqui é de produto: apagar o fornecedor apagaria de quem se comprou.
  //
  // `INCLUINDO_LIXEIRA` é obrigatório JUSTAMENTE por causa do SetNull: sem ele a
  // contagem ignora o ativo apagado, o delete passa, e o banco zera o
  // `supplierId` de uma linha que ainda pode ser restaurada. Ela voltaria da
  // lixeira sem saber de quem foi comprada.
  countUsages: (client, id) =>
    client.asset.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
};
