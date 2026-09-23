import type { AuthEventType } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import type { ContextoDaRequisicao } from '../helpers/request-context.helper';

const logger = createLogger('auth-event');

// QUEM TENTOU ENTRAR, DE ONDE, E NO QUE DEU.
//
// O sistema tinha `ActivityLog` para tudo que muda num ativo e NADA para o
// acesso em si: não havia como responder "alguém tentou entrar na conta do
// fulano no fim de semana?" — que em inventário de TI é a primeira pergunta de
// qualquer incidente. Esta é a metade que faltava.
//
// Ver o `model AuthEvent` em prisma/schema.prisma para por que é tabela própria
// e não mais uma linha de `ActivityLog`.

export interface EventoDeAuth {
  type: AuthEventType;
  /** Nulo quando a tentativa não casou com conta nenhuma — o caso mais interessante. */
  userId?: string | null;
  /** O que foi DIGITADO. Pode não existir como conta, e é esse o dado da varredura. */
  username?: string | null;
  ctx?: ContextoDaRequisicao;
}

/**
 * Grava o evento e NUNCA derruba o fluxo de autenticação.
 *
 * O `catch` é a decisão inteira: se a trilha falhar (tabela cheia, banco em
 * failover), a alternativa seria 500 no login — trocar uma perda de auditoria
 * por uma indisponibilidade total do sistema. O erro vai para o log da
 * aplicação, que é onde alguém vê que a trilha parou.
 *
 * Não recebe `tx` de propósito: o evento precisa sobreviver à transação que o
 * originou. Um LOGIN_FAIL gravado dentro da transação que dá rollback some
 * junto — e é exatamente o registro que não pode sumir.
 */
export async function registrarEventoAuth({
  type,
  userId = null,
  username = null,
  ctx,
}: EventoDeAuth): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        type,
        userId,
        username,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
      },
    });
  } catch (erro) {
    logger.error(`[AuthEvent] Falha ao registrar ${type}:`, erro);
  }
}
