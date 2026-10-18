import { assertSobraAdministrador, travarAdministracao } from '../../access/helpers/ultimo-administrador';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';
import { contarPosseAberta, motivoParaRecusar } from './count-user-posse.usecase';
import { travarUsuarioOuFalhar } from './lock-user.usecase';
import { assertTemSenha, hashSeHouver, cargoEntraNoSistema } from '../helpers/credencial.helper';

// Campos que o formulário edita. A lista é explícita de propósito: a rota antiga
// repassava `request.body` inteiro para o Prisma, e qualquer campo enviado a
// mais era gravado (mass assignment).
interface UpdateUserData {
  name?: string;
  email?: string;
  /** O cargo (D148). Ausente = não mexe. */
  role?: 'USUARIO' | 'TECNICO' | 'ADMIN';
  /** Desativar impede entrega nova e derruba a sessão na requisição seguinte. */
  isActive?: boolean;
  /** "Nova senha". Ausente mantém a atual; presente troca e derruba as sessões. */
  password?: string;
}

// O DIFF É SOBRE O QUE FOI GRAVADO, e `isActive` entra nele: "desativado em tal
// dia, por tal pessoa" é a pergunta que a coluna de data respondia antes, e o
// log responde melhor — ele tem o ator.
const CAMPOS_AUDITADOS = ['name', 'email', 'role', 'isActive'] as const;

/**
 * O select do DIFF — o público mais os campos auditados.
 *
 * Não é o `USER_PUBLIC_SELECT`: ele não traz `role` nem `isActive`, e
 * `buildChanges` comparando um campo que o "antes" não tem marcaria como
 * alterado tudo que foi enviado. É a mesma armadilha que o
 * `CatalogSpec.select` documenta ("precisa conter todo campo de `audited`").
 */
const SELECT_DO_DIFF = {
  id: true, name: true, email: true, role: true, isActive: true,
} as const;

export async function updateUser(id: string, data: UpdateUserData, actorId: string | null) {
  // O hash FORA da transação: argon2 é lento de propósito.
  const passwordHash = await hashSeHouver(data.password);

  return prisma.$transaction(async (tx) => {
    // DESATIVAR TRAVA A LINHA antes de qualquer leitura — a mesma trava da
    // entrega, e a primeira instrução da transação (`lock-user.usecase.ts`).
    // Sem ela, uma entrega simultânea lê `isActive: true`, a contagem abaixo não
    // vê a posse que ainda não foi confirmada, e a pessoa termina desativada com
    // um equipamento no nome.
    // A fila do último administrador vem antes de qualquer trava de linha
    // (`ultimo-administrador.ts`): só quando a edição pode tirar alguém do jogo.
    if (data.role !== undefined || data.isActive === false) await travarAdministracao(tx);
    if (data.isActive === false) await travarUsuarioOuFalhar(tx, id);

    const antes = await tx.user.findFirst({ where: { id }, select: SELECT_DO_DIFF });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // DESATIVADO NÃO RESPONDE POR NADA (invariante 6). A mesma recusa da
    // exclusão, e pelo mesmo motivo: quem sai da empresa não pode sair levando
    // ativo, assento, unidade de estoque ou posto no nome — a desativação o
    // tira dos seletores, e a posse que ficasse aberta não teria mais quem a
    // devolvesse pela tela.
    if (data.isActive === false && antes.isActive) {
      const motivo = motivoParaRecusar(await contarPosseAberta(tx, id), 'desativar');
      if (motivo) throw new AppError(motivo, 409);
    }

    // QUEM PASSA A ENTRAR PRECISA DE SENHA. Promover a Técnico alguém que nunca
    // teve senha, sem dar uma, criaria um operador que não consegue entrar.
    // Só quando o cargo MUDA para um que entra: desativar, reativar ou corrigir o
    // nome de quem já tem o cargo não é hora de cobrar a senha.
    if (data.role !== undefined && data.role !== antes.role && cargoEntraNoSistema(data.role) && !passwordHash) {
      const atual = await tx.user.findFirst({ where: { id }, select: { passwordHash: true } });
      assertTemSenha(data.role, atual?.passwordHash != null);
    }

    // O índice único do e-mail é parcial e o Prisma não o conhece: a colisão
    // viria como erro cru do banco. Conferir aqui devolve o mesmo 409 do cadastro.
    if (data.email && data.email !== antes.email) {
      const emUso = await tx.user.findFirst({ where: { email: data.email, id: { not: id } } });
      if (emUso) throw new AppError('E-mail já está em uso.', 409);
    }

    const depois = await tx.user.update({
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
      select: SELECT_DO_DIFF,
    });

    const changes = {
      ...buildChanges(antes, depois, CAMPOS_AUDITADOS),
      // O QUE mudou, nunca o VALOR (o hash não vai para a trilha).
      ...(passwordHash ? { credencial: 'senha redefinida' } : {}),
    };
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, { entityType: 'User', entityId: id, action: 'UPDATE', changes }, actorId);
    }

    // A REDE, como ÚLTIMA instrução antes da leitura de saída (D148): rebaixar o
    // único administrador que entra desfaz a transação inteira. Roda sempre, e não
    // só quando `data.role` veio — o custo é um `count` e a alternativa é lembrar
    // de chamá-la em cada caminho novo que mexa em cargo.
    await assertSobraAdministrador(tx);

    // Devolve pelo select PÚBLICO, não pelo do diff: o cliente recebe o mesmo
    // formato de toda rota que devolve usuário, e os campos de auditoria não
    // vazam por aqui.
    return tx.user.findFirstOrThrow({ where: { id }, select: USER_PUBLIC_SELECT });
  });
}
