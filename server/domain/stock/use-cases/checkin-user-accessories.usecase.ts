import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { accessorySpec, type ClienteEstoque } from '../helpers/stock-kind.helper';

// A DEVOLUÇÃO DOS ACESSÓRIOS NO DESLIGAMENTO — e a linha mais importante da F5.
//
// ═════════════════════════════════════════════════════════════════════════════
// O `targetType: 'USER'` DO `where` ABAIXO É O QUE IMPEDE O DESLIGAMENTO DE
// ESVAZIAR O POSTO.
//
// Sem ele, desligar a Laura devolve ao estoque os 5 mouses da Mesa 1 — que
// continuam FISICAMENTE na mesa, agora com a Ana. O inventário passa a dizer
// que há 5 mouses no almoxarifado e não há; o saldo "bate" em toda consulta,
// porque as linhas foram fechadas corretamente; e ninguém percebe até alguém ir
// buscar um mouse na gaveta.
//
// É o mesmo erro que o D32 descreve um nível acima, com os ativos, e a mesma
// correção: o que é do POSTO se resolve encerrando a OCUPAÇÃO, não devolvendo o
// equipamento. Quem sai da Mesa 1 deixa de responder pelos mouses; os mouses
// ficam.
// ═════════════════════════════════════════════════════════════════════════════

export interface AcessorioDevolvido {
  checkoutId: string;
  accessoryId: string;
  accessoryName: string;
}

/**
 * Fecha as entregas de alvo `USER` desta pessoa, DENTRO da transação do
 * desligamento.
 *
 * Recebe o `tx` e não abre transação própria: as devoluções, os ativos e as
 * ocupações do `offboardUser` são UM fato. Metade aplicada é o pior de todos os
 * estados.
 */
export async function devolverAcessoriosDoUsuario(
  client: ClienteEstoque,
  userId: string,
  notes: string | null,
  actorId: string | null,
): Promise<AcessorioDevolvido[]> {
  const abertas = await client.accessoryCheckout.findMany({
    where: {
      // ⬇ A linha. Ver o bloco no topo do arquivo antes de mexer nela.
      targetType: 'USER',
      targetUserId: userId,
      checkedInAt: null,
      // A MESMA condição do `contarAcessoriosDiretos`, e as duas têm que ser a
      // mesma: o 409 do `DELETE` conta o que esta consulta fecha. Fosse
      // diferente, um acessório na lixeira com unidade aberta travaria o
      // colaborador para sempre.
      accessory: { deletedAt: null },
    },
    select: { id: true, accessoryId: true, accessory: { select: { name: true } } },
    orderBy: { checkedOutAt: 'asc' },
  });

  if (abertas.length === 0) return [];

  const devolvidoEm = new Date();

  // Um `updateMany` só para as N linhas: elas são todas da mesma pessoa, com o
  // mesmo carimbo e a mesma nota — um laço com N `update` faria N viagens ao
  // banco para escrever exatamente o mesmo valor.
  await client.accessoryCheckout.updateMany({
    where: { id: { in: abertas.map((entrega) => entrega.id) } },
    data: { checkedInAt: devolvidoEm, checkinNotes: notes, checkinById: actorId },
  });

  // O log é POR ACESSÓRIO, não um só para o lote: quem abre o histórico do
  // mouse quer ver que ele voltou naquele dia, e uma linha única pendurada no
  // usuário não apareceria naquela tela.
  for (const entrega of abertas) {
    await recordActivity(client, {
      entityType: accessorySpec.entityType,
      entityId: entrega.accessoryId,
      action: 'CHECKIN',
      changes: {
        checkoutId: entrega.id,
        targetType: 'USER',
        targetId: userId,
        motivo: 'OFFBOARD',
        checkedInAt: devolvidoEm.toISOString(),
      },
    }, actorId);
  }

  return abertas.map((entrega) => ({
    checkoutId: entrega.id,
    accessoryId: entrega.accessoryId,
    accessoryName: entrega.accessory.name,
  }));
}
