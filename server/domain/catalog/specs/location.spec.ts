import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { assertSemCicloDeLocalizacao } from '../helpers/location-cycle.helper';
import { createLocationSchema, updateLocationSchema } from '../schemas/catalog-entities.schema';
import type { CatalogDelegate, CatalogSpec } from './catalog-spec.types';

export const locationSpec: CatalogSpec = {
  slug: 'locations',
  entityType: 'Location',
  rotulo: 'localização',

  delegate: (client) => client.location as unknown as CatalogDelegate,
  createSchema: createLocationSchema,
  updateSchema: updateLocationSchema,

  select: {
    id: true, name: true, parentId: true, managerId: true, isWorkstation: true,
    address: true, city: true, state: true, zip: true, phone: true, notes: true, createdAt: true,
    parent: { select: { id: true, name: true } },
    manager: { select: { id: true, name: true } },
  },
  // `isWorkstation` ordena junto porque é o corte que a lista de localizações
  // pede primeiro: as mesas de um lado, as filiais do outro. Booleano ordena
  // false → true no Postgres, então `order=desc` traz os postos ao topo.
  sortable: ['name', 'city', 'isWorkstation', 'createdAt'],
  defaultSort: 'name',
  searchable: ['name', 'city', 'address'],
  audited: [
    'name', 'parentId', 'managerId', 'isWorkstation',
    'address', 'city', 'state', 'zip', 'phone', 'notes',
  ],

  // SEM `optionFilter` para `isWorkstation`, e isso é decisão, não esquecimento:
  // o filtro do `/options` é allowlist de campo + VALORES DE TEXTO
  // (`z.enum(valores)` em catalog.controller.ts), e um booleano só caberia ali
  // como as strings 'true'/'false', que o Prisma compararia contra uma coluna
  // `Boolean` — erro de banco, não 422. Quem precisa da lista só de postos usa
  // `GET /api/workstations`, que filtra no domínio `workstation`. O `/options`
  // de localizações continua devolvendo TUDO de propósito: o pai de uma mesa é
  // uma sala, e uma sala não é posto.

  // Filhas na hierarquia E ativos guardados aqui — os da lixeira inclusive: o
  // ativo aponta com `onDelete: SetNull`, então ignorar a lixeira aqui faria o
  // banco zerar o `locationId` de uma linha ainda restaurável, em silêncio.
  countUsages: async (client, id) => {
    const [filhas, ativos] = await Promise.all([
      client.location.count({ where: { parentId: id } }),
      client.asset.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
    ]);
    return filhas + ativos;
  },

  beforeWrite: (client, id, data) => assertSemCicloDeLocalizacao(client, id, data.parentId),
};
