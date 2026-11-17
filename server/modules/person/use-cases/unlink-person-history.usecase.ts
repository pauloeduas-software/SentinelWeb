import type { ClienteCatalogo } from '../../catalog/specs/catalog-spec.types';

/**
 * O PASSADO SOLTA O COLABORADOR — a exclusão de vez da lixeira (DL), na regra
 * do posto: as linhas já fechadas que apontam para ele perdem a ligação e
 * guardam o nome por escrito, e o histórico do computador, do posto, da licença
 * e do item continua dizendo "Laura Souza". Some só a ficha dela.
 *
 * Roda com a pessoa travada e depois de conferir que nada está aberto no nome
 * dela. Só a linha FECHADA se solta: as FKs continuam `Restrict`, e a aberta
 * que ninguém desligou aqui segura o `DELETE` e desfaz a transação inteira, em
 * vez de sumir.
 *
 * NA ORDEM DO ID, como a exclusão do item e do posto: a exclusão de vez do
 * computador, a do item e a da licença desligam algumas das mesmas linhas, e
 * as duas transações travando em ordens diferentes se matariam (deadlock).
 */
export async function desligarPassadoDaPessoa(client: ClienteCatalogo, personId: string, nome: string): Promise<void> {
  await client.$queryRaw`
    SELECT id FROM assignments WHERE "targetPersonId" = ${personId}::uuid ORDER BY id FOR UPDATE
  `;
  await client.assignment.updateMany({
    where: { targetPersonId: personId, checkinAt: { not: null } },
    data: { targetPersonId: null, targetPersonName: nome },
  });

  await client.$queryRaw`
    SELECT id FROM workstation_occupants WHERE "personId" = ${personId}::uuid ORDER BY id FOR UPDATE
  `;
  await client.workstationOccupant.updateMany({
    where: { personId, endedAt: { not: null } },
    data: { personId: null, personName: nome },
  });

  await client.$queryRaw`
    SELECT id FROM license_checkouts WHERE "assignedPersonId" = ${personId}::uuid ORDER BY id FOR UPDATE
  `;
  await client.licenseCheckout.updateMany({
    where: { assignedPersonId: personId, checkinAt: { not: null } },
    data: { assignedPersonId: null, assignedPersonName: nome },
  });

  await client.$queryRaw`
    SELECT id FROM stock_movements WHERE "targetPersonId" = ${personId}::uuid ORDER BY id FOR UPDATE
  `;
  await client.stockMovement.updateMany({
    where: { targetPersonId: personId, returnedAt: { not: null } },
    data: { targetPersonId: null, targetPersonName: nome },
  });
}
