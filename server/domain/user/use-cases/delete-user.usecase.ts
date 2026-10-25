import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import { CAMPOS_AUDITADOS_DO_USUARIO, USER_AUDIT_SELECT } from '../helpers/user-select.helper';
import { assertSobraAdministrador, travarAdministracao } from '../../access/helpers/ultimo-administrador';

/**
 * Excluir um usuário — quem opera o sistema.
 *
 * APAGA A LINHA (W): sem lixeira e sem volta — errou, cadastra de novo. A
 * sessão aberta cai na requisição seguinte, porque `current-user.usecase.ts`
 * relê a conta a cada requisição e não a encontra mais.
 *
 * Nada aponta para `users`: a auditoria guarda quem fez por escrito, sem FK
 * (AB), e a exclusão grava o retrato da conta nela.
 *
 * Usuário não responde por equipamento — quem recebe é colaborador (`Person`)
 * —, então não há posse a contar aqui. A única rede é a do último
 * administrador.
 */
/**
 * @param sessaoId quem está pedindo — o `request.user.id` da sessão, que a regra
 * da própria conta compara (W).
 */
export async function deleteUser(id: string, sessaoId: string, ator: Ator): Promise<void> {
  // NINGUÉM EXCLUI A SI MESMO (W) — como no desativar
  // (`update-user.usecase.ts`): tirar a própria conta é com outro administrador.
  if (id === sessaoId) {
    throw new AppError('Você não pode excluir a si mesmo. Peça a outro administrador.', 409);
  }

  await prisma.$transaction(async (tx) => {
    // A fila do último administrador ANTES de qualquer escrita
    // (`ultimo-administrador.ts`): dois administradores excluídos ao mesmo
    // tempo contariam "sobra o outro" e deixariam zero.
    await travarAdministracao(tx);

    // `deleteMany` e não `delete`: o id inexistente vira `count: 0` e o 404
    // abaixo, em vez do `P2025` cru do Prisma. A linha travada antes do
    // retrato: uma edição simultânea do nome não o deixa velho.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
    const antes = await tx.user.findUnique({ where: { id }, select: USER_AUDIT_SELECT });
    const { count } = await tx.user.deleteMany({ where: { id } });

    if (count === 0 || !antes) throw new AppError('Registro não encontrado', 404);

    // A conta sai DE VERDADE: o retrato é o que sobra de quem ela era.
    await recordAudit(tx, {
      entityType: 'User',
      entityId: id,
      entityLabel: antes.email,
      action: 'DELETE',
      changes: buildSnapshot(antes, CAMPOS_AUDITADOS_DO_USUARIO),
    }, ator);

    // A REDE do último administrador, como na edição (D148): apagar o único que
    // entra trancaria o sistema por fora. Com a regra de cima, só a corrida de
    // dois administradores excluindo um ao outro chega aqui.
    await assertSobraAdministrador(tx);
  });
}
