import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarAssentosDoAtivo } from '../../license/use-cases/count-user-seats.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

/**
 * Manda para a lixeira. O ativo TEM soft delete, ao contrário do catálogo (D8):
 * aqui a linha carrega histórico de compra, garantia e posse, e apagar de
 * verdade é perda de dado, não de cadastro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O 409 QUE PROTEGE A LICENÇA (F6)
 *
 * Um ativo com assento de licença atribuído não vai para a lixeira. Sem a
 * recusa, o assento fica PRESO: a contagem olha `license_seat_checkouts`, que
 * não tem `deletedAt` e não sabe que o ativo sumiu.
 *
 * POR QUE NÃO O BANCO: apagar aqui é `UPDATE assets SET "deletedAt"`, o
 * Postgres não vê `DELETE` nenhum e a FK não é consultada. É o ponto cego do
 * soft delete, o mesmo que o `deleteUser` documenta.
 *
 * A TRAVA vem antes da contagem, e é o que a torna confiável: sem ela, uma
 * entrega simultânea cria a linha DEPOIS deste `count` (`lock-asset.usecase.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function deleteAsset(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarAtivoOuFalhar(tx, id);

    // O 409 pela licença (F6): o assento continuaria descontado do contrato
    // para sempre, e a aba Licenças que ofereceria a devolução responde 404 —
    // a empresa pagaria por um assento preso a uma máquina que não existe mais.
    const assentos = await contarAssentosDoAtivo(tx, id);
    if (assentos > 0) {
      throw new AppError(
        `Este ativo ainda ocupa ${assentos} ${assentos === 1 ? 'assento' : 'assentos'} de licença. `
        + 'Devolva os assentos pela aba Licenças antes de excluir.',
        409,
        { assentosDeLicenca: assentos },
      );
    }

    const { count } = await tx.asset.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Zero linhas aqui só pode ser UMA coisa: o ativo já estava na lixeira. O id
    // inexistente foi separado pela trava lá em cima, que responde 404 antes de
    // chegar neste ponto.
    if (count === 0) throw new AppError('Este ativo já está na lixeira.', 409);

    await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'DELETE' }, actorId);
  });
}
