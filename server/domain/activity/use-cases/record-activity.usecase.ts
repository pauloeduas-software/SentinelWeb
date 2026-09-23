import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';

// Trilha de auditoria — o *Activity Report* do Snipe-IT.
//
// `actorId` é opcional porque autenticação é a Fase 3. O log nasce agora, sem
// ator, em vez de esperar: o diff do que mudou tem valor sozinho, e perder o
// histórico de tudo que for cadastrado até a F3 não se recupera depois.
// Quando o login entrar, é só passar `request.user.id` aqui.

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface RecordActivityInput {
  entityType: string;
  entityId: string;
  action: ActivityAction;
  changes?: Prisma.InputJsonValue | null;
  actorId?: string | null;
}

/**
 * Aceita o cliente da transação para o log e a operação caírem JUNTOS: gravado
 * fora da transação, o histórico registraria uma edição que depois falhou.
 */
type ClienteComActivityLog = Pick<typeof prisma, 'activityLog'>;

export async function recordActivity(
  client: ClienteComActivityLog,
  input: RecordActivityInput,
): Promise<void> {
  await client.activityLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      changes: input.changes ?? undefined,
      actorId: input.actorId ?? null,
    },
  });
}
