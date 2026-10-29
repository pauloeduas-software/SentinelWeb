import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { ASSET_WRITE_SELECT } from '../helpers/asset-select.helper';
import { travarAtivoOuFalhar } from './lock-asset.usecase';

/**
 * DESFAZER a baixa — a venda não saiu, o equipamento "roubado"
 * apareceu, alguém clicou errado.
 *
 * Existe por simetria com a restauração da lixeira e pelo mesmo motivo: a
 * operação que só vai para um lado transforma um clique errado em um registro
 * que ninguém conserta sem `psql`.
 *
 * Limpa as TRÊS colunas. `retiredAt` sem `retiredReason` seria "saiu do
 * patrimônio, não se sabe por quê", e o contrário seria um motivo de saída para
 * um ativo que não saiu — dois estados que nenhuma tela saberia mostrar. A
 * observação vai junto: ela explicava a baixa que acabou de ser desfeita.
 *
 * Não tem guarda de posse: um ativo que volta ao patrimônio não contradiz nada.
 * A guarda existe na ida (`assert-sem-posse.usecase.ts`), que é onde o
 * inventário perderia o rastro de quem está com o equipamento.
 */
export async function unretireAsset(id: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    // A trava ANTES de ler, a mesma da baixa: sem ela, um duplo clique gravava
    // dois UNRETIRE, e uma reversão atrasada podia apagar uma baixa NOVA feita
    // no meio — com o histórico dizendo de onde ele voltou errado.
    await travarAtivoOuFalhar(tx, id);

    const antes = await tx.asset.findFirst({
      where: { id },
      select: { id: true, assetTag: true, retiredAt: true, retiredReason: true, retiredNotes: true },
    });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    if (!antes.retiredAt) {
      throw new AppError(`${antes.assetTag} não teve baixa.`, 409);
    }

    const depois = await tx.asset.update({
      where: { id },
      data: { retiredAt: null, retiredReason: null, retiredNotes: null },
      select: ASSET_WRITE_SELECT,
    });

    await recordAudit(tx, {
      entityType: 'Asset',
      entityId: id,
      entityLabel: antes.assetTag,
      action: 'UNRETIRE',
      // O diff guarda DE ONDE ele voltou: sem isso, a auditoria diria "voltou
      // ao patrimônio" sem dizer como vendido ou como roubado ele estava — e é
      // justamente essa a pergunta de quem audita a reversão.
      changes: buildChanges(antes, depois, ['retiredAt', 'retiredReason', 'retiredNotes']),
    }, ator);

    return depois;
  });
}
