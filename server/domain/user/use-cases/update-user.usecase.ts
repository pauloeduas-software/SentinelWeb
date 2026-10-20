import { assertSobraAdministrador, travarAdministracao } from '../../access/helpers/ultimo-administrador';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';
import { hashSeHouver } from '../helpers/credencial.helper';

// Campos que o formulário edita. A lista é explícita de propósito: a rota antiga
// repassava `request.body` inteiro para o Prisma, e qualquer campo enviado a
// mais era gravado (mass assignment).
interface UpdateUserData {
  name?: string;
  email?: string;
  /** O cargo (D148). Ausente = não mexe. */
  role?: 'TECNICO' | 'ADMIN';
  /** Desativar derruba a sessão na requisição seguinte e recusa o login. */
  isActive?: boolean;
  /** "Nova senha". Ausente mantém a atual; presente troca e derruba as sessões. */
  password?: string;
}

// SEM HISTÓRICO (X): a edição de usuário não grava `ActivityLog`. Nenhuma tela
// lê a trilha de quem opera o sistema, e sem o autor ela não diria nada a mais
// que a própria linha.

/**
 * @param sessaoId quem está pedindo — o `request.user.id` da sessão, que a regra
 * da própria conta compara (W).
 */
export async function updateUser(id: string, data: UpdateUserData, sessaoId: string) {
  // O hash FORA da transação: argon2 é lento de propósito.
  const passwordHash = await hashSeHouver(data.password);

  return prisma.$transaction(async (tx) => {
    // A fila do último administrador, antes de qualquer leitura
    // (`ultimo-administrador.ts`): só quando a edição pode tirar alguém do jogo.
    if (data.role !== undefined || data.isActive === false) await travarAdministracao(tx);

    const antes = await tx.user.findFirst({ where: { id }, select: { email: true, role: true } });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // NINGUÉM TIRA A SI MESMO DO JOGO (W): rebaixar e desativar a própria conta
    // é com outro administrador (a exclusão está em `delete-user.usecase.ts`).
    // Só o administrador chega a esta rota, então mudar o próprio cargo é sempre
    // rebaixar. O cargo IGUAL ao atual passa: o formulário reenvia todo campo, e
    // corrigir o próprio nome não pode virar 409.
    if (id === sessaoId) {
      if (data.role !== undefined && data.role !== antes.role) {
        throw new AppError('Você não pode rebaixar a si mesmo. Peça a outro administrador.', 409);
      }
      if (data.isActive === false) {
        throw new AppError('Você não pode desativar a si mesmo. Peça a outro administrador.', 409);
      }
    }

    // O índice único do e-mail pegaria a colisão, mas com o "Registro já
    // existe" genérico do P2002. Conferir aqui devolve o mesmo 409 do cadastro.
    if (data.email && data.email !== antes.email) {
      const emUso = await tx.user.findFirst({ where: { email: data.email, id: { not: id } } });
      if (emUso) throw new AppError('E-mail já está em uso.', 409);
    }

    const usuario = await tx.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
        ...(passwordHash ? {
          passwordHash,
          // Trocar a senha DESTRAVA a conta: é o caminho de suporte para quem
          // se trancou fora tentando lembrar a senha antiga.
          failedLoginCount: 0,
          lockedUntil: null,
          // E DERRUBA TODA SESSÃO ABERTA da pessoa: a geração vai assinada no
          // token e é conferida a cada requisição. `increment`, não `set`: duas
          // trocas simultâneas gravariam o mesmo número com `set`.
          tokenVersion: { increment: 1 },
        } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });

    // A REDE, como ÚLTIMA instrução da transação (D148): rebaixar o único
    // administrador que entra desfaz a transação inteira. Roda sempre, e não
    // só quando `data.role` veio — o custo é um `count` e a alternativa é lembrar
    // de chamá-la em cada caminho novo que mexa em cargo.
    await assertSobraAdministrador(tx);

    return usuario;
  });
}
