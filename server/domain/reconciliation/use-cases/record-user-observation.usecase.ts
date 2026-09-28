import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { normalizeUserKey } from '../helpers/normalize-identity.helper';
import { casarPessoa } from '../helpers/match-user.helper';

const logger = createLogger('reconciliation.observacao');

// QUEM ESTAVA LOGADO, AGREGADO POR DIA — o D49 em operação.
//
// Chamado no handshake, que é o ÚNICO tipo de mensagem que carrega o usuário
// logado. Não é o caminho quente: handshake acontece quando o agente sobe ou
// ressincroniza, não a cada amostra de telemetria — o `touchEndpoint` é que roda
// a cada mensagem, e ele continua tocando só `endpoints`.
//
// Uma linha por (máquina, conta, dia), com primeira hora, última hora e
// contagem. Uma linha por MENSAGEM seria a armadilha que o `AssetUsageDaily`
// evita, e seria também um rastro minuto a minuto de uma pessoa — que é mais
// dado do que a pergunta exige e mais do que este sistema se propõe a guardar.

/** Meia-noite UTC do dia do instante: a chave `@db.Date` da agregação. */
function diaDe(instante: Date): Date {
  return new Date(Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate()));
}

/**
 * Registra a observação e tenta identificar a pessoa.
 *
 * **Falha de propósito em silêncio (com log).** Esta função roda dentro do
 * tratamento do handshake, e a observação de usuário é um EXTRA: se ela
 * estourar, o que não pode acontecer é a máquina deixar de aparecer no painel
 * porque o nome do usuário veio estranho. O inventário é o trabalho; a
 * observação é a inferência em cima dele.
 *
 * O `userId` é gravado quando o casamento é inequívoco e fica `null` quando não
 * é — e a linha existe mesmo assim, de propósito: é ela que denuncia a conta de
 * serviço que precisa entrar na allowlist (D101). Sem a linha, a conta que não
 * casa com ninguém seria invisível justamente para quem precisa configurá-la.
 */
export async function registrarUsuarioObservado(endpointId: string, loggedOnUser: string | null): Promise<void> {
  const userKey = normalizeUserKey(loggedOnUser);
  if (!userKey) return;

  try {
    const agora = new Date();
    const day = diaDe(agora);

    // ── OS CANDIDATOS, e não o cadastro inteiro ───────────────────────────────
    //
    // Esta consulta carregava TODOS os usuários a cada handshake, para comparar
    // duas strings. Numa empresa de 2.000 pessoas eram 2.000 linhas trafegadas
    // por handshake de cada máquina, para responder "quem é ana.silva".
    //
    // O filtro reproduz os dois sinais do `casarPessoa` — `username` igual ou
    // parte local do e-mail igual — e **preserva a detecção de ambiguidade**: se
    // duas pessoas casam pela mesma chave, as duas entram neste recorte e é o
    // helper puro que decide que a resposta é "não sei" (D46). Filtrar por
    // `take: 1` é que romperia a regra, e é justamente o que não está aqui.
    //
    // `mode: 'insensitive'` nos dois porque o helper compara em minúsculas: sem
    // isso, `ANA.SILVA` no Windows deixaria de casar com `ana.silva` no cadastro
    // — e o filtro teria mudado o resultado, que é o que um filtro de desempenho
    // nunca pode fazer.
    //
    // A lixeira continua escopada pela extension: pessoa excluída não casa, e é
    // o certo — sugerir posse para quem foi apagado do cadastro seria
    // ressuscitar um vínculo que alguém desfez de propósito.
    const candidatos = await prisma.user.findMany({
      where: {
        OR: [
          { username: { equals: userKey, mode: 'insensitive' } },
          { email: { startsWith: `${userKey}@`, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, username: true },
    });
    const pessoa = casarPessoa(userKey, candidatos);

    await prisma.endpointUserDaily.upsert({
      where: { endpointId_userKey_day: { endpointId, userKey, day } },
      update: {
        lastSeenAt: agora,
        samples: { increment: 1 },
        // O casamento é reavaliado a cada observação: a pessoa pode ter ganhado
        // `username` no cadastro entre o handshake de ontem e o de hoje.
        userId: pessoa?.userId ?? null,
      },
      create: {
        endpointId,
        userKey,
        userId: pessoa?.userId ?? null,
        day,
        firstSeenAt: agora,
        lastSeenAt: agora,
      },
    });
  } catch (error) {
    logger.error(`[Observação] Falha ao registrar usuário de ${endpointId}:`, error);
  }
}

/**
 * O EXPURGO. Dado de pessoa com prazo, e o prazo é configurável (D49).
 *
 * `deleteMany` e não soft delete: aqui apagar é o ponto. Guardar "quem esteve em
 * qual máquina" para sempre seria construir exatamente o histórico que a
 * decisão diz não construir.
 */
export async function expurgarObservacoesAntigas(diasDeRetencao: number): Promise<number> {
  const limite = new Date(Date.now() - diasDeRetencao * 24 * 60 * 60 * 1000);
  const { count } = await prisma.endpointUserDaily.deleteMany({ where: { day: { lt: limite } } });
  if (count > 0) logger.info(`[Observação] ${count} registro(s) de uso expurgado(s) (retenção: ${diasDeRetencao} dias).`);
  return count;
}
