import { assertLocalRecebe, travarPostoParaEscrita } from '../../catalog/helpers/catalog-lock.helper';
import type { CatalogDelegate, CatalogSpec } from '../../catalog/specs/catalog-spec.types';
import { createWorkstationSchema, updateWorkstationSchema } from '../schemas/workstation.schema';

// O POSTO com a regra de cadastro do STATUS (decisão Y): nome único, desativar
// em vez de excluir, exclusão de verdade recusada só pelo que está nele agora.
//
// É uma `CatalogSpec` para passar pelo MESMO CRUD das tabelas de catálogo
// (`catalog/use-cases/`) — o 409 por uso, a unicidade do nome e o `AuditLog`
// num lugar só. Mas fica FORA de `CATALOG_SPECS`: o posto se cadastra na tela
// Postos, não numa aba de Configurações, e as rotas dele são registradas pelo
// `workstation.maestro.ts`.
export const workstationSpec: CatalogSpec = {
  slug: 'workstations',
  entityType: 'Workstation',
  tabela: 'workstations',
  rotulo: 'posto',

  delegate: (client) => client.workstation as unknown as CatalogDelegate,
  createSchema: createWorkstationSchema,
  updateSchema: updateWorkstationSchema,

  select: {
    id: true, name: true, notes: true, isActive: true, createdAt: true,
    locationId: true, location: { select: { id: true, name: true } },
  },
  searchable: ['name'],
  audited: ['name', 'locationId', 'notes', 'isActive'],

  nomeUnicoPor: [],

  // O seletor da entrega, da saída de estoque e do vínculo de máquina só
  // oferece posto ativo: desativado não recebe nada novo.
  optionsWhere: { isActive: true },

  dicaEmUso: 'Tire o que está nele agora — devolva o que foi entregue e encerre as ocupações — '
    + 'ou desative-o: ele some das escolhas e continua no histórico.',

  // SÓ O QUE ESTÁ NELE AGORA: entrega e saída de estoque abertas, ocupante
  // atual. O que já foi devolvido e encerrado não conta: o `beforeDelete`
  // desliga essas linhas guardando o nome por escrito.
  countUsages: async (client, id) => {
    const [entregas, saidas, ocupacoes] = await Promise.all([
      client.assignment.count({ where: { targetWorkstationId: id, checkinAt: null } }),
      client.stockMovement.count({ where: { targetWorkstationId: id, returnedAt: null } }),
      client.workstationOccupant.count({ where: { workstationId: id, endedAt: null } }),
    ]);
    return entregas + saidas + ocupacoes;
  },

  // O PASSADO SOLTA O POSTO. Roda depois da contagem — nada aberto aponta para
  // cá — e antes do `DELETE`: as linhas já fechadas perdem a ligação e guardam
  // o nome que o posto tem AGORA, o último antes de ele sair. É o nome que o
  // histórico mostra enquanto o posto existe, então nada muda na tela.
  //
  // As FKs continuam `Restrict`: a linha que ninguém desligou aqui — uma
  // entrega que nasceu depois da contagem — segura o `DELETE` e desfaz a
  // transação inteira, em vez de sumir.
  async beforeDelete(client, id) {
    const posto = await client.workstation.findUnique({ where: { id }, select: { name: true } });
    if (!posto) return;

    await client.assignment.updateMany({
      where: { targetWorkstationId: id, checkinAt: { not: null } },
      data: { targetWorkstationId: null, targetWorkstationName: posto.name },
    });
    await client.stockMovement.updateMany({
      where: { targetWorkstationId: id, returnedAt: { not: null } },
      data: { targetWorkstationId: null, targetWorkstationName: posto.name },
    });
    await client.workstationOccupant.updateMany({
      where: { workstationId: id, endedAt: { not: null } },
      data: { workstationId: null, workstationName: posto.name },
    });
  },

  // A trava da linha na edição faz a desativação esperar quem está lendo o
  // `isActive` do posto para entregar ou ocupar (`assertPostoRecebe`).
  //
  // E a localização desativada não recebe posto novo — nem posto que se muda
  // para ela. Só quando o vínculo MUDA: o formulário reenvia todo campo, e o
  // posto que já estava na Filial não fica impedido de mudar de nome porque a
  // Filial foi desativada.
  async beforeWrite(client, id, data) {
    if (id) await travarPostoParaEscrita(client, id);

    const locationId = data.locationId as string | undefined;
    if (!locationId) return;

    if (id) {
      const atual = await client.workstation.findUnique({ where: { id }, select: { locationId: true } });
      if (atual?.locationId === locationId) return;
    }
    await assertLocalRecebe(client, locationId, 'posto novo');
  },
};
