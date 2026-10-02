import type { AuthSource } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_DETAIL_SELECT } from '../../user/helpers/user-select.helper';

// O VÍNCULO EXPLÍCITO — a troca da origem da identidade (F11, Etapa I — D78).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ISTO É UMA ROTA PRÓPRIA COM `access.manage`, E NÃO UM CAMPO DO
// FORMULÁRIO DE COLABORADOR.
//
// Marcar uma conta como `OIDC` **concede um caminho de login**: a partir dali,
// quem autenticar aquele e-mail no provedor de identidade entra como essa pessoa,
// com os grupos dela. É escalonamento de privilégio com outro nome — exatamente o
// argumento que já pôs `POST /api/users/:id/set-password` em `access.manage` em
// vez de `users.edit`.
//
// Com o campo no formulário de cadastro, quem pudesse corrigir um telefone
// poderia federar a conta do administrador. Por rota própria, a operação tem
// chave própria, `ActivityLog` próprio e uma frase na tela dizendo o que ela faz.
//
// E É ELA QUE O D78 CHAMA DE "VÍNCULO EXPLÍCITO": a sincronização LDAP e o login
// por SSO recusam fundir uma conta `LOCAL` com um e-mail do diretório. O caminho
// de dizer "sim, é a mesma pessoa" passa por aqui, por alguém, com registro.
// ═════════════════════════════════════════════════════════════════════════════

export async function setAuthSource(
  userId: string,
  authSource: AuthSource,
  actorId: string | null,
) {
  const pessoa = await prisma.user.findFirst({
    where: { id: userId },
    select: { id: true, name: true, authSource: true, externalId: true, passwordHash: true },
  });
  if (!pessoa) throw new AppError('Colaborador não encontrado.', 404);

  if (pessoa.authSource === authSource) {
    // 409 e não 200 silencioso: a tela que manda isto acha que está mudando algo,
    // e um `ActivityLog` de "mudou de OIDC para OIDC" é ruído na trilha de uma
    // operação que é justamente para ser auditável.
    throw new AppError(`A origem da identidade já é ${authSource}.`, 409);
  }

  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.user.update({
      where: { id: userId },
      data: {
        authSource,
        // VOLTAR PARA `LOCAL` LIMPA O `externalId`, e isso é o oposto de zelo com
        // dado: deixá-lo gravado manteria a conta casável pelo identificador do
        // provedor — ou seja, o SSO continuaria encontrando-a pelo `oid` depois de
        // alguém ter decidido que ela não é federada. A linha some junto com a
        // decisão que a criou.
        //
        // As marcas do diretório caem pelo mesmo motivo: "sumiu do diretório" não
        // quer dizer nada para uma conta que não vem mais de diretório nenhum.
        ...(authSource === 'LOCAL'
          ? { externalId: null, directoryMissingAt: null, directorySyncedAt: null }
          : {}),
      },
      select: USER_DETAIL_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'User',
      entityId: userId,
      action: 'UPDATE',
      // O `changes` guarda o DE→PARA porque é esta a pergunta de auditoria:
      // "quem federou esta conta, e quando?".
      changes: { authSource: { de: pessoa.authSource, para: authSource } },
    }, actorId);

    return atualizada;
  });
}
