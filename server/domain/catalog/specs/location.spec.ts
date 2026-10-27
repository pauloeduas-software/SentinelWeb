import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { travarLocalParaEscrita } from '../helpers/catalog-lock.helper';
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
    id: true, name: true, isActive: true,
    address: true, city: true, state: true, zip: true, phone: true, notes: true, createdAt: true,
  },
  searchable: ['name', 'city', 'address'],
  audited: ['name', 'isActive', 'address', 'city', 'state', 'zip', 'phone', 'notes'],

  nomeUnicoPor: [],

  // O formulário só ESCOLHE localização ativa: desativada não guarda nada novo,
  // e o vínculo que já aponta para ela aparece como "fora desta lista" no
  // `ReferenceSelect`, sem sumir.
  optionsWhere: { isActive: true },

  dicaEmUso: 'Mova o que está guardado nela e os postos que ficam nela, ou desative-a: '
    + 'ela some das escolhas e continua no histórico.',

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

  // A trava da linha na edição: é o que faz a desativação esperar quem está
  // lendo o `isActive` dela para guardar algo aqui (`catalog-lock.helper.ts`).
  async beforeWrite(client, id) {
    if (id) await travarLocalParaEscrita(client, id);
  },
};
