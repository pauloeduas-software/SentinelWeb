import { assertLocalExiste, lerPostoTravado, travarPostoParaEscrita } from '../../catalog/helpers/catalog-lock.helper';
import type { CatalogDelegate, CatalogSpec } from '../../catalog/specs/catalog-spec.types';
import { createWorkstationSchema, updateWorkstationSchema } from '../schemas/workstation.schema';
import {
  itensAbertosNo, itensComoReferencias, nomesDosItens, totalDeUnidades,
} from '../../stock/use-cases/count-person-stock.usecase';

const DICA_DO_POSTO_EM_USO = 'Tire o que está nele agora: devolva o que foi entregue e encerre as responsabilidades.';

function quantos(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

// O POSTO com a regra de cadastro do STATUS (decisão Y): nome único e exclusão
// de verdade recusada só pelo que está nele agora. Sem desativar (AN).
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
  naoEncontrado: 'Posto não encontrado.',

  delegate: (client) => client.workstation as unknown as CatalogDelegate,
  createSchema: createWorkstationSchema,
  updateSchema: updateWorkstationSchema,

  select: {
    id: true, name: true, notes: true, createdAt: true, updatedAt: true,
    locationId: true, location: { select: { id: true, name: true } },
  },
  searchable: ['name'],
  audited: ['name', 'locationId', 'notes'],

  nomeUnicoPor: [],

  dicaEmUso: DICA_DO_POSTO_EM_USO,

  // SÓ O QUE ESTÁ NELE AGORA: entrega de ativo e de estoque abertas, ocupante
  // atual. O que já foi devolvido e encerrado não conta: o `beforeDelete`
  // desliga essas linhas guardando o nome por escrito.
  countUsages: async (client, id) => {
    const [ativos, estoque, ocupacoes] = await Promise.all([
      client.assignment.count({ where: { targetWorkstationId: id, checkinAt: null } }),
      client.stockMovement.count({ where: { targetWorkstationId: id, returnedAt: null } }),
      client.workstationOccupant.count({ where: { workstationId: id, endedAt: null } }),
    ]);
    return ativos + estoque + ocupacoes;
  },

  // A RECUSA DIZ O QUÊ, como a do colaborador: "tem 1 ativo, 3 unidades de
  // estoque (Mouse USB ×2 e Teclado) e 1 ocupante", e o computador e os itens como
  // `refs` — o Devolver mora na ficha deles (BN), e a notificação leva até lá.
  //
  // TRAVA O POSTO ANTES DE CONTAR, `FOR UPDATE`. A entrega ao posto e a
  // ocupação leem o posto travado (`ativoDoPosto`, `lerPostoTravado`), então
  // a que chega no meio da exclusão espera e depois recebe 404 — em vez de a
  // FK segurar o `DELETE` com a frase genérica, sem dizer o que tirar. E a
  // troca de nome espera também: o nome que o `beforeDelete` escreve é mesmo o
  // último.
  async motivoParaNaoExcluir(client, id) {
    await lerPostoTravado(client, id, 'UPDATE');

    const [ativos, itens, ocupantes] = await Promise.all([
      client.assignment.findMany({
        where: { targetWorkstationId: id, checkinAt: null },
        select: { asset: { select: { id: true, assetTag: true } } },
      }),
      itensAbertosNo(client, { targetWorkstationId: id }),
      client.workstationOccupant.count({ where: { workstationId: id, endedAt: null } }),
    ]);

    const partes: string[] = [];
    if (ativos.length > 0) partes.push(quantos(ativos.length, 'ativo', 'ativos'));
    if (itens.length > 0) {
      partes.push(`${quantos(totalDeUnidades(itens), 'unidade de estoque', 'unidades de estoque')} (${nomesDosItens(itens)})`);
    }
    if (ocupantes > 0) partes.push(quantos(ocupantes, 'responsável', 'responsáveis'));
    if (partes.length === 0) return null;

    const frase = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;

    // O pedido cita só o que existe: posto só com ocupante não tem entrega a devolver.
    const pedidos: string[] = [];
    if (ativos.length > 0 || itens.length > 0) pedidos.push('devolva o que foi entregue');
    if (ocupantes > 0) pedidos.push(`encerre ${ocupantes === 1 ? 'a responsabilidade' : 'as responsabilidades'}`);
    return {
      mensagem: `Este posto ainda tem ${frase}. Tire o que está nele agora: ${pedidos.join(' e ')}.`,
      refs: [
        ...ativos.map(({ asset }) => ({ tipo: 'ativo' as const, id: asset.id, nome: asset.assetTag })),
        ...itensComoReferencias(itens),
      ],
    };
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
    // Na ordem do id, como a exclusão do item (`delete-stock-item.usecase.ts`),
    // que desliga as mesmas linhas: os dois ao mesmo tempo se esperam, sem
    // deadlock.
    await client.$queryRaw`
      SELECT id FROM stock_movements
       WHERE "targetWorkstationId" = ${id}::uuid AND "returnedAt" IS NOT NULL
       ORDER BY id
       FOR UPDATE
    `;
    await client.stockMovement.updateMany({
      where: { targetWorkstationId: id, returnedAt: { not: null } },
      data: { targetWorkstationId: null, targetWorkstationName: posto.name },
    });
    await client.workstationOccupant.updateMany({
      where: { workstationId: id, endedAt: { not: null } },
      data: { workstationId: null, workstationName: posto.name },
    });
  },

  // A trava da linha na edição faz a troca de nome esperar quem está lendo o
  // posto para entregar ou ocupar (`lerPostoTravado`).
  //
  // E a localização nova existe (404). Só quando o vínculo MUDA: o formulário
  // reenvia todo campo.
  async beforeWrite(client, id, data) {
    if (id) await travarPostoParaEscrita(client, id);

    const locationId = data.locationId as string | undefined;
    if (!locationId) return;

    if (id) {
      const atual = await client.workstation.findUnique({ where: { id }, select: { locationId: true } });
      if (atual?.locationId === locationId) return;
    }
    await assertLocalExiste(client, locationId);
  },
};
