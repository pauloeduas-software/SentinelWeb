import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarPosseAberta, motivoParaNaoExcluir } from './count-user-posse.usecase';
import { travarUsuarioOuFalhar } from './lock-user.usecase';

/**
 * Lixeira do colaborador — e o 409 que protege as DUAS pontas da posse (D32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A RECUSA É DE APLICAÇÃO, E NÃO DO BANCO
 *
 * `Assignment.targetUserId` e `LocationOccupant.userId` são `onDelete: Restrict`
 * no schema, o que parece resolver — e não resolve. Apagar um usuário aqui é
 * `UPDATE users SET deleted_at = now()`: o Postgres não vê `DELETE` nenhum, a
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
 * A saída que o 409 ensina é o DESLIGAMENTO (`POST /api/users/:id/offboard`),
 * não um `DELETE` com força: são coisas diferentes. Desligar fecha as duas
 * camadas e preserva o histórico; a lixeira é para cadastro criado errado.
 */
export async function deleteUser(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // A TRAVA vem antes da contagem, e é o que torna a contagem confiável: sem
    // ela, uma entrega simultânea cria a posse DEPOIS deste `count` e o
    // colaborador vai para a lixeira levando um equipamento no nome — o 409
    // que este bloco existe para dar simplesmente não dispara
    // (`lock-user.usecase.ts`).
    await travarUsuarioOuFalhar(tx, id);

    // Antes de qualquer escrita: recusar depois de apagar seria contar com o
    // rollback para desfazer o que nem devia ter começado.
    const posse = await contarPosseAberta(tx, id);
    const motivo = motivoParaNaoExcluir(posse);
    if (motivo) {
      // Os dois números também nos `details`, além da frase: a tela precisa
      // decidir se abre o modal de desligamento (há o que fechar) sem reparsear
      // a mensagem em português.
      throw new AppError(motivo, 409, {
        ativosEmPosse: posse.ativosEmPosse,
        postosOcupados: posse.postosOcupados,
      });
    }

    const { count } = await tx.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) throw new AppError('Registro não encontrado', 404);

    await recordActivity(tx, { entityType: 'User', entityId: id, action: 'DELETE' }, actorId);
  });
}
