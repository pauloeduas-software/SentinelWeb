import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { assertSobraAdministrador, travarAdministracao } from '../../access/helpers/ultimo-administrador';
import { contarPosseAberta, motivoParaRecusar } from './count-user-posse.usecase';
import { travarUsuarioOuFalhar } from './lock-user.usecase';

/**
 * Lixeira do colaborador — e o 409 que protege as DUAS pontas da posse (D32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A RECUSA É DE APLICAÇÃO, E NÃO DO BANCO
 *
 * `Assignment.targetUserId` e `LocationOccupant.userId` são `onDelete: Restrict`
 * no schema, o que parece resolver — e não resolve. Apagar um usuário aqui é
 * `UPDATE users SET "deletedAt" = now()`: o Postgres não vê `DELETE` nenhum, a
 * FK não é consultada e a rede NÃO EXISTE. É o primeiro dos dois pontos cegos
 * do soft delete, e ele cai exatamente aqui.
 *
 * Sem esta checagem, apagar a Laura some com ela da tela mantendo intactas as
 * posses e as ocupações dela — e a Camada 3 continua devolvendo o nome de uma
 * pessoa que nenhuma listagem mais mostra.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A contagem roda DENTRO da transação que apaga: contar fora deixaria uma
 * janela entre a contagem e o `UPDATE` em que uma entrega nova passaria — e o
 * ativo terminaria no nome de um cadastro na lixeira.
 *
 * A saída que o 409 ensina é DEVOLVER o que está com a pessoa e ENCERRAR as
 * ocupações dela, não um `DELETE` com força: são coisas diferentes. Fechar a
 * posse preserva o histórico; a lixeira é para cadastro criado errado.
 */
export async function deleteUser(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A TRAVA vem antes da contagem, e é o que torna a contagem confiável: sem
    // ela, uma entrega simultânea cria a posse DEPOIS deste `count` e o
    // colaborador vai para a lixeira levando um equipamento no nome — o 409
    // que este bloco existe para dar simplesmente não dispara
    // (`lock-user.usecase.ts`).
    // A fila do último administrador primeiro, depois a linha do usuário — a
    // mesma ordem da edição (`ultimo-administrador.ts`).
    await travarAdministracao(tx);
    await travarUsuarioOuFalhar(tx, id);

    // Antes de qualquer escrita: recusar depois de apagar seria contar com o
    // rollback para desfazer o que nem devia ter começado.
    const motivo = motivoParaRecusar(await contarPosseAberta(tx, id), 'excluir');
    if (motivo) throw new AppError(motivo, 409);

    const { count } = await tx.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) throw new AppError('Registro não encontrado', 404);

    await recordActivity(tx, { entityType: 'User', entityId: id, action: 'DELETE' }, actorId);

    // A REDE do último administrador, como na edição (D148): apagar o único que
    // entra — inclusive a si mesmo — trancaria o sistema por fora.
    await assertSobraAdministrador(tx);
  });
}
