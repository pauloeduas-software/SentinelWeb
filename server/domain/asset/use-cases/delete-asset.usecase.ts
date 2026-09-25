import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarComponentesInstalados } from '../../stock/use-cases/count-asset-components.usecase';
import { contarAssentosDoAtivo } from '../../license/use-cases/count-user-seats.usecase';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

/**
 * Manda para a lixeira. O ativo TEM soft delete, ao contrário do catálogo (D8):
 * aqui a linha carrega histórico de compra, garantia e posse, e apagar de
 * verdade é perda de dado, não de cadastro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O 409 QUE PROTEGE O ESTOQUE (F5)
 *
 * Um ativo com componente instalado não vai para a lixeira. Sem esta recusa, as
 * unidades ficam PRESAS: o saldo do componente continua descontado (a contagem
 * olha `component_assets`, que não tem `deletedAt` e não sabe que o ativo sumiu)
 * e a tela que ofereceria a retirada responde 404 — a peça sai do estoque e não
 * há caminho de volta por tela nenhuma.
 *
 * É a mesma regra que `deleteStockItem` já aplicava do outro lado — *"ainda tem
 * N unidades fora do estoque"* —, agora vista do lado do ativo.
 *
 * POR QUE NÃO O BANCO: `component_assets.assetId` é `onDelete: Restrict`, o que
 * parece resolver e não resolve. Apagar aqui é `UPDATE assets SET "deletedAt"`:
 * o Postgres não vê `DELETE` nenhum, a FK não é consultada e a rede NÃO EXISTE.
 * É o ponto cego do soft delete, o mesmo que o `deleteUser` documenta.
 *
 * A TRAVA vem antes da contagem, e é o que a torna confiável: sem ela, uma
 * instalação simultânea cria a linha DEPOIS deste `count` e o ativo vai para a
 * lixeira com a peça dentro — o 409 que este bloco existe para dar simplesmente
 * não dispara (`lock-asset.usecase.ts`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function deleteAsset(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarAtivoOuFalhar(tx, id);

    const unidades = await contarComponentesInstalados(tx, id);
    if (unidades > 0) {
      throw new AppError(
        `Este ativo ainda tem ${unidades} ${unidades === 1 ? 'unidade' : 'unidades'} de componente instalada(s). ` +
          'Retire as peças pela aba Componentes antes de excluir.',
        409,
        { componentesInstalados: unidades },
      );
    }

    // O MESMO 409, agora pela licença (F6).
    //
    // Um ativo com assento de licença atribuído não vai para a lixeira, e a
    // mecânica da armadilha é idêntica à do componente: a contagem de assentos
    // ocupados olha `license_seat_checkouts`, que não tem `deletedAt` e não
    // sabe que o ativo sumiu. O assento continuaria descontado do contrato para
    // sempre, e a aba Licenças que ofereceria a devolução responde 404 — a
    // empresa pagaria por um assento preso a uma máquina que não existe mais.
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
