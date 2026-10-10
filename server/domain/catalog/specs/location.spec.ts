import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import { contarAtivosNoLocal } from '../../workstation/helpers/ativo-do-posto.helper';
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

  // Filhas na hierarquia, ativos guardados aqui e unidades de estoque
  // entregues a este posto.
  //
  // Os ativos da lixeira inclusive: o ativo aponta com `onDelete: SetNull`,
  // então ignorá-lo faria o banco zerar o `locationId` de uma linha ainda
  // restaurável, em silêncio. As unidades só as FORA (`returnedAt` nulo): a
  // FK é `Restrict` e o banco recusaria de qualquer forma, mas por 409 genérico
  // — contar aqui é o que faz a mensagem dizer quantas.
  countUsages: async (client, id) => {
    const [filhas, ativos, unidades] = await Promise.all([
      client.location.count({ where: { parentId: id } }),
      client.asset.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
      client.stockMovement.count({ where: { targetLocationId: id, kind: 'SAIDA', returnedAt: null } }),
    ]);
    return filhas + ativos + unidades;
  },

  // A PORTA DA MARCA na invariante 19 — as outras duas são a entrega
  // (`checkout-asset.usecase.ts`) e a volta da lixeira
  // (`asset/use-cases/restore-asset.usecase.ts`). Sem esta guarda, uma sala com
  // dois computadores virava posto de trabalho em uma requisição, e a invariante
  // ficava falsa no banco sem nada ter falhado — numa página que promete fatos
  // que nunca são falsos.
  //
  // MAIS DE UM, e não um: a regra é "no máximo um ativo por posto", então marcar
  // uma sala que já tem exatamente um é legítimo e vira um posto válido.
  //
  // O padrão dos três passos é o do `category.spec.ts` e do `status-label.spec.ts`:
  // sai na criação, sai quando o campo não foi mencionado, e sai quando a marca
  // já estava ligada — a guarda só dispara na TRANSIÇÃO.
  async beforeWrite(client, id, data) {
    await assertSemCicloDeLocalizacao(client, id, data.parentId);

    // Na criação não há posse apontando para um local que ainda não existe.
    if (!id || data.isWorkstation !== true) return;

    const atual = await client.location.findUnique({
      where: { id },
      select: { isWorkstation: true },
    });
    if (!atual || atual.isWorkstation) return;

    const quantos = await contarAtivosNoLocal(client, id);
    if (quantos > 1) {
      throw new AppError(
        `Este local tem ${quantos} ativos entregues e um posto de trabalho tem no máximo um. `
          + 'Devolva os que não ficam nele antes de marcá-lo como posto.',
        409,
        { ativos: quantos },
      );
    }
  },
};
