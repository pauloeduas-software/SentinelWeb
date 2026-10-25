import { AppError } from '../../../core/errors/app-error';
import { recordAuditDoQueJaAconteceu } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { rodarReconciliacao, type ResultadoDaVarredura } from '../jobs/reconcile.job';

/**
 * O "Reconciliar agora" da tela: a mesma rodada do job, com a conta que pediu
 * na auditoria (AB).
 *
 * A linha diz QUEM PEDIU a rodada; o que ela vinculou sozinha continua
 * assinado pelo sistema (`job:reconciliacao`), porque quem decidiu cada vínculo
 * foi a regra da descoberta em `ON`, não a conta. Gravada DEPOIS, com o placar:
 * a rodada recusada por já haver outra em andamento não aconteceu.
 *
 * A rodada que QUEBROU no meio também grava, sem placar: os vínculos que ela já
 * fez estão no banco, assinados pelo sistema, e sem esta linha ninguém saberia
 * que foi uma conta que a pediu, e não o horário do job.
 *
 * Nos dois casos a gravação que falhar não muda a resposta: a rodada terminada
 * não vira 500, e a que quebrou sobe com o erro DELA, não com o da auditoria.
 */
export async function reconciliarAgora(ator: Ator): Promise<ResultadoDaVarredura> {
  let resultado: ResultadoDaVarredura;
  try {
    resultado = await rodarReconciliacao();
  } catch (erro) {
    if (!(erro instanceof AppError && erro.status === 409)) {
      await recordAuditDoQueJaAconteceu({
        entityType: 'Reconciliation', entityId: null, entityLabel: 'Reconciliação', action: 'RUN',
        changes: { concluida: false },
      }, ator);
    }
    throw erro;
  }

  await recordAuditDoQueJaAconteceu({
    entityType: 'Reconciliation',
    entityId: null,
    entityLabel: 'Reconciliação',
    action: 'RUN',
    changes: { ...resultado },
  }, ator);

  return resultado;
}
