import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { CAMPOS_AUDITADOS_DO_ITEM, rotuloDoAlvo, STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';

/**
 * EXCLUIR DE VEZ — a regra do POSTO (AG): só o que está em uso AGORA impede.
 *
 * O item com unidade com alguém recebe 409, que diz com quem e manda devolver:
 * excluir não pode fazer sumir uma unidade que está numa mesa. O que já foi
 * entregue e voltou se exclui: as entregas devolvidas perdem a ligação e guardam
 * o nome do item por escrito, e o histórico do colaborador continua dizendo
 * "Recebeu: Mouse USB". O histórico do próprio item vai junto com ele — é o
 * preço, e o Desativar continua para o que pode voltar a ser comprado.
 *
 * Sem lixeira: a FK `Restrict` é a rede — nenhuma entrega em uso fica sem item
 * (CHECK `stock_movements_item_presente`).
 */
export async function deleteStockItem(id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A trava antes da contagem: sem ela, uma entrega simultânea nasceria
    // depois deste `findMany`, e a FK recusaria o DELETE com uma frase genérica.
    await travarItemOuFalhar(tx, id);
    const item = await tx.stockItem.findUniqueOrThrow({ where: { id }, select: STOCK_ITEM_SELECT });

    const emUso = await tx.stockMovement.findMany({
      where: { itemId: id, returnedAt: null },
      select: {
        targetPerson: { select: { name: true } },
        targetWorkstation: { select: { name: true } },
        targetWorkstationName: true,
        targetAsset: { select: { assetTag: true, name: true } },
      },
    });
    if (emUso.length > 0) {
      throw new AppError(
        `"${item.name}" ainda tem ${emUso.length === 1 ? '1 unidade em uso' : `${emUso.length} unidades em uso`} `
        + `(${comQuem(emUso.map(rotuloDoAlvo))}). `
        + `${item.category.type === 'COMPONENT' ? 'Retire' : 'Devolva'} antes de excluir.`,
        409,
      );
    }

    // O PASSADO SOLTA O ITEM, como no posto: as entregas devolvidas guardam o
    // nome, e a FK deixa o DELETE passar. As linhas são travadas antes, na
    // ordem do id, como o posto faz (`workstation.spec.ts`): o item e o posto
    // excluídos ao mesmo tempo desligam linhas em comum, e na mesma ordem um
    // espera o outro, em vez de os dois se travarem e um cair por deadlock.
    await tx.$queryRaw`SELECT id FROM stock_movements WHERE "itemId" = ${id}::uuid ORDER BY id FOR UPDATE`;
    await tx.stockMovement.updateMany({ where: { itemId: id }, data: { itemId: null, itemName: item.name } });
    await tx.stockItem.delete({ where: { id } });

    // A exclusão é DE VERDADE: o retrato é o que sobra de que o item existiu.
    await recordAudit(tx, {
      entityType: 'StockItem',
      entityId: id,
      entityLabel: item.name,
      action: 'DELETE',
      changes: buildSnapshot(item, CAMPOS_AUDITADOS_DO_ITEM),
    }, ator);
  });
}

/** "Laura Souza ×2 e Mesa 1" — com quem, e quantas quando é mais de uma. */
function comQuem(alvos: readonly string[]): string {
  const porAlvo = new Map<string, number>();
  for (const alvo of alvos) porAlvo.set(alvo, (porAlvo.get(alvo) ?? 0) + 1);
  const nomes = [...porAlvo]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([alvo, unidades]) => (unidades > 1 ? `${alvo} ×${unidades}` : alvo));
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
