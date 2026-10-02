import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { assertSobraAdministrador } from '../helpers/ultimo-administrador';

// DE QUAIS GRUPOS UMA PESSOA PARTICIPA — substituição da lista inteira.
//
// `set` do Prisma, e não `connect`/`disconnect`: a tela manda a lista completa
// de caixas marcadas, e `set` é a única operação que diz exatamente isso. Com
// `connect` + `disconnect` calculados aqui, duas abas abertas na mesma pessoa
// aplicariam dois deltas e o resultado dependeria da ordem de chegada — cada
// uma "acertaria" o seu e desfaria o da outra pela metade.

export async function setUserGroups(
  userId: string,
  groupIds: string[],
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // `findFirst` pelo escopo da lixeira: dar acesso a um cadastro apagado
    // escreveria permissão sobre alguém que nenhuma tela enxerga.
    const antes = await tx.user.findFirst({
      where: { id: userId },
      select: { id: true, name: true, groups: { select: { id: true, name: true } } },
    });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // Os ids inexistentes são recusados ANTES do `set`, com a contagem: o
    // `connect` do Prisma estouraria com P2025 e a mensagem genérica de
    // "registro relacionado não encontrado" não diz QUAL grupo sumiu — e o caso
    // real é uma aba aberta há meia hora, com um grupo que outra pessoa apagou
    // nesse meio-tempo.
    const unicos = [...new Set(groupIds)];
    if (unicos.length > 0) {
      const existentes = await tx.group.findMany({
        where: { id: { in: unicos } },
        select: { id: true },
      });
      if (existentes.length !== unicos.length) {
        const achados = new Set(existentes.map((grupo) => grupo.id));
        throw new AppError('Um dos grupos escolhidos não existe mais. Recarregue a tela.', 409, {
          ausentes: unicos.filter((id) => !achados.has(id)),
        });
      }
    }

    const depois = await tx.user.update({
      where: { id: userId },
      data: { groups: { set: unicos.map((id) => ({ id })) } },
      select: { id: true, name: true, groups: { select: { id: true, name: true } } },
    });

    const nomesAntes = antes.groups.map((grupo) => grupo.name).sort();
    const nomesDepois = depois.groups.map((grupo) => grupo.name).sort();

    // SÓ REGISTRA SE MUDOU. Salvar a tela sem tocar nas caixas é o gesto mais
    // comum do mundo, e um `UPDATE` no log a cada um deles enterraria as
    // mudanças reais de acesso — que são exatamente o que alguém vem procurar
    // aqui.
    if (nomesAntes.join('\u0000') !== nomesDepois.join('\u0000')) {
      await recordActivity(tx, {
        // `entityType: 'User'` e não `'Group'`: a pergunta é "o que mudou no
        // acesso DESTA pessoa", e é na linha do tempo dela que isto tem que
        // aparecer — ao lado do desligamento e da troca de senha.
        entityType: 'User',
        entityId: userId,
        action: 'UPDATE',
        changes: {
          grupos: { de: nomesAntes, para: nomesDepois },
          entrou: nomesDepois.filter((nome) => !nomesAntes.includes(nome)),
          saiu: nomesAntes.filter((nome) => !nomesDepois.includes(nome)),
        },
      }, actorId);
    }

    await assertSobraAdministrador(tx);
    return depois;
  });
}
