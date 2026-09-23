import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../../user/helpers/user-select.helper';
import { hashSenha } from '../helpers/password.helper';
import type { ContextoDaRequisicao } from '../helpers/request-context.helper';
import { registrarEventoAuth } from './record-auth-event.usecase';

// Administrar a credencial de acesso de alguém.
//
// POR QUE O `username` ENTRA AQUI, E NÃO NO FORMULÁRIO DE USUÁRIO: o cadastro
// de colaborador existe para ENTREGAR equipamento — a maioria das pessoas do
// ITAM nunca terá conta. Dar acesso é outra decisão, e ela é feita de duas
// metades que não servem separadas: senha sem `username` não loga, e `username`
// sem senha também não. Uma rota só, uma transação só.
//
// ⚠️ SEM RBAC ATÉ A F11: qualquer sessão válida pode redefinir a senha de
// qualquer um, porque hoje todo mundo que tem login é administrador. Quando o
// papel existir, o filtro entra AQUI — é o ponto único por onde a senha muda.

export interface SetPasswordData {
  password: string;
  username?: string;
}

export async function setUserPassword(
  id: string,
  data: SetPasswordData,
  actorId: string | null,
  ctx?: ContextoDaRequisicao,
) {
  // O hash fica FORA da transação: argon2 leva ~50 ms e segurar uma conexão do
  // pool durante o cálculo é transformar redefinição de senha em fila de banco.
  const passwordHash = await hashSenha(data.password);

  const resultado = await prisma.$transaction(async (tx) => {
    const alvo = await tx.user.findFirst({ where: { id }, select: { id: true, username: true } });
    if (!alvo) throw new AppError('Registro não encontrado', 404);

    const username = data.username ?? alvo.username;
    if (!username) {
      throw new AppError('Este usuário ainda não tem nome de acesso: informe "username".', 422);
    }

    // O índice único do `username` é PARCIAL e o Prisma não o conhece: a colisão
    // voltaria como erro cru do banco (409 "Registro já existe", que não diz o
    // quê). `findFirst` passa pelo escopo da lixeira, então só colide com vivos.
    if (username !== alvo.username) {
      const emUso = await tx.user.findFirst({ where: { username, id: { not: id } }, select: { id: true } });
      if (emUso) throw new AppError('Este nome de acesso já está em uso.', 409);
    }

    const usuario = await tx.user.update({
      where: { id },
      data: {
        username,
        passwordHash,
        // Redefinir a senha DESTRAVA a conta: é o caminho de suporte para quem
        // se trancou fora tentando lembrar a senha antiga.
        failedLoginCount: 0,
        lockedUntil: null,
        // E DERRUBA TODA SESSÃO ABERTA daquele usuário.
        //
        // Sem esta linha, trocar a senha não expulsava ninguém: a releitura por
        // requisição só barra quem foi apagado ou desligado, e quem tivesse
        // roubado o cookie continuava sendo um usuário válido e ativo. Ou seja,
        // o gesto que a vítima faz ao desconfiar — trocar a senha — não tinha
        // efeito nenhum sobre o invasor, que seguia dentro pelas 8 horas do TTL.
        //
        // `increment`, não `set`: duas redefinições simultâneas leriam o mesmo
        // valor e gravariam o mesmo número, e uma das duas não invalidaria nada.
        // O incremento é resolvido pelo Postgres, na linha já travada pelo update.
        tokenVersion: { increment: 1 },
      },
      select: USER_PUBLIC_SELECT,
    });

    // O QUE mudou, nunca o VALOR. Hash em trilha de auditoria é o mesmo
    // vazamento do log com senha, só que permanente e com data — e um
    // `ActivityLog` costuma ser lido por mais gente do que o banco.
    await recordActivity(
      tx,
      {
        entityType: 'User',
        entityId: id,
        action: 'UPDATE',
        changes: { credencial: 'senha definida', username },
      },
      actorId,
    );

    return { usuario, username };
  });

  // FORA da transação, de propósito: a trilha de autenticação não pode sumir
  // num rollback, e o `registrarEventoAuth` engole o próprio erro — dentro da
  // transação, uma falha ao gravar o evento arriscaria desfazer a troca de senha
  // que já deu certo.
  //
  // O evento registra a pessoa cuja senha MUDOU (e cujas sessões acabaram de
  // cair), não quem mandou mudar: quem mandou já está no `ActivityLog` acima,
  // como ator. São duas perguntas diferentes e cada uma tem o seu lugar.
  await registrarEventoAuth({
    type: 'PASSWORD_CHANGED',
    userId: id,
    username: resultado.username,
    ctx,
  });

  return resultado.usuario;
}
