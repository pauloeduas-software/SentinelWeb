import { INCLUINDO_LIXEIRA } from '../../../core/database/soft-delete.extension';
import { AppError } from '../../../core/errors/app-error';
import { contarAtivosNoLocal } from '../../workstation/helpers/ativo-do-posto.helper';
import { travarLocalParaEscrita } from '../helpers/catalog-lock.helper';
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
    id: true, name: true, isWorkstation: true, isActive: true,
    address: true, city: true, state: true, zip: true, phone: true, notes: true, createdAt: true,
  },
  searchable: ['name', 'city', 'address'],
  audited: [
    'name', 'isWorkstation', 'isActive',
    'address', 'city', 'state', 'zip', 'phone', 'notes',
  ],

  // SEM `optionFilter` para `isWorkstation`, e isso é decisão, não esquecimento:
  // o filtro do `/options` é allowlist de campo + VALORES DE TEXTO
  // (`z.enum(valores)` em catalog.controller.ts), e um booleano só caberia ali
  // como as strings 'true'/'false', que o Prisma compararia contra uma coluna
  // `Boolean` — erro de banco, não 422. Quem precisa da lista só de postos usa
  // `GET /api/workstations`, que filtra no domínio `workstation`. O `/options`
  // de localizações devolve postos e não postos juntos: o ativo pode ficar
  // guardado numa sala tanto quanto numa mesa.

  nomeUnicoPor: [],

  // O formulário só ESCOLHE localização ativa: desativada não recebe nada novo,
  // e o vínculo que já aponta para ela aparece como "fora desta lista" no
  // `ReferenceSelect`, sem sumir.
  optionsWhere: { isActive: true },

  dicaEmUso: 'Desative-a em vez de excluir: ela some das escolhas e continua no histórico.',

  // Ativos guardados aqui, itens de estoque guardados aqui, entregas de ativo,
  // saídas de estoque e ocupantes deste posto.
  //
  // Os ativos da lixeira inclusive: o ativo aponta com `onDelete: SetNull`,
  // então ignorá-lo faria o banco zerar o `locationId` de uma linha ainda
  // restaurável, em silêncio. As saídas TODAS, devolvidas inclusive: a FK é
  // `Restrict` em cada linha, e o histórico de "o que já esteve nesta mesa"
  // segura o posto tanto quanto a unidade que está nela — contar só as abertas
  // deixaria o posto só com histórico cair no P2003 cru, sem o número.
  //
  // As ENTREGAS e as OCUPAÇÕES também todas, encerradas inclusive, pelo mesmo
  // motivo: "quem respondia pela Mesa 1 em março" é histórico de posse, e as
  // duas FKs são `Restrict`. Local com qualquer uso se desativa, não se exclui
  // (`isActive`); vazio de verdade, sai.
  countUsages: async (client, id) => {
    const [ativos, itens, entregas, saidas, ocupacoes] = await Promise.all([
      client.asset.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
      client.stockItem.count({ where: { locationId: id, ...INCLUINDO_LIXEIRA } }),
      client.assignment.count({ where: { targetLocationId: id } }),
      client.stockMovement.count({ where: { targetLocationId: id } }),
      client.locationOccupant.count({ where: { locationId: id } }),
    ]);
    return ativos + itens + entregas + saidas + ocupacoes;
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
  //
  // A TRAVA DA LINHA antes de contar: é o que serializa a marca com a entrega
  // a este local — contar ativos sem ela deixava uma entrega simultânea passar
  // e o posto ficar com dois (`catalog-lock.helper.ts`). Na edição sempre, e não
  // só na marca: é ela também que faz a desativação esperar quem lê a marca.
  async beforeWrite(client, id, data) {
    if (id) await travarLocalParaEscrita(client, id);

    // Na criação não há posse apontando para um local que ainda não existe.
    if (!id || data.isWorkstation !== true) return;

    const atual = await client.location.findUnique({ where: { id }, select: { isWorkstation: true } });
    if (!atual || atual.isWorkstation) return;

    const quantos = await contarAtivosNoLocal(client, id);
    if (quantos > 1) {
      throw new AppError(
        `Este local tem ${quantos} ativos entregues e um posto de trabalho tem no máximo um. `
          + 'Devolva os que não ficam nele antes de marcá-lo como posto.',
        409,
      );
    }
  },
};
