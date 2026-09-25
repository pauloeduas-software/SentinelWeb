import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarAssentosDe, travarTodosOsAssentos, travarLicencaOuFalhar } from '../helpers/license-seats.helper';

/**
 * A LIXEIRA da licença — e o 409 que protege os assentos ocupados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A RECUSA É DE APLICAÇÃO, E NÃO DO BANCO.
 *
 * Apagar aqui é `UPDATE licenses SET "deletedAt" = now()`. O Postgres não vê
 * `DELETE` nenhum, o `Cascade` para `license_seats` não dispara e a FK
 * `Restrict` dos alvos não é consultada — a rede NÃO EXISTE. É o ponto cego do
 * soft delete, o mesmo que `deleteUser`, `deleteAsset` e `deleteStockItem`
 * documentam.
 *
 * Sem a recusa, mandar a licença para a lixeira deixa os assentos ocupados
 * presos: eles continuam contando como ocupados em `holdings` e no 409 do
 * desligamento — as consultas olham `license_seat_checkouts`, que não tem
 * `deletedAt` —, e a tela que ofereceria a devolução responde 404, porque a
 * licença não existe mais para o inventário.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A TRAVA vem antes da contagem, e é o que a torna confiável: sem ela, uma
 * entrega simultânea cria a ocupação DEPOIS deste `count` e a licença vai para
 * a lixeira com assento na rua. Trava a licença E os assentos — os dois na
 * ordem do D90, porque esta operação é do lado do contrato, não do caminho
 * quente de entrega.
 */
export async function deleteLicense(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarLicencaOuFalhar(tx, id);
    await travarTodosOsAssentos(tx, id);

    const { ocupados } = await contarAssentosDe(tx, id);
    if (ocupados > 0) {
      throw new AppError(
        `Esta licença ainda tem ${ocupados} ${ocupados === 1 ? 'assento ocupado' : 'assentos ocupados'}. `
        + 'Devolva os assentos antes de excluir.',
        409,
        { assentosOcupados: ocupados },
      );
    }

    const { count } = await tx.license.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Zero linhas aqui só pode ser UMA coisa: a licença já estava na lixeira. O
    // id inexistente foi separado pela trava lá em cima, que responde 404 antes
    // de chegar neste ponto.
    //
    // Por isso 409 e não 404: o registro existe, o ESTADO dele é que recusa.
    if (count === 0) throw new AppError('Esta licença já está na lixeira.', 409);

    await recordActivity(tx, { entityType: 'License', entityId: id, action: 'DELETE' }, actorId);
  });
}
