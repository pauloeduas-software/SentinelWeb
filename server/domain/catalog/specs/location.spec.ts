import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import { contarComputadoresNoLocal } from '../../workstation/helpers/computador-do-posto.helper';
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

  // Filhas na hierarquia e ativos guardados aqui.
  //
  // Os da lixeira inclusive: o ativo aponta com `onDelete: SetNull`, então
  // ignorá-lo faria o banco zerar o `locationId` de uma linha ainda
  // restaurável, em silêncio.
  countUsages: async (client, id) => {
    const [filhas, ativos] = await Promise.all([
      client.location.count({ where: { parentId: id } }),
      client.asset.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
    ]);
    return filhas + ativos;
  },

  // A TERCEIRA PORTA DA INVARIANTE 19.
  //
  // As outras duas defendem a ESCRITA de posse e de vínculo
  // (`checkout-asset.usecase.ts` e `link-endpoint-asset.usecase.ts`). Faltava a
  // marca: sem esta guarda, uma sala com dois computadores virava posto de
  // trabalho em uma requisição, e a invariante ficava falsa no banco sem nada
  // ter falhado — numa página que promete fatos que nunca são falsos.
  //
  // MAIS DE UM, e não um: a regra é "no máximo um computador por posto", então
  // marcar uma sala que já tem exatamente um é legítimo e vira um posto válido.
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

    const quantos = await contarComputadoresNoLocal(client, id);
    if (quantos > 1) {
      throw new AppError(
        `Este local tem ${quantos} computadores entregues e um posto de trabalho tem no máximo um. `
          + 'Devolva os que não ficam nele antes de marcá-lo como posto.',
        409,
        { computadores: quantos },
      );
    }
  },
};
