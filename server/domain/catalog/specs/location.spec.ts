import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { createLocationSchema, updateLocationSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const locationSpec: CatalogSpec = {
  slug: 'locations',
  entityType: 'Location',
  tabela: 'locations',
  rotulo: 'localização',

  delegate: (client) => client.location as unknown as CatalogDelegate,
  createSchema: createLocationSchema,
  updateSchema: updateLocationSchema,

  select: {
    id: true, name: true,
    address: true, city: true, state: true, zip: true, phone: true, notes: true, createdAt: true, updatedAt: true,
  },
  searchable: ['name', 'city', 'address'],
  audited: ['name', 'address', 'city', 'state', 'zip', 'phone', 'notes'],

  nomeUnicoPor: [],

  // Sem Desativar (AO): a localização com algo nela fica, e a vazia se exclui.
  dicaEmUso: 'Mova o que está guardado nela e os postos que ficam nela, e exclua de novo.',

  // A mesma lógica do status: localização é cadastro de REFERÊNCIA e só o que
  // aponta para ela AGORA a segura — os ativos e itens de estoque guardados
  // aqui e os postos que ficam aqui. Os ativos da lixeira e os itens
  // desativados contam porque continuam apontando e podem voltar. Ela não recebe entrega nem ocupante — quem
  // recebe é o posto (decisão Y) —, então não há passado preso a ela.
  countUsages: async (client, id) => {
    const [ativos, itens, postos] = await Promise.all([
      client.asset.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
      client.stockItem.count({ where: { locationId: id } }),
      client.workstation.count({ where: { locationId: id } }),
    ]);
    return ativos + itens + postos;
  },
};
