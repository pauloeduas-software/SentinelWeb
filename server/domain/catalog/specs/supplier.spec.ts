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
  // a recusa ali é de produto: apagar o fornecedor apagaria de quem se comprou.
  //
  // OS TRÊS DE ESTOQUE apontam com `Restrict` (F5), então neles o banco barra —
  // e é por isso que eles PRECISAM ser contados aqui: sem a contagem, o delete
  // seguia e o P2003 virava 409 genérico, sem dizer por quantos.
  //
  // `INCLUINDO_LIXEIRA` nos quatro, por dois motivos que dão no mesmo número:
  // no ativo, porque o `SetNull` apagaria o vínculo de uma linha ainda
  // restaurável — ela voltaria da lixeira sem saber de quem foi comprada; nos
  // de estoque, porque a FK `Restrict` não distingue lixeira de linha viva.
  countUsages: async (client, id) => {
    const [ativos, acessorios, consumiveis, componentes] = await Promise.all([
      client.asset.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
      client.accessory.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
      client.consumable.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
      client.component.count({ where: { supplierId: id, ...INCLUINDO_LIXEIRA } }),
    ]);
    return ativos + acessorios + consumiveis + componentes;
  },
};
