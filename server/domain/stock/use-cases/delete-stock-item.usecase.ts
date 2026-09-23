import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarSaidasAbertas, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';

/**
 * A LIXEIRA do item de estoque — e o 409 que protege as saídas abertas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE OS TRÊS TÊM LIXEIRA, se o catálogo não tem (D36)
 *
 * O vazamento que o D8 evitou é o de um registro apagado aparecendo como valor
 * ATUAL de outra linha — a categoria na lixeira ainda sendo a categoria do
 * ativo. Aqui a leitura aninhada é de HISTÓRICO: o nome do acessório na linha
 * de consumo de março. Mostrar o item apagado ali é o CERTO.
 *
 * E o delete real levaria junto o histórico de consumo (as FKs são `Cascade`),
 * que é a única coisa desta fase que não se reconstrói.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUE A RECUSA É DE APLICAÇÃO, E NÃO DO BANCO: apagar aqui é
 * `UPDATE … SET "deletedAt" = now()`. O Postgres não vê `DELETE` nenhum, a FK
 * `Restrict` do alvo não é consultada e a rede NÃO EXISTE — é o primeiro ponto
 * cego do soft delete, o mesmo que o `deleteUser` documenta.
 *
 * A TRAVA vem antes da contagem, e é o que torna a contagem confiável: sem ela,
 * uma entrega simultânea cria a saída DEPOIS deste `count` e o item vai para a
 * lixeira com unidade na rua.
 */
export async function deleteStockItem(
  spec: StockKindSpec,
  id: string,
  actorId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarItemOuFalhar(tx, spec.kind, spec.rotulo, id);

    const abertas = await contarSaidasAbertas(tx, spec.kind, id);
    if (abertas > 0) {
      throw new AppError(
        `Este ${spec.rotulo} ainda tem ${abertas} ${abertas === 1 ? 'unidade' : 'unidades'} fora do estoque. ` +
          'Faça a devolução antes de excluir.',
        409,
        { saidasAbertas: abertas },
      );
    }

    const { count } = await spec.delegate(tx).updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Zero linhas afetadas aqui só pode ser UMA coisa: o item já estava na
    // lixeira. O id inexistente foi separado pela trava lá em cima, que
    // responde 404 antes de chegar neste ponto.
    //
    // Por isso 409 e não 404: o registro existe, o ESTADO dele é que recusa —
    // mesma família do "este ativo já está entregue" e do "esta ocupação já foi
    // encerrada".
    if (count === 0) throw new AppError(`Este ${spec.rotulo} já está na lixeira.`, 409);

    await recordActivity(tx, { entityType: spec.entityType, entityId: id, action: 'DELETE' }, actorId);
  });
}
